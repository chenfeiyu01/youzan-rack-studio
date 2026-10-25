import test from 'node:test';
import assert from 'node:assert/strict';
import {SurfaceContacts,cubicRoots01} from '../src/surface-contact.js';
const triangle=[-1,0,0,1,0,0,0,1,0];
function setup(point=[0,.25,.05],weights=[1,0,0,0],links=[]){const positions=[...point,...triangle],data={positions,triangles:[1,2,3]};return{old:new Float64Array(positions),next:new Float64Array(positions),contacts:new SurfaceContacts(data,new Float64Array(weights),links)};}
test('CCD catches a point passing completely through a face within one step',()=>{const {old,next,contacts}=setup();next[2]=-.05;assert.equal(contacts.solve(old,next),1);assert.ok(next[2]>=.00799);const v=new Float64Array([0,0,-3,0,0,0,0,0,0,0,0,0]);contacts.applyVelocities(v,next);assert.ok(Math.abs(v[2])<1e-10);});
test('relative sweep catches a moving triangle crossing a stationary point',()=>{const {old,next,contacts}=setup();for(const i of[5,8,11])next[i]=.10;assert.equal(contacts.solve(old,next),1);assert.ok(next[2]>=.10799);});
test('a fixed point transfers contact correction into the free face without moving the pin',()=>{const {old,next,contacts}=setup([0,.25,.05],[0,1,1,1]);for(const i of[5,8,11])next[i]=.1;assert.equal(contacts.solve(old,next),1);assert.equal(next[2],.05);const c=contacts.contacts[0],n=contacts.normal(c,next),b=c.bary;let gap=0;for(let k=0;k<3;k++)gap+=((next[k]-[1,2,3].reduce((s,id,j)=>s+next[id*3+k]*b[j],0))*n[k]);assert.ok(gap>=.0079);});
test('a lateral near miss and coplanar sliding do not create contact impulses',()=>{const miss=setup([3,.25,.05]);miss.next[2]=-.05;assert.equal(miss.contacts.solve(miss.old,miss.next),0);const flat=setup([0,.25,0]);flat.next[0]=.1;assert.equal(flat.contacts.solve(flat.old,flat.next),0);});
test('stitched neighboring geometry is excluded from self contact',()=>{const {old,next,contacts}=setup([0,.25,.05],[1,0,0,0],[{a:0,b:1}]);next[2]=-.05;assert.equal(contacts.solve(old,next),0);});
test('cubic root isolation retains two interior crossings when endpoint signs agree',()=>{const roots=cubicRoots01([.16,-.84,0,1]);assert.equal(roots.length,2);assert.ok(Math.abs(roots[0]-.2)<1e-6);assert.ok(Math.abs(roots[1]-.8)<1e-6);});
function edgesSetup(weights=[1,1,0,0]){const positions=[-1,0,.05,1,0,.05,0,-1,0,0,1,0],data={positions,triangles:[],edges:[0,1,2,3]};return{old:new Float64Array(positions),next:new Float64Array(positions),contacts:new SurfaceContacts(data,new Float64Array(weights))};}
test('crossing edges are stopped even when no point lies inside a triangle',()=>{const {old,next,contacts}=edgesSetup();next[2]=next[5]=-.05;assert.equal(contacts.solve(old,next),1);assert.ok(next[2]>=.00799&&next[5]>=.00799);});
test('moving edge contact conserves free-particle normal momentum without bounce',()=>{const {old,next,contacts}=edgesSetup([1,1,1,1]);next[2]=next[5]=-.05;assert.equal(contacts.solve(old,next),1);const v=new Float64Array([0,0,-3,0,0,-3,0,0,0,0,0,0]);contacts.applyVelocities(v,next);assert.ok(Math.abs(v[2]+v[5]+v[8]+v[11]+6)<1e-9);assert.ok(Math.abs((v[2]+v[5]-v[8]-v[11])*.5)<1e-9);});
test('an off-segment sweep remains free',()=>{const {old,next,contacts}=edgesSetup();old[6]=old[9]=next[6]=next[9]=3;next[2]=next[5]=-.05;assert.equal(contacts.solve(old,next),0);});
test('contact at the exact end of a step retains a finite separation',()=>{const {old,next,contacts}=setup();next[2]=0;assert.equal(contacts.solve(old,next),1);assert.ok(next[2]>=.00799);});
test('a separating particle keeps its outgoing velocity',()=>{const {old,next,contacts}=setup();next[2]=-.05;contacts.solve(old,next);const v=new Float64Array([0,0,2,0,0,0,0,0,0,0,0,0]);contacts.applyVelocities(v,next);assert.equal(v[2],2);});
test('parallel edges moving apart do not create a spurious crossing',()=>{const {old,next,contacts}=edgesSetup();for(const p of[old,next]){p[6]=-1;p[7]=.4;p[9]=1;p[10]=.4;}next[2]=next[5]=-.05;assert.equal(contacts.solve(old,next),0);});
test('a resting contact remains active on the next step without crossing the face again',()=>{const {old,next,contacts}=setup();next[2]=-.05;contacts.solve(old,next);old.set(next);next[2]=.007;assert.equal(contacts.solve(old,next),1);assert.ok(next[2]>=.00799);const v=new Float64Array([0,0,-.06,0,0,0,0,0,0,0,0,0]);contacts.applyVelocities(v,next);assert.ok(Math.abs(v[2])<1e-10);});
test('contact friction is bounded by the normal impulse and dissipates tangential motion',()=>{const {old,next,contacts}=setup();next[2]=-.05;contacts.solve(old,next);const v=new Float64Array([2,0,-3,0,0,0,0,0,0,0,0,0]);contacts.applyVelocities(v,next,.5);assert.ok(Math.abs(v[0]-.5)<1e-10);assert.ok(Math.abs(v[2])<1e-10);});
test('a narrow shared region retains a swept contact on a large triangle',()=>{const {old,next,contacts}=setup();next[2]=-.05;assert.equal(contacts.solve(old,next,1,[-.01,.24,-.01,.01,.26,.01]),1);assert.ok(next[2]>=.00799);});
test('a disjoint shared region skips unrelated faces without moving them',()=>{const {old,next,contacts}=setup();next[2]=-.05;assert.equal(contacts.solve(old,next,1,[4,4,4,5,5,5]),0);assert.equal(contacts.candidateChecks,0);assert.equal(next[2],-.05);});
test('a particle-only collision group still collides with another group full of triangles',()=>{
 const positions=[0,.25,.05,...triangle],data={positions,triangles:[1,2,3],groups:new Uint8Array([9,2,2,2])},contacts=new SurfaceContacts(data,new Float64Array([1,0,0,0])),old=new Float64Array(positions),next=old.slice();next[2]=-.05;
 assert.equal(contacts.solve(old,next),1);assert.ok(next[2]>=.00799);
});
test('refinement reuses conservative candidates and catches a face entering a formerly empty cell',()=>{
 const positions=[0,.25,.188,-1,0,.171,1,0,.171,0,1,.171],data={positions,triangles:[1,2,3],groups:new Uint8Array([9,2,2,2])},c=new SurfaceContacts(data,new Float64Array([1,0,0,0])),old=new Float64Array(positions),p=old.slice();c.stepId=1;
 assert.equal(c.solve(old,p),0);assert.equal(c.faceGrid.builds,1);
 for(const i of[5,8,11])p[i]+=.009;
 assert.equal(c.solve(old,p),1);assert.equal(c.faceGrid.reuses,1);assert.ok(p[2]>=.18799);
 for(const i of[5,8,11])p[i]+=.04;
 assert.equal(c.solve(old,p),1);assert.equal(c.faceGrid.builds,2);assert.ok(p[2]>=.22799);
 c.stepId=2;c.solve(old,p);assert.equal(c.faceGrid.builds,3);
});
test('a changed shared region rebuilds candidates before exposing a newly active triangle',()=>{
 const positions=[4,.25,.05,...triangle,3,0,0,5,0,0,4,1,0],data={positions,triangles:[1,2,3,4,5,6],groups:new Uint8Array([9,2,2,2,2,2,2])},c=new SurfaceContacts(data,new Float64Array([1,0,0,0,0,0,0])),old=new Float64Array(positions),next=old.slice();c.stepId=1;
 assert.equal(c.solve(old,next,1,[-1,-.1,-.1,1,1.1,.1]),0);next[2]=-.05;
 assert.equal(c.solve(old,next,1,[3,-.1,-.1,5,1.1,.1]),1);assert.equal(c.faceGrid.builds,2);assert.ok(next[2]>=.00799);
});
test('rest-seam rejections compile into static exclusions without removing new contacts',()=>{
 const positions=[0,.25,.001,...triangle],data={positions,triangles:[1,2,3]},old=new Float64Array(positions),next=old.slice(),c=new SurfaceContacts(data,new Float64Array([1,0,0,0]));next[2]=-.05;
 assert.equal(c.solve(old,next),0);assert.equal(c.candidateChecks,1);assert.equal(next[2],-.05);
 assert.equal(c.solve(old,next),0);assert.equal(c.candidateChecks,0);
 const other=new SurfaceContacts(data,new Float64Array([.5,1,1,1]));assert.equal(other.solve(old,next),0);assert.equal(other.candidateChecks,0);
 const edges={positions:[-1,0,.001,1,0,.001,0,-1,0,0,1,0],triangles:[],edges:[0,1,2,3]},e=new SurfaceContacts(edges,new Float64Array([1,1,1,1])),from=new Float64Array(edges.positions),to=from.slice();to[2]=to[5]=-.05;
 assert.equal(e.solve(from,to),0);assert.equal(e.candidateChecks,1);assert.equal(e.solve(from,to),0);assert.equal(e.candidateChecks,0);
});
