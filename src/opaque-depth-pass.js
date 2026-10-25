import * as T from 'three';

// Reuse the normal frame's depth attachment. Cloth keeps its own deformation
// shader in this pass; the colour pass retains all lights and material lobes.
export function createOpaqueDepthPass(renderer) {
  const fallback=new Map(),invariants=new WeakSet();
  function invariant(material) {
    if(invariants.has(material))return;
    invariants.add(material);
    const before=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=function(shader,r){
      before.call(this,shader,r);
      // Identical clip-position expressions must rasterize identically in
      // the depth and colour programs, including MSAA silhouette samples.
      shader.vertexShader='invariant gl_Position;\n'+shader.vertexShader;
    };
    material.customProgramCacheKey=()=>key+'-invariant-position';
    material.needsUpdate=true;
  }
  function depthFor(mesh,material) {
    let depth=mesh.customDepthMaterial;
    if(!depth) {
      depth=fallback.get(material);
      if(!depth){depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:material.side});fallback.set(material,depth);}
    }
    invariant(material);invariant(depth);
    return depth;
  }
  return {
    render(scene,camera,draw=(s,c)=>renderer.render(s,c)) {
      // A prepass must use the exact same coverage as the colour pass. Other
      // coverage/depth modes retain the ordinary renderer path.
      if(!renderer.autoClear||!renderer.autoClearColor||!renderer.autoClearDepth||scene.overrideMaterial||(scene.background&&!scene.background.isColor))return draw(scene,camera);
      const objects=[];let safe=true;
      scene.traverseVisible(mesh=>{
        if(!mesh.isMesh)return;
        const m=mesh.material;
        if(Array.isArray(m)||m.transparent||m.alphaTest||m.alphaHash||m.alphaMap||m.alphaToCoverage||m.displacementMap||m.wireframe||m.polygonOffset||!m.depthTest||!m.depthWrite||m.depthFunc!==T.LessEqualDepth||m.stencilWrite||m.clippingPlanes?.length){safe=false;return;}
        if(m.visible)objects.push({mesh,material:m});
      });
      if(!safe||!objects.length)return draw(scene,camera);
      const shadowUpdate=renderer.shadowMap.autoUpdate,shadowNeedsUpdate=renderer.shadowMap.needsUpdate,autoClear=renderer.autoClear,background=scene.background,states=new Map();
      let colourDrawn=false;
      try {
        for(const object of objects) {
          const depth=depthFor(object.mesh,object.material);
          if(!states.has(depth))states.set(depth,{colorWrite:depth.colorWrite,side:depth.side,visible:depth.visible});
          depth.colorWrite=false;depth.side=object.material.side;depth.visible=true;object.mesh.material=depth;
        }
        // The ordinary colour draw still refreshes every moving caster's
        // shadow map. Never draw shadows with colour writes disabled.
        renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;
        draw(scene,camera);
        for(const {mesh,material} of objects)mesh.material=material;
        for(const [depth,state] of states)Object.assign(depth,state);
        renderer.shadowMap.autoUpdate=shadowUpdate;renderer.shadowMap.needsUpdate=shadowNeedsUpdate;
        // Three resolves multisample colour after each render and may discard
        // its source colour buffer. Clear colour explicitly while preserving
        // depth, so HDR/MSAA captures never depend on that discarded content.
        renderer.clearColor();
        scene.background=null;renderer.autoClear=false;
        draw(scene,camera);colourDrawn=true;
      } finally {
        for(const {mesh,material} of objects)mesh.material=material;
        for(const [depth,state] of states)Object.assign(depth,state);
        renderer.shadowMap.autoUpdate=shadowUpdate;
        if(!colourDrawn)renderer.shadowMap.needsUpdate=shadowNeedsUpdate;
        renderer.autoClear=autoClear;scene.background=background;
      }
    },
    dispose(){for(const material of fallback.values())material.dispose();fallback.clear();},
  };
}
