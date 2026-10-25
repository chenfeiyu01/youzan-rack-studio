import test from'node:test';import assert from'node:assert/strict';import*as T from'three';
import{configureStudioDepthPlanes as installDepthPlanes}from'../src/studio-depth-planes.js';import{makeStudio}from'../src/studio-set.js';
const renderer={shadowMap:{type:T.BasicShadowMap},extensions:{has:()=>true},capabilities:{maxTextureSize:2048}};
function fixture(){const scene=new T.Scene(),studio=makeStudio(scene),geometry=new T.PlaneGeometry(1,1),material=new T.MeshPhysicalMaterial(),mesh=new T.Mesh(geometry,material);mesh.castShadow=true;scene.add(mesh);return{scene,studio,geometry,material,mesh};}
function dispose(s){const materials=new Set(),geometries=new Set();s.scene.traverse(o=>{o.shadow?.dispose();if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);if(o.customDepthMaterial)materials.add(o.customDepthMaterial);});materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());}
test('the primary map owns slopes and depth, respects the driver limit and leaves the other sources intact',()=>{
 const s=fixture(),shape=s.geometry,position=s.geometry.attributes.position,source=s.studio.softbox.position.clone(),power=s.studio.softbox.intensity;
 try{const state=installDepthPlanes(s.studio,s.scene,renderer),map=s.studio.key.shadow.map;
  assert.ok(state);assert.equal(map.width,2048);assert.equal(map.height,2048);assert.equal(map.texture.format,T.RGFormat);assert.equal(map.texture.type,T.HalfFloatType);assert.equal(map.depthTexture.type,T.FloatType);assert.equal(map.depthTexture.format,T.DepthFormat);assert.equal(map.samples,0);assert.equal(map.depthTexture.compareFunction,null);
  assert.equal(state.uStudioAreaPlaneDepth.value,map.depthTexture);assert.equal(s.studio.key.shadow.getViewportCount(),16);assert.equal(s.studio.key.shadow.mapSize.x,512);assert.ok(s.studio.key.shadow.cameras.every(c=>c.userData.studioCastDepthPlanes));
  for(const l of s.studio.secondaryLights){assert.equal(l.shadow.map,null);assert.equal(l.shadow.mapSize.x,1024);assert.equal(l.shadow.camera.userData.studioCastDepthPlanes,undefined);}
  assert.equal(s.mesh.geometry,shape);assert.equal(s.geometry.attributes.position,position);assert.ok(s.studio.softbox.position.equals(source));assert.equal(s.studio.softbox.intensity,power);
  const callback=s.mesh.onBeforeShadow,key=s.mesh.customDepthMaterial.customProgramCacheKey();assert.equal(installDepthPlanes(s.studio,s.scene,renderer),state);assert.equal(s.studio.key.shadow.map,map);assert.equal(s.mesh.onBeforeShadow,callback);assert.equal(s.mesh.customDepthMaterial.customProgramCacheKey(),key);
 }finally{dispose(s);}
});
test('caster callbacks retain their deformation and select the appropriate encoding when lights change',()=>{
 const s=fixture(),depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking}),marker={value:7},events=[];s.mesh.customDepthMaterial=depth;
 depth.onBeforeCompile=function(shader,r){assert.equal(this,depth);assert.equal(r,renderer);shader.vertexShader+='\n// authored vertex deformation';shader.uniforms.marker=marker;};depth.customProgramCacheKey=()=> 'authored-depth';
 s.mesh.onBeforeShadow=function(...args){assert.equal(this,s.mesh);events.push(args);};
 const shader=()=>({uniforms:{},vertexShader:T.ShaderLib.depth.vertexShader,fragmentShader:T.ShaderLib.depth.fragmentShader}),original=shader();depth.onBeforeCompile(original,renderer);
 try{installDepthPlanes(s.studio,s.scene,renderer);const compiled=shader();depth.onBeforeCompile(compiled,renderer);assert.equal(compiled.vertexShader,original.vertexShader);assert.equal(compiled.uniforms.marker,marker);assert.notEqual(compiled.fragmentShader,original.fragmentShader);assert.ok(depth.customProgramCacheKey().startsWith('authored-depth'));
  const primary=s.studio.key.shadow.cameras[0],secondary=s.studio.secondaryLights[0].shadow.camera;
  s.mesh.onBeforeShadow(renderer,s.mesh,new T.Camera(),primary,s.geometry,depth,null);assert.equal(compiled.uniforms.uStudioWriteDepthPlanes.value,true);
  s.mesh.onBeforeShadow(renderer,s.mesh,new T.Camera(),secondary,s.geometry,depth,null);assert.equal(compiled.uniforms.uStudioWriteDepthPlanes.value,false);assert.equal(events.length,2);assert.equal(events[0][3],primary);assert.equal(events[1][3],secondary);
 }finally{dispose(s);}
});
test('unsupported formats and custom encodings fall back before mutating any target or caster',()=>{
 for(const mode of['no-float','other-shadow-type','custom-depth','log-depth','reversed-depth']){
  const s=fixture(),before=s.mesh.onBeforeShadow;let custom;
  if(mode==='custom-depth'){custom=new T.ShaderMaterial();s.mesh.customDepthMaterial=custom;}
  const r={...renderer,capabilities:{...renderer.capabilities,logarithmicDepthBuffer:mode==='log-depth',reversedDepthBuffer:mode==='reversed-depth'},shadowMap:{type:mode==='other-shadow-type'?T.PCFShadowMap:T.BasicShadowMap},extensions:{has:()=>mode!=='no-float'}};
  try{assert.equal(installDepthPlanes(s.studio,s.scene,r),null);assert.equal(s.studio.key.shadow.map,null);assert.equal(s.mesh.onBeforeShadow,before);assert.equal(s.mesh.customDepthMaterial,custom);assert.equal(s.studio.depthPlanes,undefined);assert.equal(s.studio.key.shadow.depthPlanes,undefined);}finally{dispose(s);}
 }
});
test('opted-in secondary sources own independent slope/depth targets and retain caster callbacks',()=>{
 const s=fixture(),calls=[];s.mesh.onBeforeShadow=function(...args){calls.push(args[3]);};
 try{
  installDepthPlanes(s.studio,s.scene,renderer,{secondary:true});
  const shadows=[s.studio.key.shadow,...s.studio.secondaryLights.map(l=>l.shadow)],maps=shadows.map(sh=>sh.map);
  assert.equal(new Set(maps).size,3);assert.equal(new Set(maps.map(m=>m.depthTexture)).size,3);
  const shader={uniforms:{},vertexShader:T.ShaderLib.depth.vertexShader,fragmentShader:T.ShaderLib.depth.fragmentShader};s.mesh.customDepthMaterial.onBeforeCompile(shader,renderer);
  for(const sh of shadows){
   assert.ok(sh.depthPlanes);assert.equal(sh.map.texture.format,T.RGFormat);assert.equal(sh.map.texture.type,T.HalfFloatType);assert.equal(sh.map.depthTexture.type,T.FloatType);
   const camera=sh.cameras?.[0]??sh.camera;s.mesh.onBeforeShadow(renderer,s.mesh,new T.Camera(),camera,s.geometry,s.mesh.customDepthMaterial,null);assert.equal(shader.uniforms.uStudioWriteDepthPlanes.value,true);
  }
  for(const sh of shadows.slice(1)){assert.equal(sh.map.width,1024);assert.equal(sh.map.height,1536);}
  const foreign=new T.Camera();s.mesh.onBeforeShadow(renderer,s.mesh,new T.Camera(),foreign,s.geometry,s.mesh.customDepthMaterial,null);assert.equal(shader.uniforms.uStudioWriteDepthPlanes.value,false);assert.equal(calls.length,4);
  let releases=0;for(const map of maps)map.addEventListener('dispose',()=>releases++);for(const sh of shadows)sh.dispose();assert.equal(releases,3);
 }finally{dispose(s);}
});
