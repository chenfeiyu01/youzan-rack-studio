import * as THREE from 'three';

// Fade the photographed scene, rather than every overlapping cloth surface.
// Each capture keeps ordinary opaque depth testing, including inside sleeves.
export class FocusTransition {
  constructor(renderer,drawScene=(scene,camera)=>renderer.render(scene,camera)) {
    this.renderer=renderer;this.drawScene=drawScene;
    const options={type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:false,samples:Math.min(4,renderer.capabilities.maxSamples)};
    this.rack=new THREE.WebGLRenderTarget(1,1,options);
    this.piece=new THREE.WebGLRenderTarget(1,1,options);
    this.size=new THREE.Vector2();
    this.clearColor=new THREE.Color();
    this.uniforms={rackImage:{value:this.rack.texture},pieceImage:{value:this.piece.texture},focusMix:{value:0},backgroundColor:{value:new THREE.Color()}};
    this.material=new THREE.ShaderMaterial({
      name:'Opaque garment transition',uniforms:this.uniforms,depthTest:false,depthWrite:false,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`uniform sampler2D rackImage;uniform sampler2D pieceImage;uniform float focusMix;uniform vec3 backgroundColor;varying vec2 vUv;
        void main(){
          vec4 image=mix(texture2D(rackImage,vUv),texture2D(pieceImage,vUv),focusMix);
          gl_FragColor=vec4(image.rgb/max(image.a,.000001),1.);
          #include <tonemapping_fragment>
          gl_FragColor.rgb=mix(backgroundColor,gl_FragColor.rgb,image.a);
          #include <colorspace_fragment>
        }`,
    });
    this.geometry=new THREE.PlaneGeometry(2,2);
    this.quad=new THREE.Mesh(this.geometry,this.material);
    this.quad.frustumCulled=false;
    this.output=new THREE.Scene();this.output.add(this.quad);
    this.camera=new THREE.Camera();
  }
  prepare(scene,camera,fading) {
    // Compile both HDR captures and the output while the loading veil is up,
    // so the first click does not trigger a new set of cloth shader programs.
    this.render(scene,camera,fading,.5);
    this.drawScene(scene,camera);
  }
  render(scene,camera,fading,focus) {
    const renderer=this.renderer;
    if(focus<=1/1024||focus>=1-1/1024){this.drawScene(scene,camera);return;}
    renderer.getDrawingBufferSize(this.size);
    if(this.rack.width!==this.size.x||this.rack.height!==this.size.y){
      this.rack.setSize(this.size.x,this.size.y);this.piece.setSize(this.size.x,this.size.y);
    }
    const target=renderer.getRenderTarget(),visible=fading.map(object=>object.visible),background=scene.background,clearAlpha=renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    try {
      // Three's flat background color bypasses exposure and tone mapping.
      // Capture geometry over transparent black, then restore that same color
      // after tone mapping, including anti-aliased garment silhouette pixels.
      this.uniforms.backgroundColor.value.copy(background?.isColor?background:this.clearColor);
      if(background?.isColor)scene.background=null;
      renderer.setClearColor(0,0);
      fading.forEach(object=>{object.visible=true;});
      renderer.setRenderTarget(this.rack);this.drawScene(scene,camera);
      fading.forEach(object=>{object.visible=false;});
      renderer.setRenderTarget(this.piece);this.drawScene(scene,camera);
      this.uniforms.focusMix.value=focus;
      renderer.setRenderTarget(target);renderer.render(this.output,this.camera);
    } finally {
      fading.forEach((object,i)=>{object.visible=visible[i];});
      scene.background=background;renderer.setClearColor(this.clearColor,clearAlpha);
      renderer.setRenderTarget(target);
    }
  }
  dispose(){this.rack.dispose();this.piece.dispose();this.geometry.dispose();this.material.dispose();}
}
