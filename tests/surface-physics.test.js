import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SurfaceCloth} from '../src/surface-physics.js';
import {HangingMotion} from '../src/physics.js';
import {catalog} from '../src/catalog.js';
const data=Object.fromEntries([['shortSleeve','short-sleeve'],['longSleeve','hanging-long-sleeve']].map(([key,file])=>[key,JSON.parse(readFileSync(new URL('../public/models/'+file+'-simulation.json',import.meta.url)))]));
function run(item,preciseContacts=true){
 const s=new SurfaceCloth(data[item.type],item.motion),motion=new HangingMotion(0,-1.43,item.type==='longSleeve',item.motion),dt=1/60;
 s.preciseContacts=preciseContacts;
 const trace=[];let pin=0,peak=0,lastMeanSpeed=0,maxTurn=0;
 for(let frame=0;frame<600;frame++){
  const forward=frame>=30&&frame<120,flip=frame>=120&&frame<210;
  motion.step(forward?.65:0,forward?.12:0,flip?Math.PI:forward?0:-1.43,dt,false,frame>=30&&frame<210?1.94:1.56);
  maxTurn=Math.max(maxTurn,Math.abs(motion.yaw.velocity));
  s.step(dt,{x:motion.x.value,y:motion.y.value,z:motion.z.value,yaw:motion.yaw.value,roll:motion.roll.value,pitch:motion.pitch.value});
  let displacement=0,speed=0;
  for(let i=0;i<s.count;i++){
   const j=i*3,d=Math.hypot(s.offsets[j],s.offsets[j+1],s.offsets[j+2]);assert.ok(Number.isFinite(d),item.id);if(!s.inverseMass[i])pin=Math.max(pin,d);if(s.rest[j+1]<-.6)displacement+=Math.abs(s.offsets[j+2]);peak=Math.max(peak,d);speed+=Math.hypot(s.velocity[j],s.velocity[j+1],s.velocity[j+2]);
  }
  if(frame%6===0&&frame>=30&&frame<300)trace.push(displacement/s.count);
  if(frame>570)lastMeanSpeed=Math.max(lastMeanSpeed,speed/s.count);
 }
 return{pin,peak,lastMeanSpeed,trace,maxTurn,asleep:s.asleep};
}
test('prepared surfaces contain no unused particles and preserve a balanced hanging rest',()=>{
 for(const [type,d]of Object.entries(data)){
  const referenced=new Set(d.triangles);assert.equal(referenced.size,d.positions.length/3,type);
  const s=new SurfaceCloth(d);for(let i=0;i<120;i++)s.step(1/60,{yaw:-1.43});assert.ok(s.asleep,type);assert.ok(s.offsets.every(v=>Math.abs(v)<1e-6),type);
 }
});
test('every garment keeps shoulders pinned and stays bounded during interrupted gestures',()=>{
 for(const item of catalog){const r=run(item);assert.ok(r.pin<1e-6,item.id);assert.ok(r.peak>.025&&r.peak<.9,`${item.id} peak ${r.peak}`);assert.ok(r.maxTurn<=2.4,item.id);assert.ok(r.lastMeanSpeed<.018,`${item.id} late speed ${r.lastMeanSpeed}`);}
});
test('identical gestures produce measurably different light and heavy shirt responses',()=>{
 const a=run(catalog[0]),b=run(catalog[1]);const mean=a.trace.reduce((sum,v,i)=>sum+Math.abs(v-b.trace[i]),0)/a.trace.length;
 assert.ok(mean>.001,`mean trajectory difference ${mean}`);
 assert.ok(Math.abs(a.peak-b.peak)>.02,`material peaks must differ instead of saturating one shared cap: ${a.peak}, ${b.peak}`);
});
test('reduced motion clears cloth momentum and the deformed state',()=>{
 const s=new SurfaceCloth(data.shortSleeve);s.step(1/60,{yaw:0});s.step(1/60,{yaw:1});s.step(1/60,{yaw:2},true);assert.ok(s.offsets.every(v=>v===0));assert.ok(s.velocity.every(v=>v===0));
});

test('background cloth remains pinned and settles with surface seams and local separation',()=>{for(const item of[catalog[0],catalog[5]]){const r=run(item,false);assert.ok(r.pin<1e-6,item.id);assert.ok(r.peak<.9,item.id);assert.ok(r.lastMeanSpeed<.018,item.id);}});

test('surface directions follow every physics step and reset with reduced motion',()=>{
 const s=new SurfaceCloth(data.shortSleeve,catalog[0].motion);s.step(1/60,{yaw:0});
 for(let f=0;f<45;f++)s.step(1/60,{yaw:f/45*.8});
 const expected=new Float32Array(s.normal.length),p=s.local;
 for(let i=0;i<s.triangles.length;i+=3){const ids=[s.triangles[i]*3,s.triangles[i+1]*3,s.triangles[i+2]*3],a=ids[0],b=ids[1],c=ids[2],u=[p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2]],v=[p[c]-p[a],p[c+1]-p[a+1],p[c+2]-p[a+2]],n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];for(const j of ids)for(let k=0;k<3;k++)expected[j+k]+=n[k];}
 let changed=0;for(let i=0;i<expected.length;i+=3){const len=Math.hypot(...expected.subarray(i,i+3))||1;for(let k=0;k<3;k++){assert.ok(Math.abs(s.normal[i+k]-expected[i+k]/len)<1e-6);changed=Math.max(changed,Math.abs(s.normal[i+k]-s.restNormal[i+k]));}}
 assert.ok(changed>.01,'the motion must actually bend the surface');
 s.step(1/60,{yaw:1},true);assert.deepEqual(s.normal,s.restNormal);
});

test('aerodynamic response is independent of rendering direction-refresh cadence',()=>{
 function trajectory(cadence){const item=catalog[0],s=new SurfaceCloth(data.shortSleeve,item.motion),m=new HangingMotion(0,-1.43,false,item.motion),trace=[];
  for(let f=0;f<120;f++){m.step(.25,.1,f<60?0:Math.PI,1/60,false,1.94);s.step(1/60,{x:m.x.value,y:m.y.value,z:m.z.value,yaw:m.yaw.value,roll:m.roll.value,pitch:m.pitch.value});if(f%cadence===0)s.computeNormals();trace.push(new Float32Array(s.offsets));}return trace;}
 assert.deepEqual(trajectory(1),trajectory(4));
});
