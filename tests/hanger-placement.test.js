import test from'node:test';import assert from'node:assert/strict';import*as T from'three';
import{HangerPlacement,seatGeometry,rigidHangerData,forbiddenIntervals,RAIL}from'../src/hanger-placement.js';import{HangingMotion}from'../src/physics.js';import{catalog}from'../src/catalog.js';import{garmentFocusPose}from'../src/rack-layout.js';import{makeRail}from'../src/scene.js';import{hangerFixtures,RailAudit}from'./helpers/hanger-fixtures.js';

test('actual short and long hangers reproduce the old penetration and sit in contact above the unchanged rail',async()=>{
 const fixtures=await hangerFixtures();for(const[type,{data}]of Object.entries(fixtures)){
  const audit=new RailAudit(data),fit=seatGeometry(data),old=audit.inspect({y:1.56}),now=audit.inspect({y:fit.restY});assert.ok(old.count>0,type+' must reproduce the original rail penetration');assert.equal(now.count,0,type+' at rest');assert.ok(now.minGap>0&&now.minGap<.0001,type+' must touch the rail rather than float above it');assert.ok(audit.inspect({y:fit.restY-.0001}).count>0,type+' lowering below support must hit the rail');assert.ok(fit.restY>1.60&&fit.restY<1.70);
 }
 const rail=makeRail(new T.Scene()),rod=rail.children[0];assert.deepEqual([rod.geometry.parameters.radiusTop,rod.geometry.parameters.radiusBottom,rod.geometry.parameters.height,rod.geometry.parameters.radialSegments],[.035,.035,9.12,28]);assert.equal(rod.position.y,1.57);assert.equal(RAIL.height,1.57);assert.equal(rail.children.length,9);
});

test('geometry-fitted lift and withdrawal corridors remain clear along both entire legs',async()=>{
 for(const[type,{data}]of Object.entries(await hangerFixtures())){
  const fit=seatGeometry(data),audit=new RailAudit(data);assert.ok(fit.corridor[1]-fit.corridor[0]>.01);assert.ok(fit.rotationZ<fit.clearanceZ);
  for(let i=0;i<=600;i++){
   const t=i/600;assert.equal(audit.inspect({y:fit.restY+t*(fit.transitY-fit.restY)}).count,0,type+' vertical '+i);
   assert.equal(audit.inspect({y:fit.transitY,z:t*fit.clearanceZ}).count,0,type+' horizontal '+i);
  }
 }
});

test('rigid extraction ignores cloth and is independent of the current world transform',async()=>{
 const{root,data}=(await hangerFixtures()).short,mesh=new T.Mesh(new T.BoxGeometry(4,4,4),new T.MeshStandardMaterial());mesh.userData.cloth=true;root.add(mesh);root.position.set(3.285,1.94,.35);root.rotation.set(.008,2.3,.012,'ZYX');root.scale.setScalar(1.28);
 try{const extracted=rigidHangerData(root);assert.deepEqual(extracted.triangles,data.triangles);let error=0;for(let i=0;i<data.positions.length;i++)error=Math.max(error,Math.abs(data.positions[i]-extracted.positions[i]));assert.ok(error<1e-12);const fit=HangerPlacement.fromObject(root);assert.ok(Math.abs(fit.restY-seatGeometry(data).restY)<1e-12);}finally{root.remove(mesh);root.position.set(0,0,0);root.rotation.set(0,0,0);root.scale.setScalar(1);mesh.geometry.dispose();mesh.material.dispose();}
});

test('circle-swept intervals cover independent point and degenerate triangle contact',()=>{
 for(const depth of[0,.1,.35])for(const z of[-.37,-.1,0,.02,.07]){
  const y=-.12,data={positions:[0,y,z,0,y,z,0,y,z],triangles:[0,1,2]},intervals=forbiddenIntervals(data,depth,{yaw:0,radius:.035});const dz=z>0?z:z< -depth?z+depth:0;
  if(Math.abs(dz)>.035)assert.equal(intervals.length,0);else{assert.equal(intervals.length,1);const h=Math.sqrt(.035**2-dz**2);assert.ok(Math.abs(intervals[0][0]-(1.57-y-h))<1e-12);assert.ok(Math.abs(intervals[0][1]-(1.57-y+h))<1e-12);}
 }
});

