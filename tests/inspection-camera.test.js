import test from'node:test';import assert from'node:assert/strict';import*as T from'three';import{readFileSync}from'node:fs';
import{frameInspectionCamera}from'../src/rack-layout.js';import{SurfaceCloth}from'../src/surface-physics.js';
const close=(a,b,tolerance=3e-13)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
function camera(pan=0,height=6.65,aspect=1.6){const c=new T.OrthographicCamera(-height*aspect/2,height*aspect/2,height/2,-height/2,.1,30);c.position.set(pan,.05,12);c.lookAt(pan,.05,0);c.updateMatrixWorld(true);return c;}
test('camera inspection preserves the old selected-piece screen framing while its world geometry stays unscaled',()=>{
 for(const zoom of[1,1.06,1.15,1.23,1.28])for(const x of[-3.285,0,3.285])for(const yaw of[-1.43,.55,Math.PI])for(const mobile of[false,true]){
  const pan=mobile?x:x*.57,a=camera(pan,mobile?7.2:6.65,mobile?396/637:1.6),b=a.clone(),old=new T.Group(),piece=new T.Group();
  for(const g of[old,piece]){g.rotation.order='ZYX';g.position.set(x,1.94,.35);g.rotation.set(.008,yaw,.012);}
  old.scale.setScalar(zoom);old.updateMatrixWorld(true);frameInspectionCamera(b,piece,pan,zoom);piece.updateMatrixWorld(true);b.updateMatrixWorld(true);assert.deepEqual(piece.scale.toArray(),[1,1,1]);
  for(const p of[[-1.2,-3,.12],[.7,-2,-.15],[.31,-1.7,.11],[-.3,0,0],[0,.5,.05]]){
   const u=old.localToWorld(new T.Vector3(...p)).project(a),v=piece.localToWorld(new T.Vector3(...p)).project(b);close(u.x,v.x);close(u.y,v.y);
  }
 }
});
test('inspection keeps real surface particles in the same world coordinates as the solver during actual bending',()=>{
 for(const name of['short-sleeve','hanging-long-sleeve']){
  const data=JSON.parse(readFileSync(new URL('../public/models/'+name+'-simulation.json',import.meta.url))),s=new SurfaceCloth(data),piece=new T.Group(),c=camera(),point=new T.Vector3();piece.rotation.order='ZYX';let pose;
  for(let f=0;f<36;f++){pose={x:.3*Math.sin(f*.06),y:1.94,z:.35,yaw:f*.02,roll:.008,pitch:-.006};s.step(1/60,pose);}
  piece.position.set(pose.x,pose.y,pose.z);piece.rotation.set(pose.pitch,pose.yaw,pose.roll);
  for(const zoom of[1,1.23,1.28]){
   piece.scale.setScalar(zoom);frameInspectionCamera(c,piece,0,zoom);piece.updateMatrixWorld(true);
   for(let i=0;i<s.count;i++){point.fromArray(s.local,i*3);point.y-=1.58;piece.localToWorld(point);for(let k=0;k<3;k++)close(point.getComponent(k),s.position[i*3+k],3e-7);}
  }
 }
});
test('rack framing at unit zoom is exact and camera magnification preserves near/far and the viewport aspect',()=>{
 const base=camera(-2.1),c=base.clone(),g=new T.Group();g.position.set(3.285,1.65,0);
 frameInspectionCamera(c,g,-2.1,1.28);frameInspectionCamera(c,g,-2.1,1);c.updateMatrixWorld(true);assert.deepEqual(c.position.toArray(),base.position.toArray());assert.deepEqual(c.projectionMatrix.elements,base.projectionMatrix.elements);
 const near=c.near,far=c.far,aspect=(c.right-c.left)/(c.top-c.bottom);frameInspectionCamera(c,g,-2.1,1.23);assert.equal(c.near,near);assert.equal(c.far,far);assert.equal((c.right-c.left)/(c.top-c.bottom),aspect);
});
