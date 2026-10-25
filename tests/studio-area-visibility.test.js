import{loadGeometryAsset}from'./helpers/geometry-asset.js';
import{placeGarmentModel}from'../src/model-space.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {makeStudio} from '../src/studio-set.js';
import {applyStudioAreaLight} from '../src/studio-area-light.js';
import {applyStudioAreaVisibility} from '../src/studio-area-visibility.js';
import {createStudioShadowFraming,frameStudioShadow} from '../src/studio-shadow.js';
import {createSurfaceRig} from '../src/surface-rig.js';
import {modelConfig} from '../src/model-config.js';
import {FocusTransition} from '../src/focus-transition.js';
function studio(){const scene=new T.Scene(),s=makeStudio(scene);return{scene,...s};}
function dispose(s){s.key.shadow.dispose();s.scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}

test('sixteen source cameras share one bounded atlas while retaining distinct projection uploads',()=>{
 const s=studio(),shadow=s.key.shadow;try{
  assert.ok(shadow.isAreaAtlasShadow);assert.equal(shadow.getViewportCount(),16);assert.equal(shadow.mapSize.x*shadow.getFrameExtents().x,3072);
  assert.equal(new Set(shadow.cameras).size,16,'changing projection on a single camera would reuse a stale renderer uniform');
  const seen=new Set();shadow.frame(new T.Vector3(),true);
  for(let i=0;i<16;i++){
   const tile=shadow.getViewport(i);assert.equal(tile.z,1);assert.equal(tile.w,1);assert.ok(tile.x>=0&&tile.y>=0&&tile.x<4&&tile.y<4);seen.add(tile.x+','+tile.y);
   shadow.updateMatrices(s.key,i);assert.equal(shadow.camera,shadow.cameras[i]);
   const local=shadow.worldSources[i].clone().applyMatrix4(s.softbox.matrixWorld.clone().invert());assert.ok(Math.abs(local.z)<1e-12);assert.ok(Math.abs(local.x)<s.softbox.width/2&&Math.abs(local.y)<s.softbox.height/2);
   const point=new T.Vector3(.2,-.5,.3),uv=point.clone().applyMatrix4(shadow.matrices[i]),rayPoint=new T.Vector3(uv.x*2-1,uv.y*2-1,uv.z*2-1).unproject(shadow.camera);assert.ok(rayPoint.distanceTo(point)<1e-10);
  }
  assert.equal(seen.size,16);assert.equal(s.key.intensity,0);assert.equal(s.key.castShadow,true);
 }finally{dispose(s);}
});

test('the 1080p source budget keeps camera tiles, quadrature and horizon visibility in the same four-node layout',()=>{
 const scene=new T.Scene(),s=makeStudio(scene,{areaSampleSide:2}),shadow=s.key.shadow,m=new T.MeshPhysicalMaterial({sheen:.22});
 try{
  assert.equal(shadow.sampleSide,2);assert.equal(shadow.getViewportCount(),4);assert.equal(shadow.matrices.length,4);
  assert.equal(shadow.getFrameExtents().x,2);assert.equal(new Set(shadow.cameras).size,4);shadow.frame(new T.Vector3(),false);
  for(let i=0;i<4;i++){
   const tile=shadow.getViewport(i);assert.equal(tile.x,i%2);assert.equal(tile.y,Math.floor(i/2));shadow.updateMatrices(s.key,i);
   const source=shadow.sources[i];assert.ok(Math.abs(Math.abs(source.x)/(s.softbox.width/2)-1/Math.sqrt(3))<1e-12);assert.ok(Math.abs(Math.abs(source.y)/(s.softbox.height/2)-1/Math.sqrt(3))<1e-12);
   const p=new T.Vector3(.2,-.5,.3),uv=p.clone().applyMatrix4(shadow.matrices[i]);assert.ok(new T.Vector3(uv.x*2-1,uv.y*2-1,uv.z*2-1).unproject(shadow.camera).distanceTo(p)<1e-10);
  }
  applyStudioAreaLight(m);applyStudioAreaVisibility(m,shadow);
  const shader={uniforms:{},vertexShader:T.ShaderLib.physical.vertexShader,fragmentShader:T.ShaderLib.physical.fragmentShader};m.onBeforeCompile(shader);
  assert.match(shader.fragmentShader,/#define STUDIO_AREA_SAMPLE_SIDE 2/);assert.match(shader.fragmentShader,/uniform mat4 uStudioAreaMatrices\[4\]/);
  assert.match(shader.fragmentShader,/visibility\[2\],visibility\[3\]/);assert.match(shader.fragmentShader,/x<STUDIO_AREA_SAMPLE_SIDE/);
  assert.match(shader.fragmentShader,/RE_Direct_RectArea_Physical\(light,p,n,v,ccNormal,material,reflectedLight\)/);
  assert.equal(shader.uniforms.uStudioAreaMatrices.value,shadow.matrices);
 }finally{m.dispose();dispose({...s,scene});}
});

test('all finite-source cameras cover both actual garment assets across focus slots and the entire rack',async()=>{
 const s=studio(),shadow=s.key.shadow;try{
  for(const config of Object.values(modelConfig)){
   const gltf=await loadGeometryAsset(new URL('../public'+config.url,import.meta.url));placeGarmentModel(gltf.scene,config);gltf.scene.updateMatrixWorld(true);
   const box=new T.Box3().setFromObject(gltf.scene),centre=box.getCenter(new T.Vector3()),scale=1,points=[];
   gltf.scene.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){const p=new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);points.push(p.multiplyScalar(scale));}});
   if(!config.hasHanger)for(const x of[-.68,.68])for(const y of[.55,1.59])for(const z of[-.06,0])points.push(new T.Vector3(x,y,z));
   for(const focus of[false,true])for(const x of[-3.285,0,3.285])for(const yaw of[0,Math.PI/2,Math.PI]){
    const pose=new T.Matrix4().compose(new T.Vector3(x,focus?1.94:1.56,focus?.35:0),new T.Quaternion().setFromEuler(new T.Euler(.008,yaw,.012,'ZYX')),new T.Vector3().setScalar(focus?1.28:1)),center=new T.Vector3(0,-1.58,0).applyMatrix4(pose);pose.multiply(new T.Matrix4().makeTranslation(0,-1.58,0));shadow.frame(focus?center:new T.Vector3(),focus);
    for(let view=0;view<16;view++){
     shadow.updateMatrices(s.key,view);for(const p of points){const q=p.clone().applyMatrix4(pose).project(shadow.camera);assert.ok(Math.max(Math.abs(q.x),Math.abs(q.y),Math.abs(q.z))<.99,config.url+' source='+view+' x='+x+' yaw='+yaw+' focus='+focus);}
    }
   }
  }
 }finally{dispose(s);}
});

