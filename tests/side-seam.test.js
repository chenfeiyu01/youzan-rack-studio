import{priorCavity}from'./helpers/shirt-revision.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import{createHash}from'node:crypto';
import*as T from'three';
import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';

test('the exposed side seam loses its backward spike while authored cloth outside the repair stays intact',async()=>{
 const expected=JSON.parse(readFileSync(new URL('./fixtures/side-seam-fairing.json',import.meta.url))),bytes=readFileSync(new URL('../public/models/short-sleeve.glb',import.meta.url)),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');asset.scene.updateMatrixWorld(true);let mesh;asset.scene.traverse(o=>{if(o.name==='Fabric')mesh=o;});const raw=mesh.geometry;
 for(const[name,e]of Object.entries(expected.attributes)){
  const a=raw.attributes[name],skip=new Set(e.allowed);assert.equal(a.itemSize,e.itemSize);assert.equal(a.array.constructor.name,e.arrayType);assert.equal(a.normalized,e.normalized);
  const sourceValues=name==='color'?priorCavity(a):a.array;
  const values=new a.array.constructor((expected.sourceVertices-skip.size)*a.itemSize);let offset=0;
  for(let i=0;i<expected.sourceVertices;i++)if(!skip.has(i)){values.set(sourceValues.subarray(i*a.itemSize,(i+1)*a.itemSize),offset);offset+=a.itemSize;}
  assert.equal(createHash('sha256').update(new Uint8Array(values.buffer)).digest('hex'),e.unchangedSha256,name+' outside the approved local repair');
 }
 assert.equal(expected.attributes.uv.allowed.length,0,'original cloth coordinates are retained');assert.equal(expected.attributes.color.allowed.length,0,'original cavity colors are retained');
 const box=new T.Box3().setFromObject(asset.scene),center=box.getCenter(new T.Vector3()),scale=2.48/box.getSize(new T.Vector3()).y,g=raw.clone().applyMatrix4(mesh.matrixWorld);g.scale(scale,scale,scale);g.translate(-center.x*scale,.98-box.max.y*scale,-center.z*scale);
 for(const move of expected.moves){const before=new T.Vector3(...move.before),now=new T.Vector3().fromBufferAttribute(g.attributes.position,move.id);assert.ok(Math.abs(before.x)>.60&&Math.abs(before.x)<.70&&before.y>-.40&&before.y<.04&&Math.abs(before.z)<.12,'repair stays on the side margin');assert.ok(before.distanceTo(now)<=.006001,'source correction stays below 1.7mm');}
 for(const change of expected.normalChanges){const before=new T.Vector3(...change.before),now=new T.Vector3().fromBufferAttribute(raw.attributes.normal,change.id);assert.ok(before.angleTo(now)<.86,'local shading follows the corrected surface without flipping');}
 const edge=expected.edge.map(i=>new T.Vector3().fromBufferAttribute(g.attributes.position,i));
 for(let i=1;i<edge.length;i++)assert.ok(edge[i-1].y-edge[i].y>.0005,'the visible seam must run down the body without the original backward tooth');
 g.dispose();raw.dispose();
});
