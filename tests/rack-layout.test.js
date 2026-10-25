import test from'node:test';
import assert from'node:assert/strict';
import{garmentRackX,garmentRackPositions,rackCameraX}from'../src/rack-layout.js';
import{readFileSync}from'node:fs';
import{SurfaceCloth}from'../src/surface-physics.js';
test('sharing one open slot keeps hooks bounded and ordered throughout every handoff',()=>{
 for(let from=0;from<10;from++)for(let to=0;to<10;to++)for(let step=0;step<=20;step++){
  const progress=step/20,space=new Array(10).fill(0);space[from]+=1-progress;space[to]+=progress;
  const positions=garmentRackPositions(10,space);
  assert.ok(positions[0]>=-3.945-1e-10&&positions[9]<=3.945+1e-10);
  for(let i=1;i<10;i++)assert.ok(positions[i]-positions[i-1]>=.73-1e-10);
  for(let i=0;i<10;i++)assert.ok(Math.abs(positions[i]-((1-progress)*garmentRackX(i,10,from)+progress*garmentRackX(i,10,to)))<1e-10);
 }
});
test('adjacent handoffs keep all unrelated slots and the total rack span fixed',()=>{
 for(let from=1;from<8;from++)for(const to of[from-1,from+1])for(let step=0;step<=20;step++){
  const space=new Array(10).fill(0);space[from]=1-step/20;space[to]=step/20;
  const positions=garmentRackPositions(10,space);
  for(let i=0;i<10;i++)if(i!==from&&i!==to)assert.ok(Math.abs(positions[i]-garmentRackX(i,10,from))<1e-10);
 }
 assert.deepEqual(garmentRackPositions(10),Array.from({length:10},(_,i)=>garmentRackX(i,10)));
 for(let selected=0;selected<10;selected++){
  const space=new Array(10).fill(0);space[selected]=1;
  assert.deepEqual(garmentRackPositions(10,space),Array.from({length:10},(_,i)=>garmentRackX(i,10,selected)));
 }
});

test('adjacent selection changes move only the two hangers that exchange the open space',()=>{
  const changed=[];
  for(let i=0;i<10;i++){const delta=garmentRackX(i,10,7)-garmentRackX(i,10,6);if(Math.abs(delta)>1e-12){changed.push(i);assert.ok(Math.abs(delta+.66)<1e-12);}}
  assert.deepEqual(changed,[6,7]);
});
test('view centering never changes the selected garment world slot',()=>{
  for(let i=0;i<10;i++){
    const selected=garmentRackX(i,10,i);assert.equal(selected,garmentRackX(i,10));
    assert.equal(rackCameraX(selected,0,true),selected);assert.equal(rackCameraX(selected,1,true),selected);
    assert.ok(rackCameraX(selected,0,false)===0);assert.equal(rackCameraX(selected,1,false),selected);
  }
});
test('desktop focus still pans to the actual moving hanger, including edge slots',()=>{
  for(const x of[-3.285,-.73,.91,3.285])for(const focus of[0,.2,.5,1]){
    assert.ok(Math.abs(rackCameraX(x,focus,false)-x*focus)<1e-12);
    assert.equal(rackCameraX(x,focus,true),x);
  }
});

test('changing the centred selection does not wake an unrelated resting cloth',()=>{
  const data=JSON.parse(readFileSync(new URL('../public/models/short-sleeve-simulation.json',import.meta.url))),cloth=new SurfaceCloth(data);
  const pose=chosen=>({x:garmentRackX(0,10,chosen),y:1.56,z:0,yaw:-1.43});
  cloth.step(1/60,pose(6));assert.ok(cloth.asleep);const version=cloth.version,before=cloth.position.slice();
  cloth.step(1/60,pose(7));assert.ok(cloth.asleep);assert.equal(cloth.version,version);assert.deepEqual(cloth.position,before);
});
