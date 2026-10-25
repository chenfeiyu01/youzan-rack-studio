import test from 'node:test';
import assert from 'node:assert/strict';
import {SurfaceCloth} from '../src/surface-physics.js';
// A uniformly translating, unsupported triangle has no stretch or bending
// force. Negligible rest-shape stiffness isolates the actual solver's air step.
const patch={positions:[-.1,-.5,-.1,.1,-.5,-.1,0,-.5,.1],triangles:[0,1,2]};
function moving(mass,velocity){const cloth=new SurfaceCloth(patch,{mass,drag:2.5,softness:1e12,shapeDamping:0});cloth.step(1/60,{y:1.58});for(let i=0;i<3;i++)cloth.velocity.set(velocity,i*3);cloth.asleep=false;return cloth;}
const speed=s=>Math.hypot(...s.velocity.subarray(0,3));
test('the same air load slows a lighter fabric more, with stronger resistance broadside than along the surface',()=>{
 const light=moving(.7,[0,1.2,0]),heavy=moving(1.4,[0,1.2,0]),tangent=moving(.7,[1.2,0,0]);for(const s of[light,heavy,tangent])s.step(.025,{y:1.58});
 assert.ok(speed(light)<speed(heavy)-.03,`normal speeds ${speed(light)}, ${speed(heavy)}`);
 assert.ok(speed(tangent)>speed(light)+.03,'edgewise motion must catch less air');
 const halfTime=moving(.7,[0,1.2,0]);halfTime.step(.0125,{y:1.58});assert.ok(Math.abs(speed(halfTime)-speed(heavy))<1e-10,'doubling areal mass halves aerodynamic time');
});
test('nonlinear air drag dissipates energy without reversing motion and is consistent when the time step is split',()=>{
 for(const initial of[[0,4,0],[0,-4,0],[1.5,2,-.7]]){
  const full=moving(.82,initial),split=moving(.82,initial);full.step(.04,{y:1.58});split.step(.02,{y:1.58});split.asleep=false;split.step(.02,{y:1.58});
  for(let k=0;k<3;k++){assert.ok(Math.abs(full.velocity[k]-split.velocity[k])<2e-9,`split-step component ${k}`);assert.ok(initial[k]*full.velocity[k]>=0,'air cannot reverse a component');}
  assert.ok(speed(full)<Math.hypot(...initial),'air cannot add kinetic energy');
 }
});
