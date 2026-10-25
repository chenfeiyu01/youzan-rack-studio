import test from'node:test';import assert from'node:assert/strict';
import{SurfaceContacts}from'../src/surface-contact.js';

function fixture(groups=false){
 const positions=[],edges=[],weights=[];
 for(let e=0;e<197;e++){
  const x=(e%13-6)*.012,y=(e%11-5)*.014,z=(e%7-3)*.013;
  positions.push(x-.05,y-.03,z-.02,x+.06,y+.04,z+.025);edges.push(e*2,e*2+1);weights.push(e%9===0?0:1,e%9===0?0:.7);
 }
 const data={positions,edges,triangles:[]};if(groups)data.groups=Uint8Array.from(weights,(_,i)=>Math.floor(i/2)%3);
 const links=Array.from({length:35},(_,i)=>({a:i*2,b:(i+1)*2}));
 const contacts=new SurfaceContacts(data,new Float64Array(weights),links),old=new Float64Array(positions),next=new Float64Array(positions);
 for(let i=0;i<next.length;i++)next[i]+=.009*Math.sin(i*1.7);
 return{contacts,old,next};
}
// Uncompressed spatial lists and a Set are an independent specification of
// first visits. Query order matters because CCD contacts project sequentially.
function reference(c,old,p,scale){
 const count=c.edgeCount,edges=c.edges,cell=.18*scale,pad=c.thickness*scale,bounds=[],cells=new Map(),active=[],key=(x,y,z)=>((x&1023)<<20)|((y&1023)<<10)|(z&1023);
 const each=(b,callback)=>{for(let x=Math.floor(b[0]/cell);x<=Math.floor(b[3]/cell);x++)for(let y=Math.floor(b[1]/cell);y<=Math.floor(b[4]/cell);y++)for(let z=Math.floor(b[2]/cell);z<=Math.floor(b[5]/cell);z++)callback(key(x,y,z));};
 for(let e=0;e<count;e++){
  const a=edges[e*2]*3,b=edges[e*2+1]*3,box=[];
  for(let axis=0;axis<3;axis++){box[axis]=Math.min(old[a+axis],old[b+axis],p[a+axis],p[b+axis])-pad;box[axis+3]=Math.max(old[a+axis],old[b+axis],p[a+axis],p[b+axis])+pad;}
  bounds[e]=box;const r=c.region;active[e]=!r||![0,1,2].some(k=>box[k]>r[k+3]||box[k+3]<r[k]);
  if(active[e])each(box,hash=>{if(!cells.has(hash))cells.set(hash,[]);cells.get(hash).push(e);});
 }
 const result=[];
 for(let e=0;e<count;e++)if(active[e]){
  const visited=new Set(),a=edges[e*2],b=edges[e*2+1];
  each(bounds[e],hash=>{for(const other of cells.get(hash)??[]){
   if(other<=e||visited.has(other))continue;visited.add(other);const u=edges[other*2],v=edges[other*2+1];
   if(c.groups&&c.groups[a]===c.groups[u])continue;
   if([0,1,2].some(k=>bounds[e][k]>bounds[other][k+3]||bounds[e][k+3]<bounds[other][k]))continue;
   if(!c.groups&&(c.shared.excluded[a].has(u)||c.shared.excluded[a].has(v)||c.shared.excluded[b].has(u)||c.shared.excluded[b].has(v)||c.shared.original.edgePairs.has(e*count+other)))continue;
   if(c.weights[a]+c.weights[b]+c.weights[u]+c.weights[v]===0)continue;
   result.push([e,other]);
  }});
 }
 return result;
}
function actual(c,old,p,scale){const calls=[];c.edgeCrossing=(a,b,u,v)=>{calls.push([a/2,u/2]);return null;};c.edgeContacts(old,p,scale);return calls;}
test('edge candidate first-visit order matches uncompressed cells across sign bits, topology exclusions and duplicate cells',()=>{
 const{contacts:c,old,next}=fixture();const expected=reference(c,old,next,1),observed=actual(c,old,next,1);assert.deepEqual(observed,expected);
 for(const id of[31,32,63,64,95,96,196])assert.ok(observed.some(pair=>pair[1]===id),'boundary edge '+id);
 assert.equal(new Set(observed.map(x=>x.join(':'))).size,observed.length);
});
test('grouped garments, clipped query regions, pinned edges and scale keep the same candidate order',()=>{
 for(const scale of[.7,1,1.6]){const{contacts:c,old,next}=fixture(true);c.region=[-.06,-.04,-.025,.045,.04,.025];assert.deepEqual(actual(c,old,next,scale),reference(c,old,next,scale));}
});
test('query epochs can wrap and recycled cells never suppress an edge from a later query',()=>{
 const{contacts:c,old,next}=fixture();c.edgeStamp=2147483646;assert.deepEqual(actual(c,old,next,1),reference(c,old,next,1));
 for(let i=0;i<next.length;i++)next[i]+=.08*Math.cos(i*.7);
 assert.deepEqual(actual(c,old,next,1),reference(c,old,next,1));
 c.region=[4,4,4,5,5,5];assert.deepEqual(actual(c,old,next,1),[]);c.region=null;
 assert.deepEqual(actual(c,old,next,1),reference(c,old,next,1));
});

test('repeated broad, clipped and empty edge scans never retain old bucket words',()=>{
 const{contacts:c,old,next}=fixture(true),regions=[null,[-.03,-.02,-.01,.03,.02,.01],[4,4,4,5,5,5],null];
 for(let repeat=0;repeat<4;repeat++)for(const region of regions){c.region=region;assert.deepEqual(actual(c,old,next,1),reference(c,old,next,1));}
 const pool=c.edgeGrid.pool.slice(),storage=pool.map(b=>[b.words,b.bits]);
 for(const region of regions){c.region=region;assert.deepEqual(actual(c,old,next,1),reference(c,old,next,1));}
 assert.equal(c.edgeGrid.pool.length,pool.length);pool.forEach((b,i)=>{assert.equal(c.edgeGrid.pool[i],b);assert.equal(b.words,storage[i][0]);assert.equal(b.bits,storage[i][1]);});
});
