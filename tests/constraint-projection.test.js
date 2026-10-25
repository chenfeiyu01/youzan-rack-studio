import test from'node:test';import assert from'node:assert/strict';
import{TriangleStrain}from'../src/surface-strain.js';import{DihedralBending}from'../src/surface-bending.js';
const subtract=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],point=(p,i)=>[p[i*3],p[i*3+1],p[i*3+2]];
function valueStrain(p,c,component){const e=subtract(point(p,c.b),point(p,c.a)),d=subtract(point(p,c.c),point(p,c.a)),u=e.map((v,k)=>v*c.u1+d[k]*c.u2),v=e.map((x,k)=>x*c.v1+d[k]*c.v2),ul=Math.hypot(...u),vl=Math.hypot(...v);return component===0?ul:component===1?vl:dot(u,v)/(ul*vl);}
function valueAngle(p,c){const a=point(p,c.a),e=subtract(point(p,c.b),a),n=cross(e,subtract(point(p,c.c),a)),m=cross(subtract(point(p,c.d),a),e);return Math.atan2(dot(e,cross(n,m))/Math.hypot(...e),dot(n,m));}
// Independent central differences of vector strain / signed angle; no production gradients.
function numericalGradient(p,ids,value){const g=new Float64Array(ids.length*3),h=1e-6;for(let j=0;j<ids.length;j++)for(let axis=0;axis<3;axis++){const k=ids[j]*3+axis,old=p[k];p[k]=old+h;const hi=value();p[k]=old-h;const lo=value();p[k]=old;g[j*3+axis]=(hi-lo)/(2*h);}return g;}
function project(p,w,ids,value,error,alpha,lambda){if(ids.every(i=>w[i]===0))return lambda;const g=numericalGradient(p,ids,value);let weight=0;for(let i=0;i<ids.length;i++)weight+=w[ids[i]]*(g[i*3]**2+g[i*3+1]**2+g[i*3+2]**2);const dl=(-error-alpha*lambda)/(weight+alpha);for(let axis=0;axis<3;axis++)for(let i=0;i<ids.length;i++)p[ids[i]*3+axis]+=w[ids[i]]*g[i*3+axis]*dl;return lambda+dl;}
function nearArrays(a,b,label){assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Number.isFinite(a[i])&&Math.abs(a[i]-b[i])<1e-7,`${label}[${i}] ${a[i]} vs ${b[i]}`);}
test('material-strain projection matches an independent finite-difference XPBD response',()=>{
 const data={positions:[0,0,0,1,0,0,.1,1,0],triangles:[0,1,2],grain:[1,0,0,1]},deformed=[.13,.2,.03,1.16,.24,.25,.31,1.3,-.08];
 for(const scale of[.65,1,1.4])for(const dt of[1/120,1/60,1/35])for(const weights of[[0,1,2],[.5,1,2],[1,0,.6],[0,0,0]]){
  const s=new TriangleStrain(data),p=Float64Array.from(deformed,v=>v*scale),q=p.slice(),w=new Float64Array(weights),lambdas=s.constraints.map(()=>new Float64Array(3));
  for(let step=0;step<4;step++){const reverse=Boolean(step%2);s.solve(p,w,dt,reverse,scale);for(let j=0;j<s.constraints.length;j++){const k=reverse?s.constraints.length-1-j:j,c=s.constraints[k],ids=[c.a,c.b,c.c];for(const component of(reverse?[2,1,0]:[0,1,2])){const value=()=>valueStrain(q,c,component),error=value()-(component===2?0:scale),alpha=c.compliance[component]/(dt*dt*(component===2?scale*scale:1));lambdas[k][component]=project(q,w,ids,value,error,alpha,lambdas[k][component]);}}nearArrays(p,q,'strain position');for(let i=0;i<s.constraints.length;i++)nearArrays(s.constraints[i].lambda,lambdas[i],'strain multipliers');}
 }
});
test('signed-hinge projection matches an independent numerical-angle response through both traversal directions',()=>{
 const rest=new Float64Array([0,0,0,1,0,.1,.2,1,.15,.3,-.9,.35,1.1,-.3,.6]),edges=[{a:0,b:1,opposite:[2,3]},{a:1,b:3,opposite:[0,4]}];
 for(const scale of[.65,1,1.4])for(const dt of[1/120,1/60,1/35])for(const weights of[[0,1,.5,2,1],[.5,1,2,.7,0],[0,0,0,0,0]]){
  const s=new DihedralBending(rest,edges,.8);assert.equal(s.constraints.length,2);const p=Float64Array.from(rest,(v,i)=>(v+.04*Math.sin(i*.8))*scale),q=p.slice(),w=new Float64Array(weights),lambdas=new Float64Array(s.constraints.length);
  for(let step=0;step<4;step++){const reverse=Boolean(step%2);s.solve(p,w,dt,reverse);for(let j=0;j<s.constraints.length;j++){const k=reverse?s.constraints.length-1-j:j,c=s.constraints[k],ids=[c.a,c.b,c.c,c.d],value=()=>valueAngle(q,c),delta=value()-valueAngle(rest,c),error=Math.atan2(Math.sin(delta),Math.cos(delta)),alpha=c.compliance/(dt*dt);lambdas[k]=project(q,w,ids,value,error,alpha,lambdas[k]);}nearArrays(p,q,'bending position');nearArrays(s.constraints.map(c=>c.lambda),lambdas,'bending multipliers');}
 }
});
