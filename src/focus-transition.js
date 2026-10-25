import * as THREE from 'three';

// Photograph the selected piece separately so depth of field never softens
// its fabric or print. The quiet rack backdrop is cached once the camera rests.
export class FocusTransition {
  constructor(renderer,drawScene=(scene,camera)=>renderer.render(scene,camera),backdrop=[]) {
    this.renderer=renderer;this.drawScene=drawScene;this.backdrop=backdrop;this.backgroundKey=null;
    const options={type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:false,samples:Math.min(4,renderer.capabilities.maxSamples)};
    this.rack=new THREE.WebGLRenderTarget(1,1,options);this.piece=new THREE.WebGLRenderTarget(1,1,options);
    this.size=new THREE.Vector2();this.clearColor=new THREE.Color();
    this.uniforms={rackImage:{value:this.rack.texture},pieceImage:{value:this.piece.texture},focusMix:{value:0},pixelSize:{value:new THREE.Vector2()},backgroundColor:{value:new THREE.Color()}};
    this.material=new THREE.ShaderMaterial({
      name:'Sharp garment over soft studio',uniforms:this.uniforms,depthTest:false,depthWrite:false,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`uniform sampler2D rackImage;uniform sampler2D pieceImage;uniform float focusMix;uniform vec2 pixelSize;uniform vec3 backgroundColor;varying vec2 vUv;
        vec3 displayColor(vec4 c){
          vec3 color=c.rgb/max(c.a,.000001);
          #ifdef TONE_MAPPING
            color=toneMapping(color);
          #endif
          return mix(backgroundColor,color,c.a);
        }
        void main(){
          vec2 d=pixelSize*focusMix*7.;
          vec4 rack=texture2D(rackImage,vUv)*.25;
          rack+=(texture2D(rackImage,vUv+vec2(d.x,0.))+texture2D(rackImage,vUv-vec2(d.x,0.))+texture2D(rackImage,vUv+vec2(0.,d.y))+texture2D(rackImage,vUv-vec2(0.,d.y)))*.125;
          rack+=(texture2D(rackImage,vUv+d)+texture2D(rackImage,vUv-d)+texture2D(rackImage,vUv+vec2(d.x,-d.y))+texture2D(rackImage,vUv+vec2(-d.x,d.y)))*.0625;
          vec4 piece=texture2D(pieceImage,vUv);
          vec3 behind=mix(displayColor(rack),backgroundColor,focusMix*.84);
          gl_FragColor=vec4(mix(behind,displayColor(vec4(piece.rgb/max(piece.a,.000001),1.)),piece.a),1.);
          #include <colorspace_fragment>
        }`,
    });
    this.geometry=new THREE.PlaneGeometry(2,2);this.quad=new THREE.Mesh(this.geometry,this.material);this.quad.frustumCulled=false;
    this.output=new THREE.Scene();this.output.add(this.quad);this.camera=new THREE.Camera();
  }
  prepare(scene,camera,fading,subject) {this.render(scene,camera,fading,.5,subject);this.drawScene(scene,camera);}
  render(scene,camera,fading,focus,subject) {
    const renderer=this.renderer;
    if(focus<=1/1024){this.backgroundKey=null;this.drawScene(scene,camera);return;}
    renderer.getDrawingBufferSize(this.size);
    if(this.rack.width!==this.size.x||this.rack.height!==this.size.y){this.rack.setSize(this.size.x,this.size.y);this.piece.setSize(this.size.x,this.size.y);this.backgroundKey=null;}
    camera.updateMatrixWorld();
    const key=focus>=1-1/1024?[subject?.uuid,...camera.matrixWorld.elements,...camera.projectionMatrix.elements].join(','):null;
    const target=renderer.getRenderTarget(),objects=[...fading,...this.backdrop,...(subject?[subject]:[])],visible=objects.map(object=>object.visible),background=scene.background,clearAlpha=renderer.getClearAlpha();renderer.getClearColor(this.clearColor);
    try {
      this.uniforms.backgroundColor.value.copy(background?.isColor?background:this.clearColor);if(background?.isColor)scene.background=null;renderer.setClearColor(0,0);
      if(!key||key!==this.backgroundKey){
        fading.forEach(object=>{object.visible=true;});this.backdrop.forEach(object=>{object.visible=true;});if(subject)subject.visible=false;
        renderer.setRenderTarget(this.rack);this.drawScene(scene,camera);this.backgroundKey=key;
      }
      fading.forEach(object=>{object.visible=false;});this.backdrop.forEach(object=>{object.visible=false;});if(subject)subject.visible=true;
      renderer.setRenderTarget(this.piece);this.drawScene(scene,camera);
      this.uniforms.focusMix.value=focus;this.uniforms.pixelSize.value.set(1/this.size.x,1/this.size.y);
      renderer.setRenderTarget(target);renderer.render(this.output,this.camera);
    } finally {
      objects.forEach((object,i)=>{object.visible=visible[i];});scene.background=background;renderer.setClearColor(this.clearColor,clearAlpha);renderer.setRenderTarget(target);
    }
  }
  dispose(){this.rack.dispose();this.piece.dispose();this.geometry.dispose();this.material.dispose();}
}
