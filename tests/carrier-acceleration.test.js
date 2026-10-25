import test from 'node:test';
import assert from 'node:assert/strict';
import {HangingMotion}from'../src/physics.js';
import {catalog}from'../src/catalog.js';

test('reported carrier acceleration is the derivative of the actual limited motion on every axis',()=>{
 for(const dt of[1/30,1/60,1/120])for(const item of catalog){
  const motion=new HangingMotion(0,0,item.type==='longSleeve',item.motion),axes=['x','y','z','yaw'];
  for(let frame=0;frame<240;frame++){
   const before=axes.map(k=>[motion[k].value,motion[k].velocity]),sign=frame<120?1:-1;
   motion.step(sign*3,sign*.8,sign*Math.PI,dt,false,1.56+sign*.7);
   for(let i=0;i<axes.length;i++){
    const s=motion[axes[i]],expected=(s.velocity-before[i][1])/dt;
    assert.ok(Math.abs(s.acceleration-expected)<1e-10,item.id+' '+axes[i]);
    assert.ok(Math.abs((s.value-before[i][0])/dt-s.velocity)<1e-10,'position and reported velocity must describe the same motion');
   }
  }
 }
});

test('constant limited travel has no sustained inertial tilt demand and the initial response decays',()=>{
 const motion=new HangingMotion(0,0,false,catalog[0].motion),dt=1/60;let peak=0;
 for(let frame=0;frame<300;frame++){
  const before=motion.x.velocity;motion.step(20,0,0,dt);peak=Math.max(peak,Math.abs(motion.roll.value));
  if(frame>5&&Math.abs(motion.x.velocity-before)<1e-12)assert.equal(motion.x.acceleration,0);
 }
 assert.ok(peak>.0001,'retain a physical response to starting acceleration');
 assert.ok(Math.abs(motion.roll.value)<1e-6,'the hanger must return upright while travelling at constant speed');
});

test('angular stops absorb outward velocity but retain an inward release',()=>{
 for(const key of['roll','pitch'])for(const sign of[-1,1]){
  const motion=new HangingMotion(0,0),spring=motion[key],limit=key==='roll'?.012:.008;
  spring.value=sign*limit;spring.velocity=sign*.1;motion.step(0,0,0,1/60);
  assert.equal(spring.value,sign*limit);assert.equal(spring.velocity,0);
  spring.velocity=-sign*.01;motion.step(0,0,0,1/60);
  assert.ok(Math.abs(spring.value)<limit,'inward motion must release from the stop');
  assert.ok(spring.velocity*sign<0);
 }
});

test('the same gesture retains different hanger recovery for light, heavy and long garments',()=>{
 const samples=[];
 for(const index of[0,1,5]){
  const item=catalog[index],motion=new HangingMotion(0,0,item.type==='longSleeve',item.motion),trace=[];
  for(let frame=0;frame<240;frame++){
   const moving=frame>=15&&frame<120;motion.step(moving?.66:0,moving?.35:0,moving?Math.PI:0,1/60);
   trace.push(motion.roll.value,motion.pitch.value);
   assert.ok(Math.abs(motion.roll.value)<=.012&&Math.abs(motion.pitch.value)<=.008);
  }
  samples.push(trace);
 }
 for(let i=0;i<samples.length;i++)for(let j=0;j<i;j++)assert.ok(Math.max(...samples[i].map((v,k)=>Math.abs(v-samples[j][k])))>1e-4,'different mass and length presets must not share an identical recovery curve');
});

test('paused time does not create acceleration and reduced motion still snaps to its requested pose',()=>{
 const motion=new HangingMotion(0,0);motion.step(1,.35,1,1/60);const before=['x','y','z','yaw','roll','pitch'].map(k=>({...motion[k]}));
 for(const dt of[0,-1,NaN,Infinity]){motion.step(5,4,3,dt);assert.deepEqual(['x','y','z','yaw','roll','pitch'].map(k=>({...motion[k]})),before);}
 motion.step(2,.7,Math.PI,0,true,1.94);assert.equal(motion.x.value,2);assert.equal(motion.y.value,1.94);assert.equal(motion.z.value,.7);assert.equal(motion.yaw.value,Math.PI);assert.equal(motion.roll.value,0);assert.equal(motion.pitch.value,0);
 for(const k of['x','y','z','yaw','roll','pitch'])assert.equal(motion[k].velocity,0);
});
