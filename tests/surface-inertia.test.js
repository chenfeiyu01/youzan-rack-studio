import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{SurfaceCloth}from'../src/surface-physics.js';import{HangingMotion}from'../src/physics.js';
const data=JSON.parse(readFileSync(new URL('../public/models/hanging-long-sleeve-simulation.json',import.meta.url)));
test('smaller complete gesture steps exactly match manual interpolated physical steps',()=>{
 const a=new SurfaceCloth(data),b=new SurfaceCloth(data),from={x:0,y:1.65,z:0,yaw:-1.43,roll:0,pitch:0,scale:1},to={...from,roll:.01,pitch:.005};a.step(1/60,from);b.step(1/60,from);
 a.advance(1/60,to,false,2);b.step(1/120,{...from,roll:.005,pitch:.0025});b.step(1/120,to);
 for(const field of['position','previous','velocity','target','local','offsets','normal'])assert.deepEqual(a[field],b[field],field);
});

test('with shape damping isolated, turning the hanger retains angular inertia and free cloth motion',()=>{
 // Isolate world angular inertia from the separately tested shape dissipation.
 const cloth=new SurfaceCloth(data,{shapeDamping:0}),motion=new HangingMotion(0,-1.43,true);cloth.step(1/60,{x:0,y:1.65,z:0,yaw:-1.43});let maxLag=0,freeMotion=0,arrived=false;
 for(let frame=0;frame<240;frame++){
  const before=cloth.position.slice();motion.step(0,0,-.03,1/60,false,1.65);cloth.step(1/60,{x:0,y:1.65,z:0,yaw:motion.yaw.value});
  if(Math.abs(motion.yaw.value+.03)<.035)arrived=true;
  for(let i=0;i<cloth.count;i++)if(cloth.rest[i*3+1]<-.5){const j=i*3;maxLag=Math.max(maxLag,Math.hypot(cloth.position[j]-cloth.target[j],cloth.position[j+1]-cloth.target[j+1],cloth.position[j+2]-cloth.target[j+2]));if(arrived)freeMotion=Math.max(freeMotion,Math.hypot(cloth.position[j]-before[j],cloth.position[j+1]-before[j+1],cloth.position[j+2]-before[j+2]));}
 }
 assert.ok(arrived);assert.ok(maxLag>.1,'the hem must lag instead of being rotated with the hanger');assert.ok(freeMotion>.005,'the cloth must continue moving after the hanger arrives');
});

test('rail layout translation does not rotate cloth or cancel any particle momentum',()=>{
 const cloth=new SurfaceCloth(data);cloth.step(1/60,{x:0,y:1.65,z:0,yaw:-1.43});for(let i=0;i<cloth.velocity.length;i++)cloth.velocity[i]=Math.sin(i)*.2;
 const old=cloth.position.slice(),velocities=cloth.velocity.slice();cloth.shiftLayout(.8);
 assert.deepEqual(cloth.velocity,velocities);
 for(let i=0;i<old.length;i++)assert.ok(Math.abs(cloth.position[i]-old[i]-(i%3===0?.8:0))<1e-12);
});

test('fast hover keeps the displayed hem flexible and sums to real cloth time throughout the gesture',async t=>{
 const {createSurfaceRig}=await import('../src/surface-rig.js');
 const {catalog}=await import('../src/catalog.js');
 const {modelConfig}=await import('../src/model-config.js');
 const {RackHoverMotion}=await import('../src/rack-hover-motion.js');
 for(const index of[0,4,5]){
  const item=catalog[index],source=JSON.parse(readFileSync(new URL('../public'+modelConfig[item.type].simulation,import.meta.url))),rig=createSurfaceRig(source,item.motion,'natural-hover-'+index),s=rig.solver,m=new HangingMotion(0,-1.43,item.type==='longSleeve',item.motion);m.y.snap(1.65);const hover=new RackHoverMotion();
  rig.update(1/60,{x:0,y:1.65,z:0,yaw:-1.43},false);let simulated=0,arrived=-1,displayLag=0,freeChange=0,previous=new Float32Array(rig.texture.image.data);
  const step=s.step.bind(s);s.step=(dt,...args)=>{simulated+=dt;return step(dt,...args);};
  try{for(let frame=0;frame<120;frame++){
   const plan=hover.plan(0,[m],1/60);m.step(plan.positions[0],0,plan.yaws[0],1/60,false,1.65,true,plan.drive);rig.update(1/60,{x:0,y:1.65,z:0,yaw:m.yaw.value},false,true);rig.sync();
   assert.ok(Math.abs(simulated-(frame+1)/60)<1e-10,'substeps cannot accelerate cloth time');
   if(arrived<0&&Math.abs(m.yaw.value+.03)<.035)arrived=frame;
   for(let node=0;node<s.count;node++)if(s.rest[node*3+1]<-.5){
    const j=node*4,p=rig.texture.image.data;
    if(arrived>=0&&frame<arrived+30){displayLag=Math.max(displayLag,Math.hypot(p[j],p[j+1],p[j+2]));if(frame>arrived+6)freeChange=Math.max(freeChange,Math.hypot(p[j]-previous[j],p[j+1]-previous[j+1],p[j+2]-previous[j+2]));}
   }
   previous.set(rig.texture.image.data);
  }
  t.diagnostic(JSON.stringify({index,arrivalMs:(arrived+1)*1000/60,displayLag,freeChange}));assert.ok(arrived>=0&&arrived<42,'the carrier must arrive promptly');assert.ok(displayLag>.06,'rendered cloth must lag, not follow as a board');assert.ok(freeChange>.001,'rendered hem must keep moving after the carrier arrives');
  }finally{rig.dispose();}
 }
});
