import test from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{catalog}from'../src/catalog.js';
import{modelConfig}from'../src/model-config.js';
import{hangingDrape}from'../src/garment-drape.js';
import{garmentSimulation}from'../src/garment-form.js';
import{createSurfaceRig}from'../src/surface-rig.js';
import{createFlowReference}from'../src/surface-flow-grid.js';
import{RackHoverMotion}from'../src/rack-hover-motion.js';
import{dihedralAngle}from'../src/surface-bending.js';

test('hanging folds stay shallow, leave the chest clear and have continuous surface derivatives',()=>{
 const patterns=[];
 for(const item of catalog.filter(i=>i.type==='shortSleeve')){
  const sample=hangingDrape(item.form),gradient=new Float64Array(4),trace=[];let maximum=0;
  for(let y=-1.5;y<=.55;y+=.07)for(let x=-1.2;x<=1.2;x+=.06){
   const d=sample(x,y,.12,gradient);maximum=Math.max(maximum,Math.abs(d));
   assert.ok(Math.abs(d)<.065,'fold depth remains below 1.9 cm at model scale');
   const h=1e-6;assert.ok(Math.abs(gradient[1]-(sample(x+h,y,.12)-sample(x-h,y,.12))/(2*h))<1e-6);
   assert.ok(Math.abs(gradient[2]-(sample(x,y+h,.12)-sample(x,y-h,.12))/(2*h))<1e-6);
   if(x>.15&&x<.5&&y>.12)assert.ok(Math.abs(d)<.007,'no collapsed ridge through the chest print');
   if(y>.38)assert.equal(d,0,'the supported shoulder must stay unchanged');
   if(y<-.4)trace.push(d);
  }
  assert.ok(maximum>.02,'retain visible shallow hanging folds');patterns.push(trace);
 }
 for(let a=0;a<patterns.length;a++)for(let b=0;b<a;b++){
  const rms=Math.sqrt(patterns[a].reduce((s,v,i)=>s+(v-patterns[b][i])**2,0)/patterns[a].length);
  assert.ok(rms>.0005,'different cuts must not repeat an identical fold field');
 }
});

test('short cloth changes local fold angles while turning and continues settling after the hanger arrives',t=>{
 const source=JSON.parse(readFileSync(new URL('../public'+modelConfig.shortSleeve.simulation,import.meta.url)));
 for(const item of[catalog[0],catalog[2]]){
  const data=garmentSimulation(source,item),rig=createSurfaceRig(data,item.motion,'fold-response-'+item.id),s=rig.solver,flow=createFlowReference(data),hover=new RackHoverMotion(),carrier=[{yaw:{value:-1.43}}];
  const displayed=new Float64Array(s.rest.length),previous=displayed.slice(),probe=new Float64Array(3);
  const hinges=s.bending.constraints.filter(c=>[c.a,c.b,c.c,c.d].every(n=>s.rest[n*3+1]<.15&&s.rest[n*3+1]>-1.4&&s.rest[n*3+2]>.02));
  assert.ok(hinges.length>100);let peak=0,final=0,freeChange=0,lag=0;
  rig.update(1/60,{y:1.65,yaw:-1.43},false);
  try{for(let frame=0;frame<180;frame++){
   const plan=hover.plan(0,carrier,1/60);carrier[0].yaw.value=plan.yaws[0];rig.update(1/60,{y:1.65,yaw:plan.yaws[0]},false);rig.sync();flow.update(rig.texture.image.data);
   for(let n=0;n<s.count;n++){
    const i=n*3;flow.sample(s.rest[i],s.rest[i+1],s.rest[i+2],probe);
    for(let k=0;k<3;k++)displayed[i+k]=s.rest[i+k]+probe[k];
    if(s.rest[i+1]<-.5){lag=Math.max(lag,Math.hypot(...probe));if(frame>=36&&frame<66)freeChange=Math.max(freeChange,Math.hypot(displayed[i]-previous[i],displayed[i+1]-previous[i+1],displayed[i+2]-previous[i+2]));}
   }
   let sum=0;for(const c of hinges){const angle=dihedralAngle(displayed,c.a,c.b,c.c,c.d),delta=Math.atan2(Math.sin(angle-c.angle),Math.cos(angle-c.angle));sum+=delta*delta;}
   final=Math.sqrt(sum/hinges.length);peak=Math.max(peak,final);previous.set(displayed);
  }
  t.diagnostic(JSON.stringify({id:item.id,peakFoldAngleChange:peak,settledFoldAngleChange:final,lag,freeChange}));
  assert.ok(peak>.015,'a rigidly turning board cannot change its local fold angles');
  assert.ok(final<peak*.35,'dynamic folds must relax after the gesture');
  assert.ok(lag>.06&&freeChange>.001,'the hem must retain inertia and settle freely');
  }finally{rig.dispose();}
 }
});
