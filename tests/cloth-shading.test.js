import test from'node:test';import assert from'node:assert/strict';import*as T from'three';import{readFileSync}from'node:fs';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import{repairClothShading}from'../src/cloth-shading.js';
function patch(positions,normals){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('uv',new T.Float32BufferAttribute(positions.filter((_,i)=>i%3!==2),2));g.setIndex([0,1,2,3,4,5]);return g;}
const close=(a,b,tolerance=2e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
test('coplanar split corners share a continuous authored shading direction while geometry, UVs and unique corners stay unchanged',()=>{
 const angle=.3,a=[0,0,1],b=[Math.sin(angle),0,Math.cos(angle)],g=patch([0,0,0,1,0,0,1,1,0,0,0,0,1,1,0,0,1,0],[...a,...a,...a,...b,...b,...b]),p=g.attributes.position.array.slice(),uv=g.attributes.uv.array.slice(),index=g.index.array.slice(),n=g.attributes.normal.array.slice();
 try{const result=repairClothShading(g);assert.equal(result.changed,4);assert.equal(result.groups,2);for(const id of[0,2,3,4]){close(g.attributes.normal.getX(id),Math.sin(angle/2));close(g.attributes.normal.getZ(id),Math.cos(angle/2));}assert.deepEqual(g.attributes.position.array,p);assert.deepEqual(g.attributes.uv.array,uv);assert.deepEqual(g.index.array,index);for(const id of[1,5])assert.deepEqual(g.attributes.normal.array.slice(id*3,id*3+3),n.slice(id*3,id*3+3));const version=g.attributes.normal.version;assert.equal(repairClothShading(g).changed,0);assert.equal(g.attributes.normal.version,version);}
 finally{g.dispose();}
});
test('sharp folds and coincident opposing cloth walls retain their separate normals',()=>{
 for(const opposite of[false,true]){
  const p=opposite?[0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,1,0,0]:[0,0,0,1,0,0,0,1,0,0,0,0,0,0,1,1,0,0],a=[0,0,1],b=opposite?[0,0,-1]:[0,1,0],g=patch(p,[...a,...a,...a,...b,...b,...b]),before=g.attributes.normal.array.slice();
  try{assert.equal(repairClothShading(g).changed,0);assert.deepEqual(g.attributes.normal.array,before);}
  finally{g.dispose();}
 }
});
test('missing normals, degenerate faces and nonfinite authored normals cannot create a new invalid shading value',()=>{
 const empty=new T.BufferGeometry();assert.equal(repairClothShading(empty).changed,0);empty.dispose();
 const g=patch([0,0,0,1,0,0,2,0,0,0,0,0,1,0,0,2,0,0],[0,0,1,0,0,1,0,0,1,1,0,0,1,0,0,1,0,0]);try{const before=g.attributes.normal.array.slice();assert.equal(repairClothShading(g).changed,0);assert.deepEqual(g.attributes.normal.array,before);}finally{g.dispose();}
 const h=patch([0,0,0,1,0,0,1,1,0,0,0,0,1,1,0,0,1,0],[NaN,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1]);try{const before=h.attributes.normal.array.slice();assert.equal(repairClothShading(h).changed,0);assert.deepEqual(h.attributes.normal.array,before);}finally{h.dispose();}
});
test('the actual short-sleeve repair stays local, leaves every non-normal buffer intact and preserves chest-print facing',async()=>{
 const bytes=readFileSync(new URL('../public/models/short-sleeve.glb',import.meta.url)),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');asset.scene.updateMatrixWorld(true);const box=new T.Box3().setFromObject(asset.scene),center=box.getCenter(new T.Vector3()),scale=2.48/box.getSize(new T.Vector3()).y;let mesh;asset.scene.traverse(o=>{if(o.name==='Fabric')mesh=o;});const g=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);g.scale(scale,scale,scale);g.translate(-center.x*scale,.98-box.max.y*scale,-center.z*scale);
 const originals=Object.fromEntries(Object.entries(g.attributes).map(([name,a])=>[name,a.array.slice()])),indices=g.index.array.slice(),facing=z=>{const t=Math.max(0,Math.min(1,(z+.05)/.15));return t*t*(3-2*t);};
 try{const result=repairClothShading(g);assert.ok(result.changed>0&&result.changed<g.attributes.position.count*.05);assert.deepEqual(g.index.array,indices);for(const[name,a]of Object.entries(g.attributes))if(name!=='normal')assert.deepEqual(a.array,originals[name]);const p=g.attributes.position,n=g.attributes.normal;for(let i=0;i<n.count;i++){if(n.getX(i)!==originals.normal[i*3]||n.getY(i)!==originals.normal[i*3+1]||n.getZ(i)!==originals.normal[i*3+2])close(Math.hypot(n.getX(i),n.getY(i),n.getZ(i)),1);if(p.getX(i)>-.5&&p.getX(i)<.4&&p.getY(i)>.1&&p.getY(i)<.5)close(facing(n.getZ(i)),facing(originals.normal[i*3+2]),1e-7);}}
 finally{g.dispose();}
});
