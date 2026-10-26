import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{loadGeometryAsset}from'./helpers/geometry-asset.js';
import{modelConfig}from'../src/model-config.js';
const manifest=JSON.parse(readFileSync(new URL('../public/models/web-models-manifest.json',import.meta.url)));
const point=(g,i)=>[g.attributes.position.getX(i),g.attributes.position.getY(i),g.attributes.position.getZ(i)].join(':');
function boundary(g){const e=new Map(),a=g.index.array;for(let i=0;i<a.length;i+=3)for(let j=0;j<3;j++){const p=point(g,a[i+j]),q=point(g,a[i+(j+1)%3]);if(p===q)continue;const k=p<q?p+'|'+q:q+'|'+p,v=e.get(k)??[0,0];v[0]++;v[1]+=p<q?1:-1;e.set(k,v);}return new Map([...e].filter(([,v])=>v[0]!==2||v[1]!==0).sort(([a],[b])=>a.localeCompare(b)));}
function vertex(g,i){return Object.keys(g.attributes).sort().map(k=>{const a=g.attributes[k];return Array.from(a.array.subarray(i*a.itemSize,(i+1)*a.itemSize)).join(',');}).join('|');}
function faces(g,predicate=()=>true){const out=[];for(let i=0;i<g.index.count;i+=3){const ids=Array.from(g.index.array.subarray(i,i+3));if(!ids.every(id=>predicate(g,id)))continue;const t=ids.map(id=>vertex(g,id)),first=t.indexOf([...t].sort()[0]);out.push([t[first],t[(first+1)%3],t[(first+2)%3]].join(';'));}return out.sort();}
for(const[file,record]of Object.entries(manifest.models))test(file+' preserves supported fabric, openings, retained attributes and rigid meshes',async()=>{
 const url=new URL('../public/models/'+file,import.meta.url),bytes=readFileSync(url);assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
 assert.ok(Object.values(modelConfig).some(c=>c.url.endsWith('/'+file)),'runtime must use the optimized model');
 const [source,target]=await Promise.all([loadGeometryAsset(new URL('../public/models/'+record.source,import.meta.url)),loadGeometryAsset(url)]);
 let before=0,after=0;
 for(const info of record.meshes){const a=source.scene.getObjectByName(info.name),b=target.scene.getObjectByName(info.name),g=a.geometry,h=b.geometry;before+=g.index.count;after+=h.index.count;
  assert.deepEqual(b.userData,a.userData);assert.deepEqual(Object.keys(h.attributes).sort(),Object.keys(g.attributes).sort());
  const vertices=new Set(Array.from({length:g.attributes.position.count},(_,i)=>vertex(g,i)));for(let i=0;i<h.attributes.position.count;i++)assert.ok(vertices.has(vertex(h,i)),'retained UV, normals, AO and thickness must remain paired');
  assert.deepEqual(boundary(h),boundary(g),info.name+' openings and edge incidence');
  if(['Fabric','Fabric_Inner'].includes(info.name)){
   // Faces crossing the lock boundary can collapse onto locked vertices; every
   // original face wholly inside the supported region must still survive.
   const supported=new Set(faces(h));for(const face of faces(g,(g,i)=>g.attributes.position.getY(i)>=.55))assert.ok(supported.has(face),'original supported face preserved');
  }
  else assert.deepEqual(faces(h),faces(g),'hanger and trim unchanged');
  assert.ok([...h.index.array].every(id=>id<h.attributes.position.count));
 }
 assert.ok(after<before*.3,'at least 70% fewer triangles');
});
