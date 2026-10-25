import test from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{garmentFocusPose}from'../src/rack-layout.js';
import{createSurfaceRig}from'../src/surface-rig.js';
import{catalog}from'../src/catalog.js';

test('inspecting another piece keeps background hangers at their rack height, depth and size',()=>{
  for(const focus of[0,.2,.5,1,.5,.2,0])for(const front of[false,true]){
    assert.deepEqual(garmentFocusPose(false,front,focus,1.28),{y:1.56,z:front?.15:0,scale:1});
  }
});

test('the inspected piece retains its lift, depth and desktop/mobile enlargement',()=>{
  for(const scale of[1.23,1.28]){
    assert.deepEqual(garmentFocusPose(true,true,0,scale),{y:1.56,z:.15,scale:1});
    assert.deepEqual(garmentFocusPose(true,true,1,scale),{y:1.94,z:.35,scale});
    const halfway=garmentFocusPose(true,true,.5,scale);
    assert.equal(halfway.y,1.75);assert.equal(halfway.z,.25);assert.equal(halfway.scale,(1+scale)/2);
  }
});

test('a stationary long sleeve re-enters contact participation after hidden suspension without an artificial impulse',()=>{
  const data=JSON.parse(readFileSync(new URL('../public/models/hanging-long-sleeve-simulation.json',import.meta.url)));
  const rig=createSurfaceRig(data,catalog[5].motion,'longSleeve'),solver=rig.solver;
  try{
    const pose=focus=>{const p=garmentFocusPose(false,false,focus,1.23);return{x:2.85,y:p.y,z:p.z,yaw:-1.43,scale:1};};
    rig.update(1/60,pose(0),false,false);
    const before=solver.position.slice();
    for(const focus of[.2,.5,1])rig.update(1/60,pose(focus),false,false);
    rig.suspend();assert.equal(solver.initialized,false);
    for(const focus of[.5,.2,0]){
      rig.update(1/60,pose(focus),false,false);
      assert.equal(solver.initialized,true,'visible cloth must be available to GarmentContacts');
      assert.equal(solver.asleep,true);assert.deepEqual(solver.position,before);
    }
  }finally{rig.dispose();}
});
