import test from'node:test';import assert from'node:assert/strict';import*as T from'three';
import{SurfaceCloth}from'../src/surface-physics.js';
// Isolate the existing solver's pre-constraint predictor, retaining its public
// world-pose transform, pin mask, drag and position/velocity reconciliation.
const patch={positions:[-.3,.8,0,.3,.8,0,-.3,-.6,0,.3,-.6,0],triangles:[0,2,1,1,2,3]};
function isolate(C,pose,{mass=1,drag=0}={}){
 const s=new C(patch,{mass,drag,internalDamping:0});s.step(1/60,pose);s.constraints=[];s.strain.solve=()=>{};s.bending.solve=()=>{};s.shell.solve=()=>{};s.shell.enforceOrientation=()=>0;s.contacts.solve=()=>{};s.contacts.applyVelocities=()=>{};s.tetherBase.fill(1e30);s.maxOffsetBase.fill(1e5);return s;
}
function expected(pose){return new T.Vector3(0,9.81/.283,0).applyEuler(new T.Euler(pose.pitch??0,pose.yaw??0,pose.roll??0,'ZYX')).add(new T.Vector3(0,-9.81/.283,0));}
function near(a,b,tol=3e-12){for(let k=0;k<a.length;k++)assert.ok(Number.isFinite(a[k])&&Math.abs(a[k]-b[k])<tol,`${k}: ${a[k]} != ${b[k]}`);}
test('tilted predictor preserves world gravity minus the rotated reference support independently of mass',()=>{
 for(const pitch of[-.008,.008,.15])for(const roll of[-.012,.012])for(const yaw of[-1.43,0,.8,Math.PI])for(const mass of[.7,1.6]){
  const pose={x:.2,y:1.94,z:.35,pitch,roll,yaw},s=isolate(SurfaceCloth,pose,{mass}),p=s.position.slice(),dt=1/60,a=expected(pose);s.step(dt,pose);
  for(let node=0;node<s.count;node++){const i=node*3;if(!s.inverseMass[node]){near(Array.from(s.position.slice(i,i+3)),Array.from(p.slice(i,i+3)));continue;}near(Array.from(s.velocity.slice(i,i+3)),a.toArray().map(v=>v*dt));near(Array.from(s.position.slice(i,i+3)),Array.from(p.slice(i,i+3),(v,k)=>v+a.getComponent(k)*dt*dt));}
 }
});
test('upright yaw, translation, and reduced motion preserve the supplied equilibrium exactly',()=>{
 for(const yaw of[-Math.PI,-1.43,0,.8,Math.PI]){const pose={x:.2,y:1.94,z:.35,yaw},a=new SurfaceCloth(patch);a.step(1/60,pose);const rest=a.position.slice();for(let i=0;i<100;i++)a.step(1/60,pose);assert.deepEqual(a.position,rest);assert.ok(a.velocity.every(v=>v===0));assert.ok(a.asleep);a.step(1/60,{...pose,roll:.012,pitch:.008},true);assert.ok(a.offsets.every(v=>v===0));assert.ok(a.velocity.every(v=>v===0));}
});

test('constant tilt load converges toward the independent Newtonian trajectory as dt shrinks',()=>{
 const pose={x:.2,y:1.94,z:.35,yaw:.7,pitch:.008,roll:.012},a=expected(pose),Ttotal=.3,errors=[];
 for(const n of[18,36,72]){const s=isolate(SurfaceCloth,pose),start=s.position.slice(),dt=Ttotal/n;for(let k=0;k<n;k++)s.step(dt,pose);const node=2,j=node*3,exact=a.toArray().map((v,k)=>start[j+k]+v*Ttotal*Ttotal*.5);errors.push(Math.hypot(...exact.map((v,k)=>s.position[j+k]-v)));near(Array.from(s.velocity.slice(j,j+3)),a.toArray().map(v=>v*Ttotal),2e-10);}
 assert.ok(errors[0]>1e-6);assert.ok(errors[1]<errors[0]*.51&&errors[2]<errors[1]*.51,JSON.stringify(errors));
});

test('real shirts held at a small tilt relax without moving their supported top or staying frozen',async()=>{
 const{readFileSync}=await import('node:fs');const{catalog}=await import('../src/catalog.js');
 for(const index of[6,5]){const item=catalog[index],file=item.type==='shortSleeve'?'short-sleeve':'hanging-long-sleeve',data=JSON.parse(readFileSync(new URL('../public/models/'+file+'-simulation.json',import.meta.url))),s=new SurfaceCloth(data,item.motion),pose={x:.2,y:1.94,z:.35,yaw:.7,pitch:.008,roll:.012};let pin=0,peak=0;
  for(let frame=0;frame<480;frame++){s.step(1/60,pose);for(let i=0;i<s.count;i++){const j=i*3,d=Math.hypot(...s.offsets.subarray(j,j+3));assert.ok(Number.isFinite(d));if(!s.inverseMass[i])pin=Math.max(pin,d);peak=Math.max(peak,d);}}
  assert.ok(pin<1e-6);assert.ok(peak>1e-4&&peak<.08,`${index} tilt response ${peak}`);assert.ok(s.asleep);assert.ok(s.velocity.every(v=>v===0));
 }
});
