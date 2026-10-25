import test from'node:test';
import assert from'node:assert/strict';
import{SurfaceParticleGrid}from'../src/surface-particle-grid.js';
const key=(x,y,z)=>((x&1023)<<20)|((y&1023)<<10)|(z&1023);
function bucket(grid,key){const list=[];for(let node=grid.first(key);node!==-1;node=grid.next[node]){list.push(node);assert.ok(list.length<=grid.next.length,'bucket chain must terminate');}return list;}
test('particle buckets match Map insertion order for packed negative and positive cells',()=>{
  const count=1500,grid=new SurfaceParticleGrid(count),reference=new Map();
  for(let node=0;node<count;node++){
    const cell=node%3===0?key(-3,0,1):key((node*17)%37-18,(node*13)%23-11,(node*7)%11-5);
    if(!reference.has(cell))reference.set(cell,[]);reference.get(cell).push(node);grid.add(cell,node);
  }
  for(const[cell,nodes]of reference)assert.deepEqual(bucket(grid,cell),nodes);
  assert.equal(grid.first(key(200,200,200)),-1);
});
test('hash collisions keep distinct cells and never reorder their particles',()=>{
  const grid=new SurfaceParticleGrid(32),reference=new Map();
  // These keys share a starting hash slot in the empty table.
  const cells=Array.from({length:16},(_,i)=>i*64);assert.equal(new Set(cells.map(k=>grid.slot(k))).size,1);
  for(let node=0;node<32;node++){const cell=cells[node%16];if(!reference.has(cell))reference.set(cell,[]);reference.get(cell).push(node);grid.add(cell,node);}
  for(const[cell,nodes]of reference)assert.deepEqual(bucket(grid,cell),nodes);
  assert.equal(grid.first(4096),-1);
});
test('reset clears occupancy and stale links when particle indices are reused',()=>{
  const grid=new SurfaceParticleGrid(100);for(let i=0;i<100;i++)grid.add(0,i);assert.equal(bucket(grid,0).length,100);
  grid.reset();assert.equal(grid.first(0),-1);for(let i=0;i<100;i++)grid.add(key(i,1,0),i);
  assert.equal(grid.first(0),-1);for(let i=0;i<100;i++)assert.deepEqual(bucket(grid,key(i,1,0)),[i]);
});
