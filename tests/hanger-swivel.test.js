import test from'node:test';import assert from'node:assert/strict';import{Matrix4,Quaternion,Vector3}from'three';
import{createHangerSwivel}from'../src/hanger-swivel.js';import{HangingMotion}from'../src/physics.js';import{seatGeometry,rigidHangerData}from'../src/hanger-placement.js';import{hangerFixtures,RailAudit}from'./helpers/hanger-fixtures.js';

test('the original metal hook stays on the rail while the original wooden body swivels without penetration',async()=>{
 for(const{root:source,data}of Object.values(await hangerFixtures())){
  const root=source.clone(true),m=new HangingMotion(0),fit=seatGeometry(data),swivel=createHangerSwivel(root,m);root.rotation.order='ZYX';
  root.remove(swivel.hookGroup);const bodyAudit=new RailAudit(rigidHangerData(root));root.add(swivel.hookGroup);const hookAudit=new RailAudit(rigidHangerData(swivel.hookGroup));
  for(let frame=0;frame<=120;frame++){
   const yaw=-1.43+frame/120*1.4,anchor={x:Math.sin(frame/20)*3.5,y:fit.restY,z:0,yaw,roll:.012*Math.sin(frame/10),pitch:.008*Math.cos(frame/10)},pose=swivel.bodyPose(anchor);
   root.position.set(pose.x,pose.y,pose.z);root.rotation.set(pose.pitch,pose.yaw,pose.roll,'ZYX');swivel.sync(anchor);root.updateMatrixWorld(true);
   assert.equal(bodyAudit.inspect(pose).count,0,'wooden body frame '+frame);assert.equal(hookAudit.inspect({...anchor,yaw:-1.43,roll:0,pitch:0}).count,0,'metal hook frame '+frame);
   const expected=new Matrix4().compose(new Vector3(anchor.x,anchor.y,0),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-1.43),new Vector3(1,1,1));
   for(let i=0;i<16;i++)assert.ok(Math.abs(swivel.hookGroup.matrixWorld.elements[i]-expected.elements[i])<1e-12,'rendered hook transform');
  }
 }
});
