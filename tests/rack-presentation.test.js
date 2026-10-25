import test from'node:test';import assert from'node:assert/strict';
import{HangingMotion}from'../src/physics.js';
import{RackPresentation,presentationYaw,circularDifference}from'../src/rack-presentation.js';
import{garmentRackX}from'../src/rack-layout.js';
import{hoverRackX}from'../src/rack-hover-motion.js';
const motors=choice=>Array.from({length:10},(_,i)=>({x:{value:garmentRackX(i,10,choice)},yaw:{value:-1.43,velocity:0}}));
const rack=(active,hovered=active)=>({mode:'rack',active,hovered,turned:false});
test('a returning inspection retains its owner, face and gap when active selection changes',()=>{
 const p=new RackPresentation(9),m=motors(9);m[9].yaw.value=Math.PI;
 p.setState({mode:'focus',active:9,turned:true});p.setState(rack(6));
 const plan=p.plan(rack(6),.8,false,m);
 assert.equal(p.owner,9);assert.equal(p.turned,true);assert.equal(plan.chosen,9);assert.equal(plan.opening,null);assert.equal(plan.focusTarget,0);
 assert.equal(p.viewIndex(6,.5),9);assert.equal(p.viewIndex(6,0),6);
});
const realMotors=choice=>Array.from({length:10},(_,i)=>new HangingMotion(hoverRackX(i,10,choice),i===choice?-.03:-1.43));
const tick=(p,active,m)=>{const view=p.plan(rack(active),0,false,m);for(let i=0;i<m.length;i++)m[i].step(view.positions[i],0,view.yaws[i],1/60,false,1.56,true,view.drive);return view;};
test('hover targets the latest request immediately while sharing one coordinated carrier gesture',()=>{
 const p=new RackPresentation(6),m=realMotors(6);p.choice=6;let view,complete=0;
 for(let frame=0;frame<180;frame++){
  view=tick(p,7,m);assert.equal(view.opening,7);assert.equal(view.drive,true);assert.ok(Math.abs(view.space.reduce((sum,x)=>sum+x,0)-1)<1e-12);
  if(view.progress===1&&!complete)complete=frame+1;
 }
 assert.ok(complete>1&&complete<=120);assert.ok(Math.abs(m[7].yaw.value+.03)<.035);assert.ok(Math.abs(m[6].yaw.value+1.43)<.035);assert.deepEqual(view.outgoing,[]);
});
test('rapid reversals follow the latest target without snapping the physical hanger',()=>{
 const p=new RackPresentation(6),m=realMotors(6);p.choice=6;
 for(const active of[7,8,6]){const previous=m[active].yaw.value,view=tick(p,active,m);assert.equal(view.opening,active);assert.ok(Math.abs(m[active].yaw.value-previous)<=m[active].turnLimit/60+1e-12);}
 let view;for(let frame=0;frame<180;frame++)view=tick(p,6,m);
 assert.ok(Math.abs(m[6].yaw.value+.03)<.035);assert.deepEqual(view.outgoing,[]);
});
test('rapid inspector changes prepare hidden neighbors before exposing the rack',()=>{
 const p=new RackPresentation(6),m=motors(6);p.setState({mode:'focus',active:6,turned:false});p.setState(rack(6));m[7].yaw.value=0;
 assert.equal(p.plan(rack(6),.04,true,m).focusTarget,1);assert.equal(p.returning,true);
 m[7].yaw.value=-1.43;m[7].x.value+=.2;assert.equal(p.plan(rack(6),.9,true,m).focusTarget,1);
 m[7].x.value=garmentRackX(7,10,6);assert.equal(p.plan(rack(6),.9,true,m).focusTarget,0);assert.equal(p.returning,false);
 m[7].yaw.value=0;assert.equal(p.plan(rack(6),.4,true,m).focusTarget,0,'normal rack activity must not restart an inspection');
});
test('inspector navigation immediately transfers the visible owner',()=>{
 const p=new RackPresentation(6);p.setState({mode:'focus',active:6,turned:true});p.setState({mode:'focus',active:5,turned:false});
 assert.equal(p.owner,5);assert.equal(p.choice,5);assert.equal(p.turned,false);
});
test('returning a back-facing hanger uses the nearest equivalent rack angle',()=>{
 const yaw=presentationYaw(-1.43,Math.PI,0,Math.PI);assert.ok(yaw>Math.PI&&yaw<Math.PI*2);
 assert.ok(Math.abs(circularDifference(yaw,-1.43))<1e-12);
 for(const current of[-20,-Math.PI,0,Math.PI,30])for(const focus of[0,.2,.5,1]){
  const a=presentationYaw(-1.43,Math.PI,focus,current);assert.ok(Number.isFinite(a));assert.ok(Math.abs(a-current)<=Math.PI+1e-12);
 }
});

test('adjacent physical handoffs keep unrelated hangers and the total layout width stable',()=>{
 const p=new RackPresentation(6),m=realMotors(6);p.choice=6;
 for(let frame=0;frame<180;frame++){
  const view=tick(p,7,m);
  for(let i=0;i<10;i++)if(i!==6&&i!==7){assert.ok(Math.abs(view.positions[i]-hoverRackX(i,10,6))<1e-12);assert.ok(Math.abs(m[i].x.value-hoverRackX(i,10,6))<1e-12);}
  assert.ok(view.positions[0]>=-4.385-1e-10&&view.positions[9]<=4.385+1e-10,'hooks remain on the finite rod');
 }
});
