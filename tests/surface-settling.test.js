import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import{SurfaceCloth}from'../src/surface-physics.js';
import{HangingMotion}from'../src/physics.js';
import{catalog}from'../src/catalog.js';

test('a soft sleeve loses contact chatter even when automatic sleep is disabled',()=>{
  const data=JSON.parse(readFileSync(new URL('../public/models/hanging-long-sleeve-simulation.json',import.meta.url))),item=catalog[5],awake=new SurfaceCloth(data,item.motion),automatic=new SurfaceCloth(data,item.motion),motion=new HangingMotion(0,0,true,item.motion);
  // Aerodynamic time scales with areal mass. Observe the same 10-15 seconds
  // of relaxation as the unit-density fixture, using the slowest panel density.
  const density=Math.max(...awake.arealMass),start=300+Math.ceil(600*density),end=300+Math.ceil(900*density);
  const previous=new Float64Array(awake.position.length),blockEnergy=new Float64Array(3);let squaredMotion=0,maxSpeed=0,peak=0,firstSleep=null,lastPose;
  for(let frame=0;frame<end;frame++){
    const rapid=frame<300,stage=Math.floor(frame/12)%6;
    motion.step(rapid?[0,0,.66,-.66,0,0][stage]:0,rapid&&stage===4?0:.35,rapid?[0,Math.PI,0,Math.PI,-1.43,0][stage]:0,1/60,false,rapid&&stage===4?1.56:1.94);
    lastPose={x:motion.x.value,y:motion.y.value,z:motion.z.value,yaw:motion.yaw.value,roll:motion.roll.value,pitch:motion.pitch.value};
    previous.set(awake.position);awake.asleep=false;awake.stillFrames=0;
    awake.step(1/60,lastPose);automatic.step(1/60,lastPose);
    if(frame>300&&automatic.asleep&&firstSleep===null)firstSleep=frame;
    for(let node=0;node<awake.count;node++){
      const i=node*3;if(frame<300)peak=Math.max(peak,Math.hypot(awake.offsets[i],awake.offsets[i+1],awake.offsets[i+2]));
      if(frame>=start){let speed2=0;for(let k=0;k<3;k++){const speed=(awake.position[i+k]-previous[i+k])*60;speed2+=speed*speed;}squaredMotion+=speed2;blockEnergy[Math.min(2,Math.floor((frame-start)*3/(end-start)))]+=speed2;maxSpeed=Math.max(maxSpeed,Math.sqrt(speed2));}
    }
  }
  const rms=Math.sqrt(squaredMotion/((end-start)*awake.count));
  assert.ok(peak>.03,'the initial gestures must really bend the garment');
  assert.ok(blockEnergy[2]<blockEnergy[0]*.1,'residual motion must keep decaying, rather than persist as contact chatter');
  assert.ok(rms<1e-5,`residual position motion ${rms}`);
  assert.ok(maxSpeed<.001,`a small cuff region must not keep vibrating ${maxSpeed}`);
  assert.ok(firstSleep!==null&&automatic.asleep,'natural convergence must allow ordinary sleep');
  assert.ok(automatic.velocity.every(v=>v===0));
  const version=automatic.version;automatic.step(1/60,{...lastPose,yaw:lastPose.yaw+.02});
  assert.ok(automatic.version>version&&!automatic.asleep,'a new hanger movement must wake the cloth');
});
