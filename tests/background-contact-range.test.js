import test from'node:test';import assert from'node:assert/strict';
import{SurfaceCloth as After}from'../src/surface-physics.js';import{SurfaceParticleGrid}from'../src/surface-particle-grid.js';
function state(p,r,w,links=[]){const count=p.length/3,neighbors=Array.from({length:count},()=>new Set());for(const[a,b]of links){neighbors[a].add(b);neighbors[b].add(a);}const grid=new SurfaceParticleGrid(count);let queries=0;const first=grid.first;grid.first=function(key){queries++;return first.call(this,key);};return{count,position:new Float64Array(p),rest:new Float64Array(r),inverseMass:new Float64Array(w),neighbors,backgroundGrid:grid,backgroundCellOrigins:new Float64Array(p.length),queries(){return this.referenceQueries??queries;}};}
// Independent Map/array oracle: visit all27 cells in original order. It has
// no slab pruning, spill cache, typed hash buckets or periodic-distance bound.
function reference(s,scale){
 const bins=new Map(),p=s.position,r=s.rest,w=s.inverseMass,cell=.06*scale;s.referenceQueries=0;
 const key=(x,y,z)=>((x&1023)<<20)|((y&1023)<<10)|(z&1023);
 for(let a=0;a<s.count;a++){
  const i=a*3,g=[Math.floor(p[i]/cell),Math.floor(p[i+1]/cell),Math.floor(p[i+2]/cell)];
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
   s.referenceQueries++;
   for(const b of bins.get(key(g[0]+x,g[1]+y,g[2]+z))??[]){
    if(s.neighbors[a].has(b)||w[a]+w[b]===0)continue;const j=b*3,dx=p[i]-p[j],dy=p[i+1]-p[j+1],dz=p[i+2]-p[j+2],distance=Math.sqrt(dx*dx+dy*dy+dz*dz);
    if(distance>=.024*scale||distance<1e-8)continue;
    const rx=r[i]-r[j],ry=r[i+1]-r[j+1],rz=r[i+2]-r[j+2],radius=Math.min(.024,Math.sqrt(rx*rx+ry*ry+rz*rz)*.5)*scale;
    if(distance>=radius)continue;const push=(radius-distance)/(distance*(w[a]+w[b]));
    p[i]+=dx*push*w[a];p[i+1]+=dy*push*w[a];p[i+2]+=dz*push*w[a];p[j]-=dx*push*w[b];p[j+1]-=dy*push*w[b];p[j+2]-=dz*push*w[b];
   }
  }
  const id=key(...g);if(!bins.has(id))bins.set(id,[]);bins.get(id).push(a);
 }
 return bins;
}
function check(a,b,scale){
 const expected=reference(a,scale);After.prototype.separateSurface.call(b,scale);assert.deepEqual(b.position,a.position);
 const grid=b.backgroundGrid,actual=new Map();for(let slot=0;slot<grid.heads.length;slot++){if(grid.heads[slot]===-1)continue;const ids=[];for(let i=grid.heads[slot];i!==-1;i=grid.next[i])ids.push(i);actual.set(grid.keys[slot],ids);}
 const ordered=m=>[...m].sort((a,b)=>a[0]-b[0]);assert.deepEqual(ordered(actual),ordered(expected));
}
test('a previously inserted particle pushed out of its original cell remains reachable',()=>{
 const p=[.059,0,0,.057,0,0,.088,0,0],r=[0,0,0,1,0,0,2,0,0],w=[1,1,1],a=state(p,r,w),b=state(p,r,w);check(a,b,1);assert.ok(a.position[0]>.06,'the first particle actually leaves the stored cell');assert.ok(a.position[6]>.088,'the next query must find and push against it');
});
test('query pruning preserves exact corrections and order under dense3D motion, changing scales and fixed particles',()=>{
 for(let seed=1;seed<=32;seed++){
  let word=seed;const random=()=>{word^=word<<13;word^=word>>>17;word^=word<<5;return(word>>>0)/4294967296;};
  const p=[],r=[],w=[],links=[];for(let i=0;i<100;i++){for(let k=0;k<3;k++){p.push((random()-.5)*.22);r.push((random()-.5)*2);}w.push(i%7===0?0:.35+random()*3);if(i)links.push([i,i-1]);}
  const a=state(p,r,w,links),b=state(p,r,w,links);for(const scale of[.35,.65,1,1.28,2.5])check(a,b,scale);
 }
});
test('cell boundaries and1024cell periodic aliases retain conservative query coverage',()=>{
 for(const scale of[.5,1,2])for(const translation of[-1024,-1,0,1,1024,2048]){
  const width=.06*scale,base=translation*width,p=[base+.059*scale,0,0,base+.057*scale,0,0,base+.088*scale,0,0,base+1024*width+.058*scale,0,0],r=[0,0,0,1,0,0,2,0,0,3,0,0],w=[1,1,1,1];check(state(p,r,w),state(p,r,w),scale);
 }
});
test('fixed, collapsed and large-coordinate inputs preserve the original result',()=>{
 for(const offset of[0,1e-13,1e4,1e12])for(const weights of[[0,0,0],[0,1,2],[1,1,1]]){
  const p=[offset,0,0,offset+1e-9,0,0,offset+.023,0,0],r=[0,0,0,.001,0,0,2,0,0];check(state(p,r,weights),state(p,r,weights),1);
 }
});
test('unreachable neighboring slabs avoid grid queries without reducing candidate contact reach',t=>{
 const p=[],r=[],w=[];for(let i=0;i<128;i++){p.push(i*.06+.03,.03,.03);r.push(i*.06+.03,.03,.03);w.push(1);}const a=state(p,r,w),b=state(p,r,w);check(a,b,1);assert.ok(b.queries()<a.queries()/4);t.diagnostic(JSON.stringify({beforeQueries:a.queries(),afterQueries:b.queries()}));
});
