import test from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import*as T from'three';
import{catalog}from'../src/catalog.js';
import{modelConfig}from'../src/model-config.js';
import{garmentSimulation,applyGarmentForm}from'../src/garment-form.js';
import{SurfaceCloth}from'../src/surface-physics.js';
import{RackHoverMotion}from'../src/rack-hover-motion.js';
import{loadGeometryAsset}from'./helpers/geometry-asset.js';
const sources=Object.fromEntries(Object.entries(modelConfig).map(([type,c])=>[type,JSON.parse(readFileSync(new URL('../public'+c.simulation,import.meta.url)))]));
test('short garments have an open body and sleeve volume instead of flat opposing panels',async()=>{
 const {scene}=await loadGeometryAsset(new URL('../public'+modelConfig.shortSleeve.url,import.meta.url)),base=scene.getObjectByName('Fabric').geometry;
 for(const item of catalog.filter(i=>i.type==='shortSleeve')){
  const g=base.clone();applyGarmentForm(g,item.form,sources.shortSleeve);const p=g.attributes.position;
  for(const[region,min,max]of[[(x,y)=>Math.abs(x)<.3&&y<-.6&&y>-.9,.40,.65],[(x,y)=>x>.95&&y<.4,.20,.40]]){
   let lo=Infinity,hi=-Infinity,count=0;
   for(let i=0;i<p.count;i++)if(region(p.getX(i),p.getY(i))){lo=Math.min(lo,p.getZ(i));hi=Math.max(hi,p.getZ(i));count++;}
   assert.ok(count>50);assert.ok(hi-lo>min&&hi-lo<max,`${item.id}: open panel spacing ${hi-lo}`);
  }
  g.dispose();
 }
});
test('each tailored garment has its own rest shape while render/physics agree and the supported top stays fixed',()=>{
 const signatures=new Set();
 for(const item of catalog){
  const source=sources[item.type],before=source.positions.slice(),data=garmentSimulation(source,item),g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(Float64Array.from(source.positions),3));
  applyGarmentForm(g,item.form,source);assert.deepEqual(source.positions,before);assert.equal(data.triangles,source.triangles);assert.equal(data.positions.length,source.positions.length);assert.equal(data.grain.length,source.grain.length);
  for(let i=0;i<data.positions.length;i++){assert.ok(Number.isFinite(data.positions[i]));assert.ok(Math.abs(g.attributes.position.array[i]-data.positions[i])<1e-12);if(source.positions[Math.floor(i/3)*3+1]>=.55)assert.equal(data.positions[i],source.positions[i]);}
  for(let i=0;i<data.grain.length;i+=4){assert.equal(data.grain[i+3],source.grain[i+3]);if(data.grain[i+3])assert.ok(Math.abs(Math.hypot(...data.grain.slice(i,i+3))-1)<1e-9);}
  const fingerprint=data.positions.map(n=>n.toFixed(5)).join(',');assert.ok(!signatures.has(fingerprint),item.id);signatures.add(fingerprint);g.dispose();
 }
});
test('tailored short and long garments keep finite full cloth response through a complete hover',()=>{
 for(const index of[0,4,5]){
  const item=catalog[index],s=new SurfaceCloth(garmentSimulation(sources[item.type],item),item.motion),motion=[{yaw:{value:-1.43}}],hover=new RackHoverMotion();s.advance(1/60,{y:1.65,yaw:-1.43});let lag=0;
  for(let frame=0;frame<90;frame++){const plan=hover.plan(0,motion,1/60);motion[0].yaw.value=plan.yaws[0];s.advance(1/60,{y:1.65,yaw:plan.yaws[0]});for(let n=0;n<s.count;n++){const i=n*3;assert.ok(Number.isFinite(s.position[i]+s.position[i+1]+s.position[i+2]));if(!s.inverseMass[n])assert.ok(Math.hypot(...s.offsets.subarray(i,i+3))<1e-6);lag=Math.max(lag,Math.hypot(...s.offsets.subarray(i,i+3)));}}
  assert.ok(lag>.06&&lag<1.2,item.id+': '+lag);
 }
});
test('tailored shading normals follow the smooth surface across rest-field cell boundaries',()=>{
 for(const item of[catalog[2],catalog[5]]){const data=sources[item.type],h=1e-5;
 for(let cell=2;cell<14;cell++){
  const x=-1.35+cell*2.7/15,y=-.45,z=.12,g=new T.BufferGeometry(),points=[x,y,z,x+h,y,z,x-h,y,z,x,y+h,z,x,y-h,z];
  g.setAttribute('position',new T.BufferAttribute(new Float64Array(points),3));g.setAttribute('normal',new T.BufferAttribute(new Float64Array([0,0,1,0,0,1,0,0,1,0,0,1,0,0,1]),3));applyGarmentForm(g,item.form,data);
  const p=g.attributes.position,n=g.attributes.normal,dx=new T.Vector3().fromBufferAttribute(p,1).sub(new T.Vector3().fromBufferAttribute(p,2)),dy=new T.Vector3().fromBufferAttribute(p,3).sub(new T.Vector3().fromBufferAttribute(p,4)),expected=dx.cross(dy).normalize(),actual=new T.Vector3().fromBufferAttribute(n,0);
  assert.ok(expected.distanceTo(actual)<1e-6);assert.ok(new T.Vector3().fromBufferAttribute(n,1).distanceTo(new T.Vector3().fromBufferAttribute(n,2))<.001,'no visible normal seam at a lattice boundary');g.dispose();
 }}
});
