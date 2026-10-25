import test from'node:test';import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{DihedralBending,dihedralAngle}from'../src/surface-bending.js';
const rest=new Float64Array([0,0,0,1,0,0,.1,1,0,.3,-1,0]),edge=[{a:0,b:1,opposite:[2,3],faces:[0,1]}],rigidity={u:1.4,v:.7,mixed:.95};
const grain=axis=>[...axis,1,...axis,1];
const bend=(axis,weights=rigidity)=>new DihedralBending(rest,edge,1,{grain:grain(axis),rigidity:weights});
const close=(a,b,eps=1e-12)=>assert.ok(Math.abs(a-b)<eps,`${a} versus ${b}`);
function rotate(p){const q=new Float64Array(p.length),a=.73,b=-.52;for(let i=0;i<p.length;i+=3){const x=p[i]*Math.cos(a)+p[i+2]*Math.sin(a),z=-p[i]*Math.sin(a)+p[i+2]*Math.cos(a);q[i]=x*Math.cos(b)-p[i+1]*Math.sin(b);q[i+1]=x*Math.sin(b)+p[i+1]*Math.cos(b);q[i+2]=z;}return q;}
test('curvature uses its material direction across the hinge, rather than the hinge axis',()=>{
 const base=new DihedralBending(rest,edge).constraints[0].compliance,mean=.375*(rigidity.u+rigidity.v)+.25*rigidity.mixed;
 close(bend([1,0,0]).constraints[0].compliance,base*mean/rigidity.v);close(bend([0,1,0]).constraints[0].compliance,base*mean/rigidity.u);
 function fold(axis){const b=bend(axis),p=new Float64Array(rest);p[10]=-.8;p[11]=.6;b.solve(p,new Float64Array([0,0,0,1]),1/60);return Math.abs(dihedralAngle(p,0,1,2,3));}
 assert.ok(fold([0,1,0])<fold([1,0,0]));
});
test('rotating and translating the whole cloth carries its bend response with it',()=>{
 const data=rotate(rest),axes=rotate(new Float64Array([1,0,0])),rotatedGrain=grain([...axes]);for(let i=0;i<data.length;i+=3){data[i]+=3;data[i+1]-=2;data[i+2]+=.8;}
 const a=bend([1,0,0]),b=new DihedralBending(data,edge,1,{grain:rotatedGrain,rigidity});close(a.constraints[0].compliance,b.constraints[0].compliance);
 const p=new Float64Array(rest);p[10]=-.8;p[11]=.6;const q=rotate(p);for(let i=0;i<q.length;i+=3){q[i]+=3;q[i+1]-=2;q[i+2]+=.8;}
 a.solve(p,new Float64Array([0,0,0,1]),1/60);b.solve(q,new Float64Array([0,0,0,1]),1/60);const expected=rotate(p);for(let i=0;i<q.length;i++)close(q[i],expected[i]+(i%3===0?3:i%3===1?-2:.8));
});
test('mirrored material axes and exchanging U/V have identical physical energy',()=>{
 close(bend([1,0,0]).constraints[0].compliance,bend([-1,0,0]).constraints[0].compliance);
 for(let i=0;i<12;i++){const theta=i*Math.PI/12;close(bend([Math.cos(theta),Math.sin(theta),0]).constraints[0].compliance,bend([-Math.sin(theta),Math.cos(theta),0],{u:rigidity.v,v:rigidity.u,mixed:rigidity.mixed}).constraints[0].compliance);}
});
test('directional energy stays positive and has unit angular mean; softness keeps its role',()=>{
 const base=new DihedralBending(rest,edge).constraints[0].compliance;let sum=0;for(let i=0;i<720;i++){const a=i*Math.PI/720,k=base/bend([Math.cos(a),Math.sin(a),0]).constraints[0].compliance;assert.ok(k>0);sum+=k;}close(sum/720,1);
 for(const bad of[{u:0,v:1,mixed:1},{u:1,v:-1,mixed:1},{u:NaN,v:1,mixed:1},{u:1,v:1,mixed:Infinity}])assert.throws(()=>bend([1,0,0],bad),RangeError);
});
test('uncertain panels and legacy data retain isotropic bending without a world-axis fallback',()=>{
 const base=new DihedralBending(rest,edge).constraints[0].compliance;
 for(const options of[{rigidity},{grain:grain([1,0,0])},{grain:[0,0,0,0,0,0,0,0],rigidity}])close(new DihedralBending(rest,edge,1,options).constraints[0].compliance,base);
 close(bend([.5,.7,0],{u:1,v:1,mixed:1}).constraints[0].compliance,base);
});
test('transferred grain is tangent and unit, and never changes source proxy topology or positions',()=>{
 for(const file of['short-sleeve-simulation.json','hanging-long-sleeve-simulation.json']){
  const d=JSON.parse(readFileSync(new URL('../public/models/'+file,import.meta.url))),old=JSON.parse(readFileSync(new URL('./fixtures/grain-topology.json',import.meta.url)))[file];for(const key of ['positions','triangles'])assert.equal(createHash('sha256').update(JSON.stringify(d[key])).digest('hex'),old[key]);assert.equal(d.grain.length,d.triangles.length/3*4);
  let area=0,covered=0;for(let f=0;f<d.triangles.length/3;f++){const[a,b,c]=d.triangles.slice(f*3,f*3+3).map(i=>d.positions.slice(i*3,i*3+3)),x=b.map((v,i)=>v-a[i]),y=c.map((v,i)=>v-a[i]),n=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]],length=Math.hypot(...n),u=d.grain.slice(f*4,f*4+3);area+=length;if(d.grain[f*4+3]){covered+=length;close(Math.hypot(...u),1,1e-6);close(u.reduce((s,v,i)=>s+v*n[i],0)/(length||1),0,1e-6);}else assert.ok(u.every(x=>x===0));}assert.ok(covered/area>.96);
 }
});
