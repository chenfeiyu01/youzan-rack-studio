import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{SurfaceCloth}from'../src/surface-physics.js';import{HangingMotion}from'../src/physics.js';import{RackHoverMotion}from'../src/rack-hover-motion.js';import{catalog}from'../src/catalog.js';
function isolated(){const s=new SurfaceCloth({positions:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2]},{drag:0,internalDamping:0});s.step(1/60,{y:1.58});s.constraints=[];s.seams=[];for(const owner of[s.strain,s.bending,s.shell])owner.solve=()=>{};s.shell.enforceOrientation=()=>0;s.contacts.solve=()=>{s.contacts.contacts.length=0;};return s;}
test('shape damping agrees with the implicit damped oscillator and removes mechanical energy',()=>{
 for(const dt of[1/60,1/120,1/240])for(const velocity of[-.5,.5]){
  const s=isolated(),x=.2,w=s.inverseMass[0],compliance=s.tetherBase[0]*s.profile.softness,rate=2*s.profile.shapeDamping*Math.sqrt(w/compliance),expectedV=(velocity-dt*w*x/compliance)/(1+rate*dt+dt*dt*w/compliance),expectedX=x+dt*expectedV;
  s.position[0]+=x;s.velocity[0]=velocity;s.asleep=false;s.step(dt,{y:1.58});assert.ok(Math.abs(s.position[0]-expectedX)<1e-12);assert.ok(Math.abs(s.velocity[0]-expectedV)<1e-12);
  const before=.5*velocity*velocity/w+.5*x*x/compliance,after=.5*s.velocity[0]**2/w+.5*s.position[0]**2/compliance;assert.ok(after<=before);
 }
});
test('damping uses relative carrier motion and preserves a co-moving cloth translation',()=>{
 const s=isolated(),dt=1/60,speed=.8;for(let n=0;n<s.count;n++)if(s.inverseMass[n])s.velocity[n*3]=speed;s.asleep=false;s.step(dt,{x:speed*dt,y:1.58});assert.ok(Math.abs(s.velocity[0]-speed)<1e-12);assert.ok(Math.abs(s.position[0]-speed*dt)<1e-12);
});
test('a stopped long-sleeve hanger retains lag but does not restart the strong rubber-band sleeve rebound',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/models/hanging-long-sleeve-simulation.json',import.meta.url))),item=catalog[5];
 function replay(shapeDamping){const s=new SurfaceCloth(data,{...item.motion,...(shapeDamping===undefined?{}:{shapeDamping})}),m=new HangingMotion(0,-1.43,true,item.motion),hover=new RackHoverMotion();m.y.snap(1.65);s.advance(1/60,{x:0,y:1.65,z:0,yaw:-1.43});const nodes=Array.from({length:s.count},(_,i)=>i).filter(i=>Math.abs(s.rest[i*3])>.7&&s.rest[i*3+1]<.1);let lag=0,rebound=0,freeMotion=0;
  for(let frame=0;frame<115;frame++){const plan=hover.plan(0,[m],1/60);m.step(0,0,plan.yaws[0],1/60,false,1.65,true,plan.drive);const before=s.position.slice();s.advance(1/60,{x:0,y:1.65,z:0,yaw:m.yaw.value});let energy=0;for(const n of nodes){const i=n*3;lag=Math.max(lag,Math.hypot(s.position[i]-s.target[i],s.position[i+1]-s.target[i+1],s.position[i+2]-s.target[i+2]));energy+=s.velocity[i]**2+s.velocity[i+1]**2+s.velocity[i+2]**2;if(frame>=36&&frame<60)freeMotion=Math.max(freeMotion,Math.hypot(s.position[i]-before[i],s.position[i+1]-before[i+1],s.position[i+2]-before[i+2]));}if(frame>=48&&frame<100)rebound=Math.max(rebound,energy/nodes.length);}
  return{lag,rebound,freeMotion};}
 const old=replay(0),current=replay();assert.ok(current.rebound<old.rebound*.5,JSON.stringify({old,current}));assert.ok(current.lag>.12,'retain real angular lag');assert.ok(current.freeMotion>.005,'retain free cloth motion after arrival');
});
