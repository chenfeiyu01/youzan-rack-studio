import test from'node:test';import assert from'node:assert/strict';
import{RackPresentation,presentationYaw,circularDifference}from'../src/rack-presentation.js';
import{garmentRackX}from'../src/rack-layout.js';
const motors=choice=>Array.from({length:10},(_,i)=>({x:{value:garmentRackX(i,10,choice)},yaw:{value:-1.43,velocity:0}}));
const rack=(active,hovered=active)=>({mode:'rack',active,hovered,turned:false});
test('a returning inspection retains its owner, face and gap when active selection changes',()=>{
 const p=new RackPresentation(9),m=motors(9);m[9].yaw.value=Math.PI;
 p.setState({mode:'focus',active:9,turned:true});p.setState(rack(6));
 const plan=p.plan(rack(6),.8,false,m);
 assert.equal(p.owner,9);assert.equal(p.turned,true);assert.equal(plan.chosen,9);assert.equal(plan.opening,null);assert.equal(plan.focusTarget,0);
 assert.equal(p.viewIndex(6,.5),9);assert.equal(p.viewIndex(6,0),6);
});
test('the opening waits for the previous hanger to park, then uses the newest request',()=>{
 const p=new RackPresentation(6),m=motors(6);p.choice=6;m[6].yaw.value=0;
 for(const active of[7,8,5]){p.setState(rack(active));const a=p.plan(rack(active),0,false,m);assert.equal(a.chosen,6);assert.equal(a.opening,null);}
 m[6].yaw.value=-1.43;m[6].yaw.velocity=1;assert.equal(p.plan(rack(5),0,false,m).chosen,6);
 m[6].yaw.velocity=0;const a=p.plan(rack(5),0,false,m);assert.equal(a.chosen,5);assert.equal(a.opening,5);
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
