import*as T from'three';
// Preserve the key caster plane's depth slope alongside a sampleable depth
// attachment. Reconstruct the occluder's depth at the receiver UV instead of
// extending the receiver itself over neighbouring shadow texels.
export function configureStudioDepthPlanes(studio,scene,renderer,{secondary=false}={}){
 if(studio.depthPlanes)return studio.depthPlanes;
 if(renderer.capabilities?.logarithmicDepthBuffer||renderer.capabilities?.reversedDepthBuffer)return null;
 if(renderer.shadowMap?.type!==T.BasicShadowMap||!renderer.capabilities?.maxTextureSize||!renderer.extensions.has('EXT_color_buffer_float'))return null;
 const casters=[];let supported=true;
 scene.traverse(o=>{if(!o.castShadow||(!o.isMesh&&!o.isLine&&!o.isPoints))return;if(!o.isMesh){supported=false;return;}if(o.customDepthMaterial&&(!o.customDepthMaterial.isMeshDepthMaterial||o.customDepthMaterial.depthPacking!==T.RGBADepthPacking))supported=false;casters.push(o);});
 if(!supported)return null;
 const shadows=[studio.key.shadow,...(secondary?studio.secondaryLights.map(l=>l.shadow):[])],limit=renderer.capabilities.maxTextureSize;
 for(const shadow of shadows){
  const extent=shadow.getFrameExtents();
  shadow.mapSize.x=Math.min(shadow.mapSize.x,Math.floor(limit/extent.x));shadow.mapSize.y=Math.min(shadow.mapSize.y,Math.floor(limit/extent.y));
  const width=shadow.mapSize.x*extent.x,height=shadow.mapSize.y*extent.y,depthTexture=new T.DepthTexture(width,height,T.FloatType);
  shadow.map?.dispose();shadow.map=new T.WebGLRenderTarget(width,height,{format:T.RGFormat,type:T.HalfFloatType,minFilter:T.NearestFilter,magFilter:T.NearestFilter,depthBuffer:true,stencilBuffer:false,generateMipmaps:false,depthTexture});shadow.depthPlanes=true;
  for(const camera of shadow.cameras??[shadow.camera])camera.userData.studioCastDepthPlanes=true;
 }
 const shadow=studio.key.shadow;shadow.uniforms.uStudioAreaPlaneDepth={value:shadow.map.depthTexture};
 const materials=new Map();for(const mesh of casters){
  mesh.customDepthMaterial??=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});
  const material=mesh.customDepthMaterial;let capture=materials.get(material);
  if(!capture){
   capture={value:false};materials.set(material,capture);const before=material.onBeforeCompile,key=material.customProgramCacheKey();
   material.onBeforeCompile=function(shader,renderer){before.call(this,shader,renderer);shader.uniforms.uStudioWriteDepthPlanes=capture;shader.fragmentShader='uniform bool uStudioWriteDepthPlanes;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('gl_FragColor = packDepthToRGBA( fragCoordZ );','gl_FragColor = uStudioWriteDepthPlanes ? vec4( dFdx( fragCoordZ ), dFdy( fragCoordZ ), 0., 1. ) : packDepthToRGBA( fragCoordZ );');};
   material.customProgramCacheKey=()=>key+'-caster-depth-plane-v2';material.needsUpdate=true;
  }
  const before=mesh.onBeforeShadow;mesh.onBeforeShadow=function(...args){const result=before.call(this,...args);capture.value=Boolean(args[3].userData.studioCastDepthPlanes);return result;};
 }
 studio.depthPlanes={uStudioAreaPlaneDepth:shadow.uniforms.uStudioAreaPlaneDepth};return studio.depthPlanes;
}
export const planeVisibility=`
#ifndef STUDIO_CASTER_PLANE_VISIBILITY_DEFINED
#define STUDIO_CASTER_PLANE_VISIBILITY_DEFINED
float studioCasterPlaneVisibility(sampler2D slopes,sampler2D depths,vec3 coord,vec2 size,vec2 tile,float side,float bias){
 vec2 pixel=coord.xy*size-.5,base=floor(pixel),fraction=fract(pixel);float visible=0.;
 for(int y=0;y<2;y++)for(int x=0;x<2;x++){
  vec2 tap=clamp((base+vec2(float(x),float(y))+.5)/size,.5/size,1.-.5/size),uv=(tap+tile)/side;
  float depth=texture2D(depths,uv).r;vec2 gradient=texture2D(slopes,uv).rg;
  float atReceiver=depth+dot(gradient,(coord.xy-tap)*size);
  float weight=(x==0?1.-fraction.x:fraction.x)*(y==0?1.-fraction.y:fraction.y);
  visible+=weight*(depth>=1.?1.:step(coord.z+bias,atReceiver));
 }
 return visible;
}
#endif
`;