test('all styles handle repeated interrupted pickup, turns, scaling and return without hitting the rail',async t=>{
 const fixtures=await hangerFixtures();let seed=4381;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};let inspected=0,minGap=Infinity;const traces=[];
 for(let index=0;index<catalog.length;index++){
  seed=4381;const item=catalog[index],type=item.type==='longSleeve'?'long':'short',data=fixtures[type].data,fit=seatGeometry(data),guide=new HangerPlacement(fit),audit=new RailAudit(data),m=new HangingMotion(0,-1.43,type==='long',item.motion);m.y.snap(fit.restY);let scale=1,focus=0,mode=0,next=0,x=0;const trace=[];
  for(let frame=0;frame<3000;frame++){
   if(frame>=2400)mode=0;else if(frame>=next){mode=Math.floor(random()*4);next=frame+1+Math.floor(random()*90);x=(random()-.5)*1.32;}
   focus+=((mode>=2?1:0)-focus)*(1-Math.exp(-9/60));const request={wanted:mode>0,y:(1-focus)*fit.restY+focus*1.94,z:focus*.35+(mode===1?(1-focus)*.15:0),yaw:mode===3?Math.PI:mode>0?-.03:-1.43};
   scale+=(guide.scaleTarget(1+.28*focus,m)-scale)*(1-Math.exp(-9/60));const c=guide.plan(m,request,scale);if(c.pin)scale=1;m.step(x,c.z,c.yaw,1/60,false,c.y);guide.finish(m,c);
   const hit=audit.inspect({y:m.y.value,z:m.z.value,yaw:m.yaw.value,roll:m.roll.value,pitch:m.pitch.value,scale});assert.equal(hit.count,0,'item '+index+' frame '+frame+' phase '+guide.phase);minGap=Math.min(minGap,hit.minGap);inspected++;
   for(const key of['x','y','z','yaw','roll','pitch'])assert.ok(Number.isFinite(m[key].value)&&Number.isFinite(m[key].velocity));if(c.pin){assert.equal(m.roll.value,0);assert.equal(m.pitch.value,0);assert.equal(scale,1);}trace.push(m.y.value,m.z.value);
  }
  assert.equal(guide.phase,'seated');assert.equal(guide.moving,false);assert.ok(Math.abs(m.y.value-fit.restY)<1e-10);assert.ok(Math.abs(m.z.value)<1e-10);traces.push(trace);
 }
 const rms=Math.sqrt(traces[4].reduce((sum,v,i)=>sum+(v-traces[5][i])**2,0)/traces[4].length);assert.ok(rms>.001,'same inputs must retain different long-sleeve timing');assert.equal(inspected,30000);t.diagnostic(JSON.stringify({inspected,minGap}));
});

test('reduced motion uses clear final poses and keeps the legacy layout contract when no seat is supplied',async()=>{
 const fixtures=await hangerFixtures();for(const[type,{data}]of Object.entries(fixtures)){const fit=seatGeometry(data),guide=new HangerPlacement(fit),m=new HangingMotion(0),audit=new RailAudit(data);
  for(const wanted of[false,true,false,true,false]){const pose=garmentFocusPose(wanted,wanted,wanted?1:0,1.28,fit.restY),c=guide.plan(m,{wanted,y:pose.y,z:pose.z,yaw:wanted?Math.PI:-1.43},wanted?1.28:1,true);m.step(0,c.z,c.yaw,1/60,true,c.y);guide.finish(m,c);assert.equal(audit.inspect({y:m.y.value,z:m.z.value,yaw:m.yaw.value,scale:wanted?1.28:1}).count,0,type);}
 }
 assert.equal(garmentFocusPose(false,false,0,1.28).y,1.56);
});

test('placement stays clear when several fixed steps share one rendered scale and target',async t=>{
 const fixtures=await hangerFixtures();let inspected=0;
 for(const index of[0,4,5,9]){
  const item=catalog[index],long=item.type==='longSleeve',data=fixtures[long?'long':'short'].data,fit=seatGeometry(data),guide=new HangerPlacement(fit),audit=new RailAudit(data),m=new HangingMotion(0,-1.43,long,item.motion);m.y.snap(fit.restY);let scale=1,focus=0;
  for(let frame=0;frame<1000;frame++){
   const steps=1+frame%3,dt=steps/60,mode=frame<800?Math.floor(frame/37)%4:0,wanted=mode>0;
   focus+=((mode>1?1:0)-focus)*(1-Math.exp(-9*dt));
   const pose=garmentFocusPose(mode>1,wanted,focus,1.28,fit.restY),request={wanted,y:pose.y,z:pose.z,yaw:mode===3?Math.PI:wanted?-.03:-1.43};
   scale+=(guide.scaleTarget(wanted?pose.scale:1,m)-scale)*(1-Math.exp(-9*dt));
   for(let step=0;step<steps;step++){
    const control=guide.plan(m,request,scale);if(control.pin)scale=1;
    m.step(Math.sin(frame/33)*.6,control.z,control.yaw,1/60,false,control.y);guide.finish(m,control);
    assert.equal(audit.inspect({y:m.y.value,z:m.z.value,yaw:m.yaw.value,roll:m.roll.value,pitch:m.pitch.value,scale}).count,0,'style '+index+' render '+frame+' substep '+step+' phase '+guide.phase);inspected++;
   }
  }
  assert.equal(guide.phase,'seated');assert.equal(m.z.value,0);assert.equal(m.y.value,fit.restY);
 }
 t.diagnostic(JSON.stringify({batchedFixedSteps:inspected}));
});
