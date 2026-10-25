import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import*as T from'three';
import{ShellConstraints,shellPlaneHeight}from'../src/surface-shell.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/shell-coupled-fold.json',import.meta.url)));
function shell(){const s=new ShellConstraints({positions:[],triangles:[]});s.constraints=fixture.constraints.map(c=>({...c,weights:[...c.weights]}));return s;}
function solve(s,p,w,scale=1){for(let i=0;i<8;i++)if(!s.enforceCoupledOrientation(p,w,scale,Boolean(i%2)))break;for(const c of s.constraints){const gap=Math.sign(c.restHeight)*shellPlaneHeight(p,c)-Math.abs(c.restHeight)*.01*scale;assert.ok(gap>=-1e-8*scale,`coupled clearance ${gap}`);}}
test('the real opposing fold reaches both positive gaps without moving its hanger support',()=>{
 const s=shell(),p=new Float64Array(fixture.positions),w=new Float64Array(fixture.inverseMass),before=p.slice();solve(s,p,w);
 for(let i=0;i<w.length;i++)if(!w[i])assert.deepEqual(p.slice(i*3,i*3+3),before.slice(i*3,i*3+3));
});
test('coupled clearance is independent of rigid orientation, translation and model scale',()=>{
 const base=new Float64Array(fixture.positions),w=new Float64Array(fixture.inverseMass);solve(shell(),base,w);
 const rotation=new T.Quaternion().setFromEuler(new T.Euler(.57,-.92,.33)),origin=new T.Vector3(1.3,-.4,2.1);
 for(const scale of[.6,1.7]){
  const p=new Float64Array(fixture.positions);for(let i=0;i<p.length;i+=3)new T.Vector3().fromArray(p,i).multiplyScalar(scale).applyQuaternion(rotation).add(origin).toArray(p,i);
  solve(shell(),p,w,scale);
  for(let i=0;i<p.length;i+=3){const q=new T.Vector3().fromArray(p,i).sub(origin).applyQuaternion(rotation.clone().invert()).divideScalar(scale);assert.ok(q.distanceTo(new T.Vector3().fromArray(base,i))<1e-8);}
 }
});
test('a free coupled patch conserves its center of mass while recovering its gaps',()=>{
 const s=shell(),p=new Float64Array(fixture.positions),before=p.slice(),w=new Float64Array(fixture.inverseMass.map(v=>v||.5));solve(s,p,w);
 for(let k=0;k<3;k++){let shift=0;for(let i=0;i<w.length;i++)shift+=(p[i*3+k]-before[i*3+k])/w[i];assert.ok(Math.abs(shift)<1e-11,`mass-center shift ${shift}`);}
});
test('a singular opposing block falls back to finite scalar projections',()=>{
 const s=shell();s.constraints=[{...s.constraints[0]},{...s.constraints[0],restHeight:-s.constraints[0].restHeight}];const p=new Float64Array(fixture.positions),w=new Float64Array(fixture.inverseMass),before=p.slice();
 for(let i=0;i<8;i++)s.enforceCoupledOrientation(p,w,1,Boolean(i%2));assert.ok(p.every(Number.isFinite));
 for(let i=0;i<w.length;i++)if(!w[i])assert.deepEqual(p.slice(i*3,i*3+3),before.slice(i*3,i*3+3));
});
