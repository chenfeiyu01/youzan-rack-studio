import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';

// Offline preparation may reorder draws; it must preserve every accepted
// fold, shading split, ink coordinate and oriented surface, including duplicates.
test('the accepted cloth attributes and oriented surface survive offline preparation exactly',async()=>{
 const expected=JSON.parse(readFileSync(new URL('./fixtures/shirt-surface-invariants.json',import.meta.url))),bytes=readFileSync(new URL('../public/models/short-sleeve.glb',import.meta.url)),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');let mesh;asset.scene.traverse(o=>{if(o.name==='Fabric')mesh=o;});assert.ok(mesh);
 const hash=b=>createHash('sha256').update(b).digest('hex');
 assert.deepEqual(Object.keys(mesh.geometry.attributes).sort(),Object.keys(expected.attributes).sort());
 for(const[name,values]of Object.entries(expected.attributes)){
  const a=mesh.geometry.attributes[name];assert.equal(a.count,values.count,name+' records');assert.equal(a.itemSize,values.itemSize,name+' layout');assert.equal(hash(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength)),values.sha256,name+' source values');
 }
 const index=mesh.geometry.index.array,faces=[];for(let i=0;i<index.length;i+=3){const p=[index[i],index[i+1],index[i+2]],m=p.indexOf(Math.min(...p));faces.push([p[m],p[(m+1)%3],p[(m+2)%3]].join(','));}faces.sort();assert.equal(faces.length,expected.faceCount);assert.equal(hash(faces.join('\n')),expected.orientedFaceMultisetSha256,'no changed, missing, duplicated or reversed surface faces');mesh.geometry.dispose();
});
