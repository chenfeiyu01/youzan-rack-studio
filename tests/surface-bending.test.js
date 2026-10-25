import test from'node:test';import assert from'node:assert/strict';
import{dihedralAngle,DihedralBending}from'../src/surface-bending.js';
const flat=()=>new Float64Array([0,0,0,1,0,0,.1,1,0,.3,-1,0]);
const edge=[{a:0,b:1,opposite:[2,3]}];
test('signed hinge gradients match independent central differences',()=>{
 const p=new Float64Array([.13,-.2,.07,1.1,.22,-.13,.24,1.15,.53,.61,-.9,-.27]),g=new Float64Array(12);dihedralAngle(p,0,1,2,3,g);
 for(let i=0;i<12;i++){const value=p[i],h=1e-6;p[i]=value+h;const a=dihedralAngle(p,0,1,2,3);p[i]=value-h;const b=dihedralAngle(p,0,1,2,3);p[i]=value;assert.ok(Math.abs(g[i]-(a-b)/(2*h))<1e-7);}
});
test('bending leaves a stretched planar patch alone',()=>{
 const rest=flat(),b=new DihedralBending(rest,edge),p=new Float64Array(rest);p[7]*=1.5;p[10]*=1.5;const before=new Float64Array(p);b.solve(p,new Float64Array([1,1,1,1]),1/60);assert.deepEqual(p,before);
});
test('a folded patch resists either fold direction without moving a fixed support',()=>{
 for(const sign of[-1,1]){const rest=flat(),b=new DihedralBending(rest,edge),p=new Float64Array(rest),theta=sign*.7;p[10]=-Math.cos(theta);p[11]=Math.sin(theta);const before=Math.abs(dihedralAngle(p,0,1,2,3));b.solve(p,new Float64Array([0,0,0,1]),1/60);assert.ok(Math.abs(dihedralAngle(p,0,1,2,3))<before);assert.deepEqual(p.slice(0,9),rest.slice(0,9));}
});
test('a sewn rest crease remains a rest crease after rigid rotation',()=>{
 const rest=flat();rest[10]=-.8;rest[11]=.6;const b=new DihedralBending(rest,edge),p=new Float64Array(rest),a=.9;
 for(let i=0;i<p.length;i+=3){const x=p[i],z=p[i+2];p[i]=x*Math.cos(a)+z*Math.sin(a)+3;p[i+1]-=2;p[i+2]=-x*Math.sin(a)+z*Math.cos(a);}
 const before=new Float64Array(p);b.solve(p,new Float64Array([1,1,1,1]),1/60);for(let i=0;i<p.length;i++)assert.ok(Math.abs(p[i]-before[i])<1e-12);
});
test('degenerate hinges produce finite geometry and no bend projection',()=>{
 const rest=flat();rest[7]=0;const b=new DihedralBending(rest,edge),p=new Float64Array(rest);b.solve(p,new Float64Array([1,1,1,1]),1/60);assert.equal(b.constraints.length,0);assert.ok(p.every(Number.isFinite));
});

test('a softer fabric resists the same fold less, without changing the resting shape',()=>{
 const rest=flat(),w=new Float64Array([0,0,0,1]);
 function solve(softness){const bend=new DihedralBending(rest,edge,softness),p=new Float64Array(rest);p[10]=-.8;p[11]=.6;bend.solve(p,w,1/60);return Math.abs(dihedralAngle(p,0,1,2,3));}
 assert.ok(solve(.6)<solve(1.5));
});
test('folds close to the signed angle boundary use the short correction',()=>{
 const rest=flat(),theta=Math.PI-.02;rest[10]=-Math.cos(theta);rest[11]=Math.sin(theta);const bend=new DihedralBending(rest,edge),p=new Float64Array(rest),next=-Math.PI+.02;p[10]=-Math.cos(next);p[11]=Math.sin(next);const before=new Float64Array(p);bend.solve(p,new Float64Array([0,0,0,1]),1/60);assert.ok(Math.hypot(p[9]-before[9],p[10]-before[10],p[11]-before[11])<.04);
});

test('rest creases across the full signed-angle range relax toward the shortest fold',()=>{
 const angles=[-Math.PI,-Math.PI+.001,-2,-.4,0,.4,2,Math.PI-.001,Math.PI];
 const error=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
 for(const restAngle of angles)for(const current of angles){
  const rest=flat();rest[10]=-Math.cos(restAngle);rest[11]=Math.sin(restAngle);
  const bend=new DihedralBending(rest,edge,.8),p=new Float64Array(rest);p[10]=-Math.cos(current);p[11]=Math.sin(current);
  const before=error(dihedralAngle(p,0,1,2,3),bend.constraints[0].angle),fixed=p.slice(0,9);
  bend.solve(p,new Float64Array([0,0,0,1]),1/60);
  assert.ok(p.every(Number.isFinite));assert.deepEqual(p.slice(0,9),fixed);
  assert.ok(error(dihedralAngle(p,0,1,2,3),bend.constraints[0].angle)<=before+1e-13);
 }
});
