import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import{SurfaceCloth}from'../src/surface-physics.js';
import test from'node:test';import assert from'node:assert/strict';
import{triangleStrain,TriangleStrain}from'../src/surface-strain.js';
const data={positions:[0,0,0,1,0,0,.1,1,0],triangles:[0,1,2],grain:[1,0,0,1]},compliance={u:1.5e-7,v:3e-7,shear:2e-5};
const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} vs ${b}`);
test('all three material-strain gradients agree with central finite differences',()=>{
 const s=new TriangleStrain(data),c=s.constraints[0],p=new Float64Array([.1,.2,.03,1.2,.24,.2,.18,1.3,-.1]),g=new Float64Array(9);
 for(let component=0;component<3;component++){triangleStrain(p,c,component,g);for(let k=0;k<9;k++){const old=p[k],h=1e-6;p[k]=old+h;const a=triangleStrain(p,c,component);p[k]=old-h;const b=triangleStrain(p,c,component);p[k]=old;near(g[k],(a-b)/(2*h),1e-8);}}
});
test('uniform extension is not shear; turning a material column changes shear without stretching it',()=>{
 const d={...data,positions:[0,0,0,1,0,0,0,1,0]},c=new TriangleStrain(d).constraints[0],p=new Float64Array(d.positions);for(let k=0;k<p.length;k++)p[k]*=1.4;near(triangleStrain(p,c,0),1.4);near(triangleStrain(p,c,1),1.4);near(triangleStrain(p,c,2),0);
 p.set([0,0,0,1,0,0,Math.sin(.3),Math.cos(.3),0]);near(triangleStrain(p,c,0),1);near(triangleStrain(p,c,1),1);near(triangleStrain(p,c,2),Math.sin(.3));
});
test('isometric rigid motion and supplied garment scale require no strain correction',()=>{
 const s=new TriangleStrain(data),w=new Float64Array([1,1,1]);for(const scale of[.65,1,1.4]){const p=new Float64Array(data.positions);for(let i=0;i<p.length;i+=3){const x=p[i]*Math.cos(.8)+p[i+2]*Math.sin(.8),z=-p[i]*Math.sin(.8)+p[i+2]*Math.cos(.8);p[i]=x*scale+3;p[i+1]=p[i+1]*scale-2;p[i+2]=z*scale+.8;}const before=p.slice();s.reset();s.solve(p,w,1/60,false,scale);for(let k=0;k<p.length;k++)near(p[k],before[k]);}
});
test('uncertain directions and collapsed/sliver rest faces retain edge fallback',()=>{
 assert.equal(new TriangleStrain({...data,grain:[0,0,0,0]}).constraints.length,0);assert.equal(new TriangleStrain({...data,positions:[0,0,0,1,0,0,2,0,0]}).constraints.length,0);
 const s=new TriangleStrain(data),p=new Float64Array(9);s.solve(p,new Float64Array([1,1,1]),1/60);assert.ok(p.every(Number.isFinite));
});
test('projection preserves mass center, its gradients have zero net torque, and pins remain fixed',()=>{
 const s=new TriangleStrain(data),w=new Float64Array([.5,1,2]),p=new Float64Array([0,0,.1,1.15,0,.2,.1,1.2,-.1]),before=p.slice();s.solve(p,w,1/60);const sum=[0,0,0];for(let node=0;node<3;node++){const i=node*3,delta=[0,1,2].map(k=>(p[i+k]-before[i+k])/w[node]);for(let k=0;k<3;k++)sum[k]+=delta[k];}sum.forEach(v=>near(v,0));
 // Finite Gauss-Seidel projections preserve linear momentum exactly. Torque
 // is checked per individual gradient separately, before finite rotation terms.
 const c=s.constraints[0],g=new Float64Array(9);for(let component=0;component<3;component++){triangleStrain(before,c,component,g);const t=[0,0,0];for(let node=0;node<3;node++){const i=node*3;t[0]+=before[i+1]*g[i+2]-before[i+2]*g[i+1];t[1]+=before[i+2]*g[i]-before[i]*g[i+2];t[2]+=before[i]*g[i+1]-before[i+1]*g[i];}t.forEach(v=>near(v,0));}
 const pinned=new Float64Array(before);s.reset();s.solve(pinned,new Float64Array([0,0,1]),1/60);assert.deepEqual(pinned.slice(0,6),before.slice(0,6));
});

test('affine strain energy is independent of the mesh diagonal or center subdivision',()=>{
 const points=[0,0,0,1,0,0,1.2,1,0,.1,1,0,.575,.5,0],meshes=[[0,1,2,0,2,3],[0,1,3,1,2,3],[0,1,4,1,2,4,2,3,4,3,0,4]],energies=[];
 for(const triangles of meshes){const grain=triangles.flatMap((_,i)=>i%3===0?[1,0,0,1]:[]),s=new TriangleStrain({positions:points,triangles,grain}),p=new Float64Array(points);for(let i=0;i<p.length;i+=3){p[i]=points[i]*1.06+points[i+1]*.13;p[i+1]=points[i+1]*.98;p[i+2]=points[i]*.1;}let energy=0;for(const c of s.constraints)for(let k=0;k<3;k++){const error=triangleStrain(p,c,k)-(k===2?0:1);energy+=error*error/(2*c.compliance[k]);}energies.push(energy);}
 for(const e of energies)near(e/energies[0],1,1e-10);
});

test('a deformed patch gives the same projected response after arbitrary world rotation',()=>{
 const rotate=p=>{const q=p.slice(),a=.73,b=-.41;for(let i=0;i<p.length;i+=3){const x=p[i]*Math.cos(a)+p[i+2]*Math.sin(a),z=-p[i]*Math.sin(a)+p[i+2]*Math.cos(a);q[i]=x*Math.cos(b)-p[i+1]*Math.sin(b);q[i+1]=x*Math.sin(b)+p[i+1]*Math.cos(b);q[i+2]=z;}return q;};
 const p=new Float64Array([.1,.2,.03,1.2,.24,.2,.18,1.3,-.1]),q=rotate(p),a=new TriangleStrain(data),b=new TriangleStrain(data),w=new Float64Array([0,1,2]);for(let i=0;i<5;i++){a.solve(p,w,1/60,Boolean(i%2));b.solve(q,w,1/60,Boolean(i%2));}const expected=rotate(p);for(let i=0;i<q.length;i++)near(q[i],expected[i]);
});

// Keep all source adjacency for self-contact and smoothing while only replacing
// edge forces on fully covered triangles. Missing grain remains a legacy solve.
test('replacing edge forces preserves real garment contact topology and uncertain-edge fallback',()=>{
 const expected=JSON.parse(readFileSync(new URL('./fixtures/strain-contact-links.json',import.meta.url)));
 for(const file of ['short-sleeve','hanging-long-sleeve']){const d=JSON.parse(readFileSync(new URL('../public/models/'+file+'-simulation.json',import.meta.url))),s=new SurfaceCloth(d),pairs=s.contactLinks.map(({a,b})=>[a,b]);assert.equal(pairs.length,expected[file].count);assert.equal(createHash('sha256').update(JSON.stringify(pairs)).digest('hex'),expected[file].sha256);assert.ok(s.constraints.some(c=>c.replacedByStrain)&&s.constraints.some(c=>!c.replacedByStrain));let totalArea=0,activeArea=0;for(let f=0;f<d.triangles.length/3;f++){const [a,b,c]=d.triangles.slice(f*3,f*3+3).map(i=>d.positions.slice(i*3,i*3+3)),u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;totalArea+=area;if(s.strain.active[f])activeArea+=area;}assert.ok(activeArea/totalArea>(file==='short-sleeve'?.95:.98));
 const legacy=new SurfaceCloth({...d,grain:undefined});assert.equal(legacy.strain.constraints.length,0);assert.ok(legacy.constraints.every(c=>!c.replacedByStrain));
 }
});

test('the real narrow hem retains distance support instead of an ill-conditioned face solve',()=>{
 const data=JSON.parse(readFileSync(new URL('./fixtures/strain-narrow-hem.json',import.meta.url))),s=new SurfaceCloth(data);assert.equal(s.strain.constraints.length,0);assert.equal(s.constraints.length,3);assert.ok(s.constraints.every(c=>!c.replacedByStrain));
});

test('deformed strain response scales with the garment, including angular shear compliance',()=>{
 const original=new Float64Array([.1,.2,.03,1.2,.24,.2,.18,1.3,-.1]),w=new Float64Array([0,1,2]);
 for(const scale of [.65,1.4]){const a=new TriangleStrain(data),b=new TriangleStrain(data),p=original.slice(),q=Float64Array.from(original,v=>v*scale);for(let i=0;i<5;i++){a.solve(p,w,1/60,Boolean(i%2),1);b.solve(q,w,1/60,Boolean(i%2),scale);}for(let i=0;i<p.length;i++)near(q[i],p[i]*scale);}
});
