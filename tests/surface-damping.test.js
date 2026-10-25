import test from'node:test';
import assert from'node:assert/strict';
import{SurfaceDamping}from'../src/surface-damping.js';
const data={positions:[-.5,0,0,.5,0,0,0,.8,.2,0,-.8,-.1],triangles:[0,1,2,1,0,3]},p=Float64Array.from(data.positions),w=Float64Array.from([1,.5,2,.75]);
function momentum(v){const result=[0,0,0,0,0,0];for(let n=0;n<w.length;n++){const i=n*3,m=1/w[n],x=v[i]*m,y=v[i+1]*m,z=v[i+2]*m;result[0]+=x;result[1]+=y;result[2]+=z;result[3]+=p[i+1]*z-p[i+2]*y;result[4]+=p[i+2]*x-p[i]*z;result[5]+=p[i]*y-p[i+1]*x;}return result;}
test('internal cloth damping preserves a complete rigid translation and rotation',()=>{
 const d=new SurfaceDamping(data),v=new Float64Array(p.length);
 for(let i=0;i<p.length;i+=3){v[i]=.2+.7*p[i+2]-.3*p[i+1];v[i+1]=-.1+.3*p[i]-.4*p[i+2];v[i+2]=.5+.4*p[i+1]-.7*p[i];}
 const before=v.slice();d.step(p,v,w,1/60,24);for(let i=0;i<v.length;i++)assert.ok(Math.abs(v[i]-before[i])<1e-12);
});
test('local extension loses kinetic energy without injecting net force or torque',()=>{
 const d=new SurfaceDamping(data),v=Float64Array.from(p,(_,i)=>Math.sin(i*1.7)),before=momentum(v),energy=v=>v.reduce((sum,n,i)=>sum+n*n/w[Math.floor(i/3)],0),start=energy(v);
 d.step(p,v,w,1/60,24);assert.ok(energy(v)<start);const after=momentum(v);for(let i=0;i<before.length;i++)assert.ok(Math.abs(after[i]-before[i])<1e-12);
});