test('area visibility preserves cloth, print and local detail hooks without applying a center shadow twice',()=>{
 const s=studio(),data=JSON.parse(readFileSync(new URL('../public/models/short-sleeve-simulation.json',import.meta.url))),rig=createSurfaceRig(data,{},'finite-source-compose'),g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([0,-.5,.15,.1,-.5,.15,0,-.6,.15],3));g.setIndex([0,1,2]);g.computeVertexNormals();const m=new T.MeshPhysicalMaterial({sheen:.22,clearcoat:.18});m.userData.collarRib={value:1};m.userData.hemStitch={value:1};const mesh=new T.Mesh(g,m),chunks={...T.ShaderChunk};
 try{
  rig.bind(mesh);applyStudioAreaLight(m);applyStudioAreaVisibility(m,s.key.shadow);const before=m.onBeforeCompile,key=m.customProgramCacheKey();applyStudioAreaVisibility(m,s.key.shadow);assert.equal(m.onBeforeCompile,before);assert.equal(m.customProgramCacheKey(),key);
  const shader={uniforms:{},vertexShader:T.ShaderLib.physical.vertexShader,fragmentShader:T.ShaderLib.physical.fragmentShader};m.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uSurface.value,rig.texture);assert.equal(shader.uniforms.uCollarRib,m.userData.collarRib);assert.equal(shader.uniforms.uHemStitch,m.userData.hemStitch);assert.equal(shader.uniforms.uStudioAreaMatrices.value,s.key.shadow.matrices);
  assert.ok(shader.fragmentShader.includes('inkAlpha'));assert.ok(shader.fragmentShader.includes('studioDiffuseArea'));assert.ok(shader.vertexShader.includes('clothNormalRotation'));assert.ok(shader.vertexShader.includes('vStudioAreaWorld=(modelMatrix*vec4(transformed,1.)).xyz'));
  assert.ok(!shader.fragmentShader.includes('rectAreaLight.color*=getShadow'));assert.ok(shader.fragmentShader.includes('sheenSpecularDirect=beforeSheen+sheenVisible'));for(const component of['diffuse','specular','coat'])assert.ok(shader.fragmentShader.includes('studioVisibilityRatio('+component+'Visible,'+component+'Full)'));
  assert.deepEqual(T.ShaderChunk,chunks);
  const depth=new T.MeshDepthMaterial(),d={uniforms:{},vertexShader:T.ShaderLib.depth.vertexShader,fragmentShader:T.ShaderLib.depth.fragmentShader};applyStudioAreaVisibility(depth,s.key.shadow);depth.onBeforeCompile(d);assert.equal(d.fragmentShader,T.ShaderLib.depth.fragmentShader);assert.equal(d.vertexShader,T.ShaderLib.depth.vertexShader);depth.dispose();
 }finally{rig.dispose();g.dispose();m.dispose();mesh.customDepthMaterial.dispose();dispose(s);}
});

test('rack and opaque focus captures frame their own source views without sharing mutable scene state',()=>{
 const s=studio(),other=studio(),rail=new T.Group(),piece=new T.Group(),neighbor=new T.Group();piece.position.set(3.285,1.94,.35);piece.scale.setScalar(1.28);s.scene.add(rail,piece,neighbor);s.scene.onBeforeRender=createStudioShadowFraming(s.key,rail,()=>piece);const captures=[];
 const r={capabilities:{maxSamples:4},target:null,color:new T.Color(),alpha:1,getDrawingBufferSize(v){return v.set(64,64);},getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},getClearAlpha(){return this.alpha;},getClearColor(c){return c.copy(this.color);},setClearColor(c,a){this.color.set(c);this.alpha=a;},render(scene){if(scene===s.scene){scene.onBeforeRender();const a=s.key.shadow;captures.push({focused:a.focused,center:a.center.clone()});}}};const transition=new FocusTransition(r);
 try{transition.render(s.scene,new T.Camera(),[neighbor,rail],.5);assert.deepEqual(captures.map(x=>x.focused),[false,true]);assert.ok(captures[0].center.length()<1e-12);assert.ok(captures[1].center.distanceTo(new T.Vector3(3.285,1.94-1.58*1.28,.35))<1e-12);assert.equal(rail.visible,true);assert.notEqual(s.key.shadow.uniforms.uStudioAreaMatrices,other.key.shadow.uniforms.uStudioAreaMatrices);frameStudioShadow(other.key,new T.Vector3(-2,0,0),false);assert.equal(s.key.shadow.center.x,3.285);}finally{transition.dispose();dispose(s);dispose(other);}
});
