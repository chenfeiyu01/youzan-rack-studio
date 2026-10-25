import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {requiresFullDetail,backgroundGeometry,applyDrawDetail,detailIndex,MAX_BACKGROUND_HEIGHT} from '../src/draw-detail.js';

const modelBytes=readFileSync(new URL('../public/models/short-sleeve.glb',import.meta.url));
const indexBytes=readFileSync(new URL('../public/models/short-sleeve-lod.bin',import.meta.url));
const indices=detailIndex(new Uint32Array(indexBytes.buffer.slice(indexBytes.byteOffset,indexBytes.byteOffset+indexBytes.byteLength)));
const assetPromise=new GLTFLoader().parseAsync(modelBytes.buffer.slice(modelBytes.byteOffset,modelBytes.byteOffset+modelBytes.byteLength),'');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=ids=>{const min=ids.indexOf(Math.min(...ids));return[ids[min],ids[(min+1)%3],ids[(min+2)%3]].join(',');};

test('selected, opening, hovered and magnified garments always retain the full surface',()=>{
  const base={index:7,active:6,owner:6,chosen:null,opening:null,hovered:null,projectedHeight:298};
  assert.equal(requiresFullDetail(base),false);
  for(const role of ['active','owner','chosen','opening','hovered'])assert.equal(requiresFullDetail({...base,[role]:7}),true,role);
  for(const projectedHeight of [MAX_BACKGROUND_HEIGHT+.01,Infinity,NaN,0,-1])assert.equal(requiresFullDetail({...base,projectedHeight}),true);
  assert.equal(requiresFullDetail({...base,projectedHeight:MAX_BACKGROUND_HEIGHT}),false);
});

test('background drawing shares every full vertex attribute and switches without changing the solver or full indices',async()=>{
  const asset=await assetPromise,full=asset.scene.getObjectByName('Fabric').geometry;
  // Include post-binding attributes: these must not be recomputed from the LOD.
  full.setAttribute('clothTangent',new T.BufferAttribute(new Float32Array(93534*3),3));
  full.setAttribute('clothBitangent',new T.BufferAttribute(new Float32Array(93534*3),3));
  const originalIndex=full.index,originalHash=hash(new Uint8Array(originalIndex.array.buffer));
  const low=backgroundGeometry(full,indices);assert.notEqual(low,full);assert.equal(backgroundGeometry(full,indices),low);
  for(const[name,a]of Object.entries(full.attributes))assert.equal(low.attributes[name],a,name);
  const solver={sentinel:true},rig={solver},mesh={geometry:full,customDepthMaterial:{sentinel:true}},depth=mesh.customDepthMaterial;
  const garment={userData:{rig,drawDetails:[{mesh,full,low}]}};
  for(let i=0;i<5;i++){
    assert.equal(applyDrawDetail(garment,false),true);assert.equal(mesh.geometry,low);
    assert.equal(applyDrawDetail(garment,true),false);assert.equal(mesh.geometry,full);
  }
  assert.equal(full.index,originalIndex);assert.equal(hash(new Uint8Array(originalIndex.array.buffer)),originalHash);
  assert.equal(garment.userData.rig,rig);assert.equal(garment.userData.rig.solver,solver);assert.equal(mesh.customDepthMaterial,depth);
});

test('the LOD matches the accepted full asset and preserves the supported top and constructed hem faces',async()=>{
  assert.equal(hash(modelBytes),'0bafb71b1e051e4d7e32085abaa95040e0c6aa84a760411791fbfb5d189d2822');
  assert.equal(hash(indexBytes),'ed637d1172eb73e555975038530f74189321323b7e6edc0bf60e2977cfc3f9f6');
  assert.equal(indices.count,86226*3);
  const asset=await assetPromise;asset.scene.updateMatrixWorld(true);
  const mesh=asset.scene.getObjectByName('Fabric'),box=new T.Box3().setFromObject(asset.scene),scale=2.48/box.getSize(new T.Vector3()).y;
  const g=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);g.scale(scale,scale,scale);g.translate(0,.98-box.max.y*scale,0);
  const present=new Map();for(let j=0;j<indices.count;j+=3){const key=canonical([0,1,2].map(k=>indices.getX(j+k)));present.set(key,(present.get(key)??0)+1);}
  let protectedFaces=0;
  for(let j=0;j<g.index.count;j+=3){
    const ids=[0,1,2].map(k=>g.index.getX(j+k));
    if(!ids.some(i=>g.attributes.position.getY(i)>.55||g.attributes.position.getY(i)<-1.35))continue;
    const key=canonical(ids),count=present.get(key)??0;assert.ok(count>0,'supported/hem source face is missing');present.set(key,count-1);protectedFaces++;
  }
  assert.ok(protectedFaces>17000);g.dispose();
});

test('alternate indices preserve the full mesh geometric boundary and nonmanifold edge multiset',async()=>{
  const g=(await assetPromise).scene.getObjectByName('Fabric').geometry,p=g.attributes.position,keys=Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)].join(':'));
  function abnormal(index){
    const edges=new Map();for(let j=0;j<index.count;j+=3)for(let k=0;k<3;k++){
      const a=keys[index.getX(j+k)],b=keys[index.getX(j+(k+1)%3)];if(a===b)continue;
      const key=[a,b].sort().join('|');if(!edges.has(key))edges.set(key,[]);edges.get(key).push(a<b?1:-1);
    }
    return new Map([...edges].filter(([,v])=>v.length!==2||v[0]===v[1]).map(([k,v])=>[k,v.sort().join(',')]));
  }
  assert.deepEqual(abnormal(indices),abnormal(g.index));
});

test('missing or incompatible detail data falls back to the full mesh and malformed indices are rejected',()=>{
  const full=new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(9),3));
  assert.equal(backgroundGeometry(full,null),full);assert.equal(backgroundGeometry(full,indices),full);
  for(const array of [new Uint16Array([0,1,2]),new Uint32Array(),new Uint32Array([0,1]),new Uint32Array([0,1,93534])])assert.throws(()=>detailIndex(array));
  assert.equal(applyDrawDetail({userData:{}},false),false);full.dispose();
});

test('current gravity and long sleeve assets use verified alternate indices with identical deformation attributes',async()=>{
 const {loadGeometryAsset}=await import('./helpers/geometry-asset.js');
 const {modelConfig}=await import('../src/model-config.js');
 const records=JSON.parse(readFileSync(new URL('../public/models/shadow-detail/manifest.json',import.meta.url))).models;
 for(const[type,record]of Object.entries(records)){
  const url=new URL('../public'+modelConfig[type].url,import.meta.url);assert.equal(hash(readFileSync(url)),record.sha256);
  const asset=await loadGeometryAsset(url);
  for(const[name,detail]of Object.entries(record.meshes)){
   const full=asset.scene.getObjectByName(name).geometry,bytes=readFileSync(new URL('../public/models/shadow-detail/'+detail.file,import.meta.url));
   assert.equal(hash(bytes),detail.sha256);
   const index=new T.BufferAttribute(new Uint32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),1);
   full.setAttribute('clothTangent',new T.BufferAttribute(new Float32Array(full.attributes.position.count*3),3));
   const low=backgroundGeometry(full,{...detail,index});assert.notEqual(low,full);assert.ok(low.index.count<full.index.count*.4);
   for(const[key,value]of Object.entries(full.attributes))assert.equal(low.attributes[key],value);
   assert.equal(backgroundGeometry(full,{...detail,index,vertexCount:detail.vertexCount+1}),full);
  }
 }
});
