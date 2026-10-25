import test from'node:test';import assert from'node:assert/strict';import{replayHangerScene}from'./helpers/hanger-handoff.js';import{rackOpenFraction}from'../src/rack-presentation.js';import{hoverRackX}from'../src/rack-hover-motion.js';
test('hover has real angular inertia, immediate retargeting and a quick coupled handoff',async t=>{
 let checked=false,overlap=false,sharedTurn=false,maxOpen=0,completionSteps=0,hemLag=0;
 const metrics=await replayHangerScene({frames:900,measureFrom:0,stateAtFrame:frame=>{
  const active=frame<120?6:frame<240?7:frame<360?4:frame<400?5:frame<402?9:frame<404?0:6;
  return{active,hovered:active,mode:'rack',turned:false};
 },onFrame:({frame,plans,view})=>{
  const active=frame<120?6:frame<240?7:frame<360?4:frame<400?5:frame<402?9:frame<404?0:6;
  assert.equal(view.opening,active,'no queued hover requests at frame '+frame);
  assert.ok(view.space.reduce((sum,width)=>sum+width,0)<=1+1e-12,'at most one shared open slot');
  maxOpen=Math.max(maxOpen,plans.reduce((sum,p)=>sum+rackOpenFraction(p.motion.yaw.value),0));
  if(frame>=120&&frame<240){
   const cloth=plans[7].solver;for(let i=0;i<cloth.count;i++)if(cloth.rest[i*3+1]<-.5){const j=i*3;hemLag=Math.max(hemLag,Math.hypot(cloth.position[j]-cloth.target[j],cloth.position[j+1]-cloth.target[j+1],cloth.position[j+2]-cloth.target[j+2]));}
   if(view.progress===1&&!completionSteps){completionSteps=frame-120+1;overlap=true;}
   for(let i=0;i<10;i++)if(i!==6&&i!==7){
    assert.ok(Math.abs(view.positions[i]-hoverRackX(i,10,6))<1e-12,'unrelated target stays fixed');
    assert.ok(Math.abs(plans[i].motion.x.value-hoverRackX(i,10,6))<.001,'unrelated hanger stays fixed');
   }
   const closing=rackOpenFraction(plans[6].motion.yaw.value),opening=rackOpenFraction(plans[7].motion.yaw.value);
   if(closing>.1&&closing<.9&&opening>.1)sharedTurn=true;
  }
  if(frame===123)assert.ok(plans[7].motion.yaw.value>-1.43,'the coupled turn starts without a pickup queue');
  if(frame===120){
   assert.equal(view.chosen,7);assert.equal(plans[7].wanted,true);assert.equal(plans[6].wanted,false);
   assert.ok(Math.abs(plans[6].motion.yaw.value+1.43)>.06,'old garment is still facing forward');
   assert.equal(view.opening,7,'new hover target is accepted immediately');assert.equal(plans[7].motion.y.value,plans[7].placement.restY,'no pickup delay');checked=true;
  }
 }});
 t.diagnostic(JSON.stringify({...metrics,maxOpen,completionSteps,hemLag}));assert.ok(checked&&overlap&&sharedTurn,'pickup and opposite turns overlap');assert.ok(completionSteps<=45,'handoff must finish within .75 real seconds');assert.ok(hemLag>.04,'cloth must visibly lag instead of rotating rigidly');assert.ok(maxOpen<1.05,'combined visible opening '+maxOpen);assert.equal(metrics.hangerPenetrations,0);
 // The shared gap avoids broad rack motion while retaining full cloth and rail checks.
 // Real-time angular inertia may use the existing full cloth swing envelope;
 // verify stretch and settled shape separately rather than force particle follow.
 assert.ok(metrics.maxOffset<1.1,'bounded concurrent cloth displacement '+metrics.maxOffset);assert.ok(metrics.maxStrain<1.25,'structural stretch '+metrics.maxStrain);
 assert.ok(metrics.finalOffset<.06);assert.ok(metrics.finalStrain<1.08);assert.equal(metrics.choice,6);
});
test('the actual guided pickup and return keep cloth bounded through rapid cross-rack selection and settle',async t=>{
 let maxZoom=1;const metrics=await replayHangerScene({onFrame:({poses,inspectionZoom})=>{for(const pose of poses)assert.equal(pose.scale,1);maxZoom=Math.max(maxZoom,...inspectionZoom);}});t.diagnostic(JSON.stringify(metrics));assert.ok(maxZoom>1.27);assert.equal(metrics.hangerChecks,9000);assert.equal(metrics.hangerPenetrations,0);assert.ok(metrics.minGap>=-1e-8);assert.ok(metrics.maxOffset<.5,'visible cloth displacement '+metrics.maxOffset);assert.ok(metrics.maxStrain<1.18,'conditioned proxy structural stretch '+metrics.maxStrain);assert.ok(metrics.finalOffset<.06);assert.ok(metrics.finalStrain<1.08);assert.equal(metrics.owner,9);assert.equal(metrics.choice,6);assert.equal(metrics.returning,false);assert.equal(metrics.finalPhases[9],'seated');assert.equal(metrics.finalPhases[6],'seated');for(const phase of['lift','withdraw','free','align','approach','seat','seated'])assert.ok(metrics.phases[phase]>0,phase);
});
