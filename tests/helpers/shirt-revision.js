import{readFileSync}from'node:fs';import{gunzipSync}from'node:zlib';import{createHash}from'node:crypto';import assert from'node:assert/strict';
export const revision=JSON.parse(readFileSync(new URL('../fixtures/shirt-junction-revision.json',import.meta.url)));
const unpack=(s,Type)=>{const b=gunzipSync(Buffer.from(s,'base64'));return new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
export const priorIndex=unpack(revision.priorFaceIndex,Uint32Array),parents=unpack(revision.finalParents,Int32Array),patches=unpack(revision.finalPatchCodes,Int8Array),cavityUpdates=unpack(revision.priorCavityUpdates,Uint32Array);
export const hash=b=>createHash('sha256').update(b).digest('hex');
// Restore only the enumerated material revision for historical geometry tests.
// Every replacement value must still match the actual accepted rebake.
export function priorCavity(attribute){const array=attribute.array.slice();assert.equal(cavityUpdates.length,revision.cavityRecords*7);for(let o=0;o<cavityUpdates.length;o+=7){const id=cavityUpdates[o];for(let k=0;k<3;k++){assert.equal(array[id*4+k],cavityUpdates[o+4+k],'accepted local cavity update');array[id*4+k]=cavityUpdates[o+1+k];}}return array;}
export function assertOutsideSourceFaces(g){
 assert.equal(parents.length,g.index.count/3);assert.equal(patches.length,parents.length);assert.equal(priorIndex.length,revision.prior.faceCount*3);
 const children=new Map();for(let f=0;f<parents.length;f++){const p=parents[f];assert.ok(p>=-1&&p<revision.prior.faceCount);assert.ok([0,1,-1,3].includes(patches[f]));if(p<0){assert.notEqual(patches[f],0);continue;}assert.equal(patches[f],0);if(!children.has(p))children.set(p,[]);children.get(p).push(f);}
 const position=g.attributes.position,point=i=>[position.getX(i),position.getY(i),position.getZ(i)],dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),band=revision.band;let count=0;
 for(let p=0;p<priorIndex.length/3;p++){const ids=Array.from(priorIndex.subarray(p*3,p*3+3)),P=ids.map(point);if(!P.every(x=>dot(x,band.rootNormal)<band.root-1e-6)&&!P.every(x=>dot(x,band.cuffNormal)>band.cuff+1e-6))continue;count++;const out=children.get(p)??[];assert.equal(out.length,1,'one unchanged outside-band source face '+p);assert.deepEqual([0,1,2].map(k=>g.index.getX(out[0]*3+k)),ids,'exact outside-band source indices and winding '+p);}
 assert.equal(count,revision.expectedOutsideSourceFaces);return count;
}
