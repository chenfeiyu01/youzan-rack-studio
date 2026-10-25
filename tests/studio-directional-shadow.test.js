import{loadGeometryAsset}from'./helpers/geometry-asset.js';
import{placeGarmentModel}from'../src/model-space.js';
import{HANGER_ROLL_LIMIT,HANGER_PITCH_LIMIT}from'../src/physics.js';
import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import*as T from'three';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import{makeStudio}from'../src/studio-set.js';import{StudioDirectionalShadow,applyStudioDirectionalVisibility}from'../src/studio-directional-shadow.js';import{configureStudioDepthPlanes}from'../src/studio-depth-planes.js';import{modelConfig}from'../src/model-config.js';import{createStudioShadowFraming}from'../src/studio-shadow.js';import{FocusTransition}from'../src/focus-transition.js';import{hangerFixtures}from'./helpers/hanger-fixtures.js';
function dispose(scene){scene.traverse(o=>{o.shadow?.dispose();o.geometry?.dispose();o.material?.dispose();});}
test('secondary angular softness stays in world units as the shadow window changes and binds independent live sources',()=>{
 const scene=new T.Scene(),s=makeStudio(scene),material=new T.MeshPhysicalMaterial(),fallback=new T.MeshPhysicalMaterial();
 try{
  configureStudioDepthPlanes(s,scene,{shadowMap:{type:T.BasicShadowMap},extensions:{has:()=>true},capabilities:{maxTextureSize:4096}},{secondary:true});
  applyStudioDirectionalVisibility(material,s.secondaryLights);applyStudioDirectionalVisibility(fallback);
  const compile=m=>{const sh={uniforms:{},vertexShader:T.ShaderLib.physical.vertexShader,fragmentShader:T.ShaderLib.physical.fragmentShader};m.onBeforeCompile(sh,{});return sh;},soft=compile(material),hard=compile(fallback);
  assert.notEqual(material.customProgramCacheKey(),fallback.customProgramCacheKey());assert.equal(hard.uniforms.uStudioDirectionalPlaneDepth,undefined);
  for(let i=0;i<2;i++){
   const light=s.secondaryLights[i],sh=light.shadow;assert.equal(soft.uniforms.uStudioDirectionalPlaneDepth.value[i],sh.map.depthTexture);assert.equal(soft.uniforms.uStudioDirectionalSoftness.value[i],sh.softnessScale);assert.equal(soft.uniforms.uStudioDirectionalSampleRadius.value[i],sh.sampleRadius);
   for(const focused of[false,true]){sh.frame(new T.Vector3(.3,.2,.1),focused);sh.updateMatrices(light);const c=sh.camera,depthGap=.4/(c.far-c.near),scale=soft.uniforms.uStudioDirectionalSoftness.value[i];assert.ok(Math.abs(scale.x*depthGap*(c.right-c.left)-.024)<1e-12);assert.ok(Math.abs(scale.y*depthGap*(c.top-c.bottom)-.024)<1e-12);assert.ok(Math.abs(sh.sampleRadius.x*(c.right-c.left)-8*(focused?6:14)/1024)<1e-12);assert.ok(Math.abs(sh.sampleRadius.y*(c.top-c.bottom)-8*(focused?6.5:12)/1024)<1e-12);}
  }
  assert.notEqual(soft.uniforms.uStudioDirectionalPlaneDepth.value[0],soft.uniforms.uStudioDirectionalPlaneDepth.value[1]);
 }finally{material.dispose();fallback.dispose();dispose(scene);}
});
test('secondary directional shadows preserve source lighting and include casters behind the displayed light position',()=>{
 const scene=new T.Scene(),s=makeStudio(scene);try{
  assert.equal(s.key.intensity,0);assert.equal(s.softbox.intensity,7.4);assert.equal(s.secondaryLights.length,2);assert.deepEqual(s.secondaryLights.map(l=>l.intensity),[.7,1.8]);assert.deepEqual(s.secondaryLights.map(l=>l.position.toArray()),[[4,1.5,5],[-3,2,-.4]]);
  for(const l of s.secondaryLights){assert.ok(l.castShadow);assert.ok(l.shadow instanceof StudioDirectionalShadow);assert.equal(l.shadow.mapSize.x,1024);const before=l.position.clone(),target=l.target.position.clone();l.shadow.frame(new T.Vector3(),false);l.shadow.updateMatrices(l);assert.ok(l.position.equals(before)&&l.target.position.equals(target));const axis=l.position.clone().sub(l.target.position).normalize(),forward=l.shadow.camera.getWorldDirection(new T.Vector3());assert.ok(forward.dot(axis)<-1+1e-12);assert.ok(Math.abs(l.shadow.camera.position.length()-24)<1e-12);}
  const rim=s.secondaryLights[1],p=new T.Vector3(-4.5,1.7,.1);assert.ok(p.clone().sub(rim.position).dot(rim.position.clone().normalize())>0,'the test caster is behind the displayed rim light');assert.ok(rim.shadow.getFrustum().containsPoint(p));
 }finally{dispose(scene);}
});
test('both source windows cover the actual garments and hangers across rack slots, turns and inspection scales with displacement margin',async t=>{
 const scene=new T.Scene(),s=makeStudio(scene),fixtures=await hangerFixtures();let maximum=0,poses=0;
 try{for(const[type,c]of Object.entries(modelConfig)){
  const model=(await loadGeometryAsset(new URL('../public'+c.url,import.meta.url))).scene;placeGarmentModel(model,c);model.updateMatrixWorld(true);const box=new T.Box3().setFromObject(model),centre=box.getCenter(new T.Vector3()),scale=1,points=[];model.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)points.push(new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).multiplyScalar(scale));});
  if(!c.hasHanger){const p=fixtures.short.data.positions;for(let i=0;i<p.length;i+=3)points.push(new T.Vector3(p[i],p[i+1]+1.58,p[i+2]));}
  // For every yaw, the XZ rotation of each point is bounded by its radial
  // length after pitch; roll contributes a bounded Y term. Include the old
  // displacement allowance, half a snapped texel, and the filter reach.
  const radial=points.reduce((maximum,p)=>Math.max(maximum,Math.hypot(p.x,Math.abs(p.z)+Math.abs(p.y)*Math.sin(HANGER_PITCH_LIMIT))+(Math.abs(p.y)+Math.abs(p.z)*Math.sin(HANGER_PITCH_LIMIT))*Math.sin(HANGER_ROLL_LIMIT)),0);
  for(const light of s.secondaryLights){const sh=light.shadow;sh.frame(new T.Vector3(),true);sh.updateMatrices(light);const width=sh.camera.right-sh.camera.left;assert.ok(radial*1.28+.8+width/(2*sh.mapSize.x)+sh.sampleRadius.x*width<width/2,'all-yaw model envelope plus displacement, snapping and filter must fit');}
  for(const light of s.secondaryLights)for(const focused of[false,true])for(const x of[-4,0,4])for(const yaw of[-1.43,0,Math.PI/2,Math.PI])for(const size of[1,1.28]){
   const pose=new T.Matrix4().compose(new T.Vector3(x,1.94,.35),new T.Quaternion().setFromEuler(new T.Euler(.008,yaw,.012,'ZYX')),new T.Vector3().setScalar(size)),center=new T.Vector3(0,-1.58,0).applyMatrix4(pose);pose.multiply(new T.Matrix4().makeTranslation(0,-1.58,0));light.shadow.frame(focused?center:new T.Vector3(),focused);light.shadow.updateMatrices(light);const camera=light.shadow.camera,projection=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(pose),margin=[1.6/(camera.right-camera.left),1.6/(camera.top-camera.bottom),1.6/(camera.far-camera.near)],q=new T.Vector3();
   for(const p of points){q.copy(p).applyMatrix4(projection);const m=Math.max(Math.abs(q.x)+margin[0],Math.abs(q.y)+margin[1],Math.abs(q.z)+margin[2]);maximum=Math.max(maximum,m);assert.ok(m<.99,`${type} focused=${focused} x=${x} yaw=${yaw} scale=${size} NDC+margin=${m}`);}poses++;
  }
 }}finally{dispose(scene);}t.diagnostic(JSON.stringify({poses,maximumNDCWithWorldDisplacementMarginPoint8:maximum}));
});
test('secondary shadow windows stay on a fixed world texel grid through subtexel carrier motion',()=>{
 const scene=new T.Scene(),s=makeStudio(scene);try{for(const l of s.secondaryLights){const sh=l.shadow;sh.frame(new T.Vector3(),true);sh.updateMatrices(l);const before=sh.matrix.elements.slice(),camera=sh.camera.matrixWorld.elements.slice(),right=new T.Vector3().setFromMatrixColumn(sh.camera.matrixWorld,0),up=new T.Vector3().setFromMatrixColumn(sh.camera.matrixWorld,1),tx=(sh.camera.right-sh.camera.left)/sh.mapSize.x,ty=(sh.camera.top-sh.camera.bottom)/sh.mapSize.y;
  sh.frame(right.clone().multiplyScalar(tx*.2).addScaledVector(up,ty*.2),true);sh.updateMatrices(l);for(let i=0;i<16;i++){assert.ok(Math.abs(sh.matrix.elements[i]-before[i])<1e-12);assert.ok(Math.abs(sh.camera.matrixWorld.elements[i]-camera[i])<1e-12);}
  sh.frame(right.clone().multiplyScalar(tx*1.1),true);sh.updateMatrices(l);assert.ok(Math.abs(sh.matrix.elements[12]-before[12]+1/sh.mapSize.x)<1e-12);
 }}finally{dispose(scene);}
});
test('opaque rack and piece captures frame both secondary sources independently',()=>{
 const scene=new T.Scene(),s=makeStudio(scene),rail=new T.Group(),piece=new T.Group(),other=new T.Group();piece.position.set(3.285,1.94,.35);piece.scale.setScalar(1.28);scene.add(rail,piece,other);scene.onBeforeRender=createStudioShadowFraming(s.key,rail,()=>piece,s.secondaryLights);const captures=[];
 const r={capabilities:{maxSamples:4},target:null,color:new T.Color(),alpha:1,getDrawingBufferSize(v){return v.set(64,64);},getRenderTarget(){return this.target;},setRenderTarget(v){this.target=v;},getClearColor(v){return v.copy(this.color);},getClearAlpha(){return this.alpha;},setClearColor(c,a){this.color.set(c);this.alpha=a;},render(value){if(value===scene){scene.onBeforeRender();captures.push(s.secondaryLights.map(l=>({focused:l.shadow.focused,center:l.shadow.center.clone()})));}}},transition=new FocusTransition(r);
 try{transition.render(scene,new T.Camera(),[rail,other],.5);assert.equal(captures.length,2);for(let i=0;i<2;i++){assert.equal(captures[0][i].focused,false);assert.ok(captures[0][i].center.length()<1e-12);assert.equal(captures[1][i].focused,true);assert.ok(captures[1][i].center.distanceTo(new T.Vector3(3.285,1.94-1.58*1.28,.35))<1e-12);}assert.notEqual(s.secondaryLights[0].shadow,s.secondaryLights[1].shadow);assert.equal(rail.visible,true);}finally{transition.dispose();dispose(scene);}
});
