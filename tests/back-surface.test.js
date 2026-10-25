import{priorCavity,priorIndex,revision,assertOutsideSourceFaces}from'./helpers/shirt-revision.js';
import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import*as T from'three';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/back-surface-restoration.json',import.meta.url))),hash=b=>createHash('sha256').update(b).digest('hex');
async function load(){const bytes=readFileSync(new URL('../public/models/short-sleeve.glb',import.meta.url)),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');asset.scene.updateMatrixWorld(true);const mesh=asset.scene.getObjectByName('Fabric'),box=new T.Box3().setFromObject(asset.scene),center=box.getCenter(new T.Vector3()),scale=2.48/box.getSize(new T.Vector3()).y,g=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);g.scale(scale,scale,scale);g.translate(-center.x*scale,.98-box.max.y*scale,-center.z*scale);return{raw:mesh.geometry,g};}
test('the seven exposed back-panel witnesses hit an outward exterior before the previously visible inner wall',async()=>{
 const{raw,g}=await load(),material=new T.MeshBasicMaterial({side:T.DoubleSide}),mesh=new T.Mesh(g,material),ray=new T.Raycaster();mesh.updateMatrixWorld();
 try{for(const p of fixture.witnesses){ray.set(new T.Vector3(p.x,p.y,-2),new T.Vector3(0,0,1));const hit=ray.intersectObject(mesh)[0];assert.ok(hit,'back panel must cover the witness');assert.ok(hit.face.normal.z<-.05,'the outward back face must be visible');assert.ok(hit.point.z<p.previousInnerZ-.0005,'the restored exterior must cover the exposed inner wall');}}
 finally{g.dispose();raw.dispose();material.dispose();}
});
test('restored exterior survives the junction rebuild, accounts for the cavity revision, and fits the deformation cells',async()=>{
 const{raw,g}=await load();try{
  assert.equal(raw.attributes.position.count,fixture.candidate.vertices);assert.equal(raw.index.count/3,fixture.candidate.faces);
  for(const[n,e]of Object.entries(fixture.baseline.attributes)){const a=raw.attributes[n];assert.equal(a.itemSize,e.itemSize);const array=n==='color'?priorCavity(a):a.array,prefix=array.subarray(0,e.count*e.itemSize);assert.equal(hash(new Uint8Array(prefix.buffer,prefix.byteOffset,prefix.byteLength)),e.sha256,n+' original prefix');}
  assertOutsideSourceFaces(g);const prefixValues=priorIndex.subarray(0,fixture.baseline.faces*3),indexPrefix=revision.priorOriginalIndexArrayType==='Uint16Array'?new Uint16Array(prefixValues):prefixValues;assert.equal(hash(new Uint8Array(indexPrefix.buffer,indexPrefix.byteOffset,indexPrefix.byteLength)),fixture.baseline.indexSha256,'independent historical face ledger retains the earlier restoration baseline');
  const p=g.attributes.position,point=i=>new T.Vector3().fromBufferAttribute(p,i),triangle=f=>new T.Triangle(...[0,1,2].map(k=>point(g.index.getX(f*3+k)))),covered=new Set(),families=[[1,0,0],[0,1,0],[0,0,1],[1,-1,0],[1,0,-1],[0,1,-1]],cage=fixture.cage,step=cage.min.map((v,k)=>(cage.max[k]-v)/(cage.dimensions[k]-1));
  for(const restored of fixture.restored){const source=new T.Triangle(...restored.originalIds.map(point)),normal=source.getNormal(new T.Vector3());let area=0;assert.ok(restored.faces.length>0);
   for(const f of restored.faces){assert.ok(f>=0&&f<g.index.count/3&&!covered.has(f));covered.add(f);const t=triangle(f);area+=t.getArea();assert.ok(t.getNormal(new T.Vector3()).dot(normal)>.999,'restored winding and authored plane');const qs=[t.a,t.b,t.c].map(v=>v.toArray().map((x,k)=>(x-cage.min[k])/step[k]));
    for(const n of families){const ds=qs.map(q=>q.reduce((s,x,k)=>s+x*n[k],0)),lo=Math.min(...ds),hi=Math.max(...ds);assert.ok(Math.ceil(lo+1e-5)>=hi-1e-5,'new display triangle must not cross a deformation plane');}
   }
   assert.ok(Math.abs(area-source.getArea())<1e-8+source.getArea()*1e-5,'the complete restored authored face is covered');
  }
  assert.equal(covered.size,fixture.restoredTriangleCount,'all previously restored exterior triangles remain accounted for');
 }finally{g.dispose();raw.dispose();}
});
