import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{TriangleStrain}from'../src/surface-strain.js';import{modelConfig}from'../src/model-config.js';

test('current hanging proxy retains four manifold openings and stable strain coverage',()=>{
 const g=JSON.parse(readFileSync(new URL('../public'+modelConfig.shortSleeve.simulation,import.meta.url))),p=g.positions,t=g.triangles,model=new TriangleStrain(g),edges=new Map();let total=0,supported=0;
 for(let f=0;f<t.length/3;f++){
  const ids=t.slice(f*3,f*3+3),[a,b,c]=ids.map(i=>p.slice(i*3,i*3+3)),u=b.map((v,k)=>v-a[k]),v=c.map((x,k)=>x-a[k]),area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;assert.ok(area>1e-12);total+=area;if(model.active[f])supported+=area;
  for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);if(!edges.has(key))edges.set(key,[]);edges.get(key).push(a<b?1:-1);}
 }
 // The former proxy had only94.06% supported area. Its needle-like faces
 // fell back to edge distances and visibly propagated localized distortion.
 assert.ok(supported/total>.97,`stable material-strain area ${supported/total}`);
 const boundary=new Map();for(const[key,directions]of edges){assert.ok(directions.length<=2);if(directions.length===2){assert.equal(directions[0]+directions[1],0);continue;}const[a,b]=key.split(':').map(Number);for(const[x,y]of[[a,b],[b,a]]){if(!boundary.has(x))boundary.set(x,new Set());boundary.get(x).add(y);}}
 for(const adjacent of boundary.values())assert.equal(adjacent.size,2);
 const seen=new Set();let loops=0;for(const first of boundary.keys()){if(seen.has(first))continue;loops++;const todo=[first];while(todo.length){const v=todo.pop();if(seen.has(v))continue;seen.add(v);todo.push(...boundary.get(v));}}assert.equal(loops,4);
});
