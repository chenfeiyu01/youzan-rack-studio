import test from 'node:test';
import assert from 'node:assert/strict';
import {ShellConstraints,buildShellLinks,shellPlaneHeight} from '../src/surface-shell.js';
function layers(air=false){
 const positions=[-.5,-.5,.005,.5,-.5,.005,.5,.5,.005,-.5,.5,.005,-.5,-.5,-.005,.5,-.5,-.005,.5,.5,-.005,-.5,.5,-.005];
 const triangles=[0,1,2,0,2,3,4,6,5,4,7,6];
 if(air)for(let i=0;i<triangles.length;i+=3)[triangles[i+1],triangles[i+2]]=[triangles[i+2],triangles[i+1]];
 return{positions,triangles};
}
test('inward rays pair the two cloth walls and leave an air gap unconnected',()=>{
 const links=buildShellLinks(layers());assert.equal(links.length,8);assert.ok(links.every(s=>Math.abs(s.length-.01)<1e-12));assert.equal(buildShellLinks(layers(true)).length,0);
});
test('shell thickness recovers after compression while pinned supports stay fixed',()=>{
 const data=layers(),shell=new ShellConstraints(data),p=new Float64Array(data.positions),w=new Float64Array([0,0,0,0,1,1,1,1]);
 for(let i=4;i<8;i++)p[i*3+2]=.004;
 for(let iteration=0;iteration<10;iteration++)shell.solve(p,w,1/60,Boolean(iteration%2));
 assert.deepEqual(p.slice(0,12),new Float64Array(data.positions.slice(0,12)));
 for(let i=4;i<8;i++)assert.ok(Math.abs(p[i*3+2]+.005)<1e-5);
});
test('rest thickness permits rigid turning and uniform model scale',()=>{
 const data=layers(),shell=new ShellConstraints(data),p=new Float64Array(data.positions),angle=.8,scale=1.7;
 for(let i=0;i<p.length;i+=3){const x=p[i],z=p[i+2];p[i]=(x*Math.cos(angle)+z*Math.sin(angle))*scale+2;p[i+1]=p[i+1]*scale+3;p[i+2]=(-x*Math.sin(angle)+z*Math.cos(angle))*scale+1;}
 const before=new Float64Array(p);shell.solve(p,new Float64Array(8).fill(1),1/60,false,scale);for(let i=0;i<p.length;i++)assert.ok(Math.abs(p[i]-before[i])<1e-12);
});
test('cached shell geometry keeps each garment constraint history independent',()=>{
 const data=layers(),a=new ShellConstraints(data),b=new ShellConstraints(data);a.constraints[0].lambda=2;a.constraints[0].weights[0]=.5;assert.equal(b.constraints[0].lambda,0);assert.notEqual(b.constraints[0].weights[0],.5);
});

test('moving-plane gradients agree with independent central differences',()=>{
 const p=new Float64Array([.3,.2,.4,-.2,-.3,.1,1,.1,.2,.1,1,.3]),s={a:0,b:1,c:2,d:3,weights:[.2,.3,.5]},g=new Float64Array(12);shellPlaneHeight(p,s,g);
 for(let i=0;i<12;i++){const value=p[i],h=1e-6;p[i]=value+h;const a=shellPlaneHeight(p,s);p[i]=value-h;const b=shellPlaneHeight(p,s);p[i]=value;assert.ok(Math.abs(g[i]-(a-b)/(2*h))<1e-7);}
});
test('an inverted wall recovers its original side without moving a pinned plane',()=>{
 const data=layers(),shell=new ShellConstraints(data),s=shell.constraints.find(s=>s.a===0);shell.constraints=[s];const p=new Float64Array(data.positions),w=new Float64Array(8);w[0]=1;p[2]=-.015;
 for(let i=0;i<4;i++)shell.solve(p,w,1/60);
 assert.ok(shellPlaneHeight(p,s)*s.restHeight>0);assert.ok(Math.abs(p[2]-.005)<1e-6);assert.deepEqual(p.slice(3),new Float64Array(data.positions.slice(3)));
});
test('the inversion guard turns with the cloth and leaves an already valid wall unchanged',()=>{
 const data=layers(),shell=new ShellConstraints(data),s=shell.constraints.find(s=>s.a===0);shell.constraints=[s];const p=new Float64Array(data.positions),a=.8;
 for(let i=0;i<p.length;i+=3){const x=p[i],z=p[i+2];p[i]=x*Math.cos(a)+z*Math.sin(a)+2;p[i+2]=-x*Math.sin(a)+z*Math.cos(a)+1;}
 const before=new Float64Array(p);assert.equal(shell.enforceOrientation(p,new Float64Array(8).fill(1)),0);assert.deepEqual(p,before);
 const q=[0,0,0];for(let j=0;j<3;j++)for(let k=0;k<3;k++)q[k]+=p[[s.b,s.c,s.d][j]*3+k]*s.weights[j];for(let k=0;k<3;k++)p[k]=2*q[k]-p[k];const w=new Float64Array(8);w[0]=1;shell.enforceOrientation(p,w);
 assert.ok(shellPlaneHeight(p,s)*s.restHeight>0);
});
test('a collapsed counterpart plane is skipped without generating non-finite positions',()=>{
 const data=layers(),shell=new ShellConstraints(data),s=shell.constraints[0];shell.constraints=[s];const p=new Float64Array(data.positions);for(const id of[s.c,s.d])for(let k=0;k<3;k++)p[id*3+k]=p[s.b*3+k];assert.equal(shellPlaneHeight(p,s),null);assert.equal(shell.enforceOrientation(p,new Float64Array(8).fill(1)),0);assert.ok(p.every(Number.isFinite));
});

test('internal side correction conserves mass center and introduces no net torque',()=>{
 const rest=[.3,.3,.01,0,0,0,1,0,0,0,1,0],shell=new ShellConstraints({positions:rest,triangles:[1,2,3]}),s={a:0,b:1,c:2,d:3,weights:[.4,.3,.3],restHeight:.01,length:.01,compliance:1e-8,lambda:0};shell.constraints=[s];const p=new Float64Array(rest),w=new Float64Array([1,.5,1/3,.25]);p[2]=-.01;const before=new Float64Array(p),mass=[1,2,3,4];shell.enforceOrientation(p,w);
 const translation=[0,0,0],torque=[0,0,0];for(let i=0;i<4;i++){const j=i*3,d=[0,1,2].map(k=>(p[j+k]-before[j+k])*mass[i]);for(let k=0;k<3;k++)translation[k]+=d[k];torque[0]+=before[j+1]*d[2]-before[j+2]*d[1];torque[1]+=before[j+2]*d[0]-before[j]*d[2];torque[2]+=before[j]*d[1]-before[j+1]*d[0];}assert.ok(translation.every(v=>Math.abs(v)<1e-12));assert.ok(torque.every(v=>Math.abs(v)<1e-12));assert.ok(shellPlaneHeight(p,s)>shellPlaneHeight(before,s));
});
