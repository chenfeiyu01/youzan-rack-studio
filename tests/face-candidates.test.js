import test from'node:test';import assert from'node:assert/strict';import{SurfaceContacts}from'../src/surface-contact.js';
function fixture(grouped=false){
 const positions=[],triangles=[],weights=[];
 for(let f=0;f<101;f++){
  const x=(f%11-5)*.027,y=(f%9-4)*.025,z=(f%5-2)*.014,n=positions.length/3;
  positions.push(x-.04,y-.03,z,x+.05,y-.02,z+.008,x,y+.04,z-.006);triangles.push(n,n+1,n+2);weights.push(f%9===0?0:1,f%9===0?0:.7,f%9===0?0:.4);
 }
 const data={positions,triangles};if(grouped)data.groups=Uint8Array.from(weights,(_,i)=>Math.floor(i/3)%3);
 const c=new SurfaceContacts(data,new Float64Array(weights)),old=new Float64Array(positions),p=Float64Array.from(old,(v,i)=>v+.013*Math.sin(i*.73));return{c,old,p};
}
function reference(c,old,p,scale){
 const pad=c.thickness*scale,cell=.18*scale,t=c.triangles,bounds=[],grid=new Map(),key=(x,y,z)=>((x&1023)<<20)|((y&1023)<<10)|(z&1023),pairs=[];
 const each=(b,fn)=>{for(let x=Math.floor(b[0]/cell);x<=Math.floor(b[3]/cell);x++)for(let y=Math.floor(b[1]/cell);y<=Math.floor(b[4]/cell);y++)for(let z=Math.floor(b[2]/cell);z<=Math.floor(b[5]/cell);z++)fn(key(x,y,z));};
 const outside=b=>c.region&&[0,1,2].some(k=>b[k]>c.region[k+3]||b[k+3]<c.region[k]);
 for(let face=0;face<c.faceCount;face++){
  const ids=[t[face*3],t[face*3+1],t[face*3+2]],box=[];
  for(let k=0;k<3;k++){const coordinates=ids.flatMap(id=>[old[id*3+k],p[id*3+k]]);box[k]=Math.min(...coordinates)-pad;box[k+3]=Math.max(...coordinates)+pad;}
  bounds[face]=box;if(outside(box))continue;
  each(box,hash=>{if(!grid.has(hash))grid.set(hash,[]);grid.get(hash).push(face);});
 }
 for(let node=0;node<c.count;node++){
  const box=[];for(let k=0;k<3;k++){box[k]=Math.min(old[node*3+k],p[node*3+k])-pad;box[k+3]=Math.max(old[node*3+k],p[node*3+k])+pad;}if(outside(box))continue;
  const seen=new Set();each(box,hash=>{for(const face of grid.get(hash)??[]){
   if(seen.has(face))continue;seen.add(face);const ids=[t[face*3],t[face*3+1],t[face*3+2]];
   if(c.groups&&c.groups[node]===c.faceGroups[face])continue;
   if([0,1,2].some(k=>box[k]>bounds[face][k+3]||box[k+3]<bounds[face][k]))continue;
   if(!c.groups&&(ids.some(id=>c.shared.excluded[node].has(id))||c.shared.original.faces[node].has(face)))continue;
   if(c.weights[node]+c.weights[ids[0]]+c.weights[ids[1]]+c.weights[ids[2]]===0)continue;pairs.push([node,face]);
  }});
 }
 return pairs;
}
function actual(c,old,p,scale){
 const calls=[],byTriangle=new Map();for(let f=0;f<c.faceCount;f++)byTriangle.set(c.triangles.slice(f*3,f*3+3).join(','),f);
 c.crossing=(node,a,b,d)=>{calls.push([node,byTriangle.get([a,b,d].join(','))]);return null;};c.edgeContacts=()=>{};
 c.solve(old,p,scale,c.region??null);assert.equal(c.candidateChecks,calls.length);return calls;
}
test('point-face candidate order agrees with uncompressed cells and independent sets across word boundaries and topology exclusions',()=>{
 const{c,old,p}=fixture();const expected=reference(c,old,p,1),observed=actual(c,old,p,1);assert.deepEqual(observed,expected);
 for(const id of[31,32,63,64,95,96,100])assert.ok(observed.some(pair=>pair[1]===id));assert.equal(new Set(observed.map(x=>x.join(':'))).size,observed.length);
});
test('point-face queries preserve grouped contact, clipping, scale, changing pins, translated cells and epoch wrap',()=>{
 const{c,old,p}=fixture(true);
 for(const scale of[.7,1,1.6]){
  c.region=[-.08,-.07,-.025,.08,.07,.025];c.stamp=2147483646;assert.deepEqual(actual(c,old,p,scale),reference(c,old,p,scale));
  c.region=[4,4,4,5,5,5];assert.deepEqual(actual(c,old,p,scale),[]);c.region=null;
  c.weights.fill(0);assert.deepEqual(actual(c,old,p,scale),[]);c.weights[0]=1;assert.deepEqual(actual(c,old,p,scale),reference(c,old,p,scale));
  for(let k=0;k<old.length;k++){old[k]-=1024*.18;p[k]-=1024*.18;}
  assert.deepEqual(actual(c,old,p,scale),reference(c,old,p,scale));c.weights.fill(1);
 }
});

test('repeated broad, clipped and empty face scans never retain old bucket words',()=>{
 const{c,old,p}=fixture(true),regions=[null,[-.04,-.03,-.01,.04,.03,.01],[4,4,4,5,5,5],null];
 for(let repeat=0;repeat<4;repeat++)for(const region of regions){c.region=region;assert.deepEqual(actual(c,old,p,1),reference(c,old,p,1));}
 const pool=c.faceGrid.pool.slice(),storage=pool.map(b=>[b.words,b.bits]);
 for(const region of regions){c.region=region;assert.deepEqual(actual(c,old,p,1),reference(c,old,p,1));}
 assert.equal(c.faceGrid.pool.length,pool.length);pool.forEach((b,i)=>{assert.equal(c.faceGrid.pool[i],b);assert.equal(b.words,storage[i][0]);assert.equal(b.bits,storage[i][1]);});
});
