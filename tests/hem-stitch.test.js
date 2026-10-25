import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import * as T from 'three';
import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';
import{hemStitchCoordinates}from'../src/hem-stitch.js';
import{modelConfig}from'../src/model-config.js';
async function shirt(){
  const bytes=readFileSync(new URL('../public/models/short-sleeve.glb',import.meta.url));
  const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  asset.scene.updateMatrixWorld(true);const box=new T.Box3().setFromObject(asset.scene),center=box.getCenter(new T.Vector3()),scale=modelConfig.shortSleeve.height/box.getSize(new T.Vector3()).y;
  let g;asset.scene.traverse(o=>{if(o.isMesh&&o.name==='Fabric')g=o.geometry.clone().applyMatrix4(o.matrixWorld);});
  g.scale(scale,scale,scale);g.translate(-center.x*scale,modelConfig.shortSleeve.top-box.max.y*scale,-center.z*scale);return g;
}

test('hem coordinates follow the actual lower edge and preserve all source geometry',async()=>{
 const g=await shirt(),p=g.attributes.position,before=Object.fromEntries(Object.entries(g.attributes).map(([name,a])=>[name,a.array.slice()])),index=g.index.array.slice(),hem=hemStitchCoordinates(g);let covered=0,rows=0;
 for(let i=0;i<p.count;i++){
  assert.ok(Number.isFinite(hem.getX(i))&&Number.isFinite(hem.getY(i)));
  if(p.getY(i)>=-1.35){assert.equal(hem.getZ(i),0);assert.ok(hem.getY(i)>.03,'body interpolation must not cross either stitch row');}
  if(hem.getZ(i)){covered++;if(hem.getY(i)>.012&&hem.getY(i)<.024)rows++;}
 }
 // Use spatial coverage rather than a vertex-count upper bound: changing
 // tessellation must neither hide the hem nor extend stitching up the body.
 const lower=Array.from({length:p.count},(_,i)=>i).filter(i=>p.getY(i)<-1.35);
 assert.equal(covered,lower.length);assert.ok(covered>1000);assert.ok(rows>100,`double row region ${rows}`);
 for(const i of lower)assert.equal(hem.getZ(i),1);
 for(const[name,values]of Object.entries(before))assert.deepEqual(g.attributes[name].array,values,name);assert.deepEqual(g.index.array,index);g.dispose();
});
test('UV and shading splits keep continuous stitch phase and distance across the hem',async()=>{
 const g=await shirt(),p=g.attributes.position,hem=hemStitchCoordinates(g),groups=new Map();let checked=0;
 for(let i=0;i<p.count;i++){
  if(!hem.getZ(i))continue;const key=[p.getX(i),p.getY(i),p.getZ(i)].join(':');
  if(groups.has(key)){const other=groups.get(key),delta=hem.getX(i)-hem.getX(other);assert.ok(Math.abs(delta-Math.round(delta))<.0001);assert.equal(hem.getY(i),hem.getY(other));checked++;}else groups.set(key,i);
 }
 assert.ok(checked>200,`actual hem duplicates ${checked}`);g.dispose();
});
