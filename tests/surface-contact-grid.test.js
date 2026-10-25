import test from'node:test';import assert from'node:assert/strict';import{ContactWordGrid,orderContactHits}from'../src/surface-contact-grid.js';
const hash=(x,y,z)=>((x&1023)<<20)|((y&1023)<<10)|(z&1023);
function compare(grid,bounds,active,cell){
 grid.reset(bounds,active,cell);const reference=new Map();
 for(let id=0;id<active.length;id++)if(active[id]){const j=id*6;
  for(let x=Math.floor(bounds[j]/cell);x<=Math.floor(bounds[j+3]/cell);x++)for(let y=Math.floor(bounds[j+1]/cell);y<=Math.floor(bounds[j+4]/cell);y++)for(let z=Math.floor(bounds[j+2]/cell);z<=Math.floor(bounds[j+5]/cell);z++){
   const key=hash(x,y,z);grid.add(key,id);let bucket=reference.get(key);if(!bucket){bucket={words:[],bits:[],count:0};reference.set(key,bucket);}const word=id>>>5,bit=1<<(id&31),last=bucket.count-1;if(last>=0&&bucket.words[last]===word)bucket.bits[last]|=bit;else{bucket.words[bucket.count]=word;bucket.bits[bucket.count++]=bit;}
  }
 }
 const compact=b=>b?{words:Array.from(b.words).slice(0,b.count),bits:Array.from(b.bits).slice(0,b.count).map(n=>n>>>0),count:b.count}:null;
 for(const[key,bucket]of reference)assert.deepEqual(compact(grid.get(key)),compact(bucket),String(key));
 for(let i=0;i<150;i++){const key=hash(i*31-2600,i*13-1222,i*9-405);assert.deepEqual(compact(grid.get(key)),compact(reference.get(key)),String(key));}
 return grid.dense;
}
test('dense word storage preserves bucket order, high bits, hash wrapping and reuse exactly',()=>{
 const count=1500,bounds=new Float64Array(count*6),active=new Uint8Array(count),grid=new ContactWordGrid(count);let seed=774;
 const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(const[center,spread]of[[0,.4],[1023.8*.18,.7],[-1024.2*.18,.2],[0,.1]]){
  for(let id=0;id<count;id++){active[id]=id%3!==0;for(let k=0;k<3;k++){const value=center+(random()-.5)*spread;bounds[id*6+k]=value;bounds[id*6+3+k]=value+.03;}}
  assert.equal(compare(grid,bounds,active,.18),true);assert.ok(grid.slots.byteLength+grid.words.byteLength+grid.bits.byteLength<=4*1024*1024);
 }
 active.fill(0);assert.equal(compare(grid,bounds,active,.18),false);
});
test('large or explicitly capped volumes fall back without changing any hash bucket',()=>{
 const count=96,bounds=new Float64Array(count*6),active=new Uint8Array(count).fill(1);
 for(let id=0;id<count;id++)for(let k=0;k<3;k++){bounds[id*6+k]=(id%2)*500;bounds[id*6+k+3]=bounds[id*6+k]+.02;}
 assert.equal(compare(new ContactWordGrid(count),bounds,active,.18),false);
 bounds.fill(.02);assert.equal(compare(new ContactWordGrid(count,{denseByteLimit:0}),bounds,active,.18),false);
});
test('wide word indices retain all 256 populated words without slot truncation',()=>{
 const count=8192,bounds=new Float64Array(count*6).fill(.02),active=new Uint8Array(count).fill(1),grid=new ContactWordGrid(count);
 assert.equal(compare(grid,bounds,active,.18),true);const bucket=grid.get(hash(0,0,0));assert.equal(bucket.count,256);assert.equal(bucket.words[255],255);assert.equal(bucket.bits[255],0xffffffff);
});

test('cached detection restores first-visit contact order including aliased cell ranges',()=>{
 const cell=.18,count=24,bounds=new Float64Array(count*6),cells=new Map(),query=[.01,.01,.01,.4,.25,.25];
 for(let id=0;id<count;id++){
  bounds.set([id%3*.06,id%4*.04,id%2*.03,id%3*.06+.3+(id%5===0?1024*cell:0),.3,.3],id*6);
  const j=id*6;for(let x=Math.floor(bounds[j]/cell);x<=Math.floor(bounds[j+3]/cell);x++)for(let y=Math.floor(bounds[j+1]/cell);y<=Math.floor(bounds[j+4]/cell);y++)for(let z=Math.floor(bounds[j+2]/cell);z<=Math.floor(bounds[j+5]/cell);z++){const key=hash(x,y,z),ids=cells.get(key)??[];ids.push(id);cells.set(key,ids);}
 }
 const seen=new Set(),expected=[];
 for(let x=Math.floor(query[0]/cell);x<=Math.floor(query[3]/cell);x++)for(let y=Math.floor(query[1]/cell);y<=Math.floor(query[4]/cell);y++)for(let z=Math.floor(query[2]/cell);z<=Math.floor(query[5]/cell);z++)for(const id of cells.get(hash(x,y,z))??[]){if(seen.has(id))continue;seen.add(id);if(id%2===0)expected.push(id);}
 const hits=Array.from({length:count},(_,id)=>[id,{sentinel:id}]).filter(([id])=>id%2===0).reverse();orderContactHits(hits,bounds,cell,...query.slice(0,3));
 assert.deepEqual(hits.map(([id])=>id),expected);assert.ok(hits.every(([id,contact])=>contact.sentinel===id));
});

test('monotone edge-word cursors retain lower bounds across repeated queries and reset between scans',()=>{
 const count=8192,bounds=new Float64Array(count*6).fill(.02),active=new Uint8Array(count).fill(1);
 for(const denseByteLimit of[0,4*1024*1024]){
  const grid=new ContactWordGrid(count,{denseByteLimit});compare(grid,bounds,active,.18);const bucket=grid.get(hash(0,0,0));
  for(let pass=0;pass<3;pass++){grid.beginQueries();for(let word=0;word<258;word++)for(let repeat=0;repeat<3;repeat++)assert.equal(grid.firstWord(bucket,word),Math.min(256,word));}
  grid.queryEpoch=2147483646;grid.beginQueries();assert.equal(grid.firstWord(bucket,0),0);
 }
});
