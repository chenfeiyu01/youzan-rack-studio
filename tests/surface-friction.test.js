import test from 'node:test';
import assert from 'node:assert/strict';
import {SurfaceContacts} from '../src/surface-contact.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-11,`${a} != ${b}`);
const friction={static:.4,dynamic:.25};
function point(slip,penetration=.003,weights=[1,0,0,0],coefficient=friction){
 const rest=[0,.25,.05,-1,0,0,1,0,0,0,1,0],old=new Float64Array(rest);old[2]=.008;const p=old.slice();
 p[0]+=slip;p[2]-=penetration;
 const contact=new SurfaceContacts({positions:rest,triangles:[1,2,3]},new Float64Array(weights),[],coefficient);
 return{old,p,contact};
}
test('loaded self contact sticks below the static traction threshold and slides above it',()=>{
 const slow=point(.0008),fast=point(.002);slow.contact.solve(slow.old,slow.p);fast.contact.solve(fast.old,fast.p);
 near(slow.p[0],0);near(slow.p[2],.008);
 near(fast.p[0],.002-.25*.003);near(fast.p[2],.008);
});
test('friction is limited by normal pressure, leaves an unloaded surface free and does not reverse sliding',()=>{
 const low=point(.002,.001),high=point(.002,.003),unloaded=point(.002,-.001);
 for(const s of[low,high,unloaded])s.contact.solve(s.old,s.p);
 near(low.p[0],.002-.25*.001);near(high.p[0],.002-.25*.003);near(unloaded.p[0],.002);
 for(const slip of[-.002,-.0008,.0008,.002]){const s=point(slip);s.contact.solve(s.old,s.p);assert.ok(s.p[0]*slip>=-1e-15);assert.ok(Math.abs(s.p[0])<=Math.abs(slip));}
});
test('friction transfers the opposite displacement by inverse mass and never moves a kinematic support',()=>{
 const a=point(.002,.003,[1,.5,2,1.5]),none=point(.002,.003,[1,.5,2,1.5],null),before=a.p.slice();
 a.contact.solve(a.old,a.p);none.contact.solve(none.old,none.p);
 const weights=a.contact.weights;
 for(let axis=0;axis<3;axis++){let shift=0;for(let i=0;i<4;i++)shift+=(a.p[i*3+axis]-before[i*3+axis])/weights[i];near(shift,0);}
 assert.ok(a.p[0]<none.p[0]);
 const fixed=point(.002);const support=fixed.p.slice(3);fixed.contact.solve(fixed.old,fixed.p);assert.deepEqual(fixed.p.slice(3),support);
});
test('edge-edge friction uses both interpolated contact points',()=>{
 const rest=[-1,0,.05,1,0,.05,0,-1,0,0,1,0],old=new Float64Array(rest);old[2]=old[5]=.008;const p=old.slice();
 for(const i of[0,1]){p[i*3]+=.002;p[i*3+2]-=.003;}
 const c=new SurfaceContacts({positions:rest,triangles:[],edges:[0,1,2,3]},new Float64Array([1,1,0,0]),[],friction);
 // A symmetric midpoint manifold gives an independent exact solution;
 // swept edge detection and its changing barycentrics have separate tests.
 c.previous=old;c.project({type:'edge',a:0,b:1,c:2,d:3,parameters:[.5,.5],side:-1,gap:.008},p);
 near((p[0]+p[3])*.5,.002-.25*.003);near((p[2]+p[5])*.5,.008);assert.deepEqual(p.slice(6),old.slice(6));
});
test('positional friction is covariant under a world-coordinate rotation, translation and uniform unit change',()=>{
 const a=point(.002),b=point(.002),scale=1.7,theta=.73,ct=Math.cos(theta),st=Math.sin(theta);
 const transform=p=>{for(let i=0;i<p.length;i+=3){const x=p[i],z=p[i+2];p[i]=(ct*x+st*z)*scale+3;p[i+1]=p[i+1]*scale-2;p[i+2]=(-st*x+ct*z)*scale+.8;}};
 transform(b.old);transform(b.p);a.contact.solve(a.old,a.p);b.contact.solve(b.old,b.p,scale);transform(a.p);
 for(let k=0;k<a.p.length;k++)near(a.p[k],b.p[k]);
});
test('explicitly frictionless contact remains identical to the established normal-only projection',()=>{
 const a=point(.002,.003,[1,1,1,1],null),b=point(.002,.003,[1,1,1,1],{static:0,dynamic:0});a.contact.solve(a.old,a.p);b.contact.solve(b.old,b.p);assert.deepEqual(a.p,b.p);
});
test('invalid static and kinetic friction coefficients cannot enter a contact solve',()=>{
 for(const coefficient of[{static:-1,dynamic:0},{static:.2,dynamic:.4},{static:Infinity,dynamic:.2},{static:.4,dynamic:NaN}])assert.throws(()=>point(.001,.003,[1,0,0,0],coefficient),RangeError);
});
