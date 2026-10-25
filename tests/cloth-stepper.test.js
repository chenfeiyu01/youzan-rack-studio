import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {createClothStepper} from '../src/cloth-stepper.js';
import {createSurfaceRig} from '../src/surface-rig.js';
import {HangingMotion} from '../src/physics.js';
import {GarmentContacts} from '../src/garment-contacts.js';
import {garmentRackX} from '../src/rack-layout.js';
import {catalog} from '../src/catalog.js';
import{modelConfig}from'../src/model-config.js';
import{garmentSimulation}from'../src/garment-form.js';

function workerFactory(){
  const url=new URL('../src/cloth-worker.js',import.meta.url).href,kernel=new URL('../src/contact-kernel.js',import.meta.url).href,binary=new URL('../src/contact-kernel.wasm',import.meta.url).pathname;
  const worker=new Worker(`const {parentPort}=require('node:worker_threads');import(${JSON.stringify(url)}).then(async({ClothBatch})=>{const {initializeContactKernel}=await import(${JSON.stringify(kernel)});await initializeContactKernel(require('node:fs').readFileSync(${JSON.stringify(binary)}));let batch;parentPort.on('message',data=>{try{if(data.type==='init'){batch=new ClothBatch(data.entries);batch.warm();parentPort.postMessage({type:'ready',compiled:true});}else{const entries=batch.step(data.entries);parentPort.postMessage({type:'result',entries},entries.flatMap(e=>[e.output.world.buffer,e.output.surface.buffer]));}}catch(e){parentPort.postMessage({type:'error',message:e.message});}});});`,{eval:true});
  const adapter={postMessage:(...args)=>worker.postMessage(...args),terminate:()=>worker.terminate()};
  worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',error=>adapter.onerror?.(error));
  return adapter;
}
const data=Object.fromEntries([['shortSleeve','short-sleeve-gravity'],['longSleeve','hanging-long-sleeve']].map(([type,file])=>[type,JSON.parse(readFileSync(new URL('../public/models/'+file+'-simulation.json',import.meta.url)))]));
const fields=['position','previous','velocity','target','local','offsets','normal'];

for(const workerCount of[4,8])test(`${workerCount} workers keep neighbouring current garments parallel during hover handoff`,async()=>{
 const sources=Object.fromEntries(Object.entries(modelConfig).map(([type,c])=>[type,JSON.parse(readFileSync(new URL('../public'+c.simulation,import.meta.url)))]));
 const rigs=catalog.map(item=>createSurfaceRig(garmentSimulation(sources[item.type],item),item.motion,item.id)),groups=[];
 const factory=()=>{const worker={postMessage(message){assert.equal(message.type,'init');groups.push(message.entries.map(e=>e.id));queueMicrotask(()=>worker.onmessage({data:{type:'ready',compiled:true}}));},terminate(){}};return worker;};
 const stepper=await createClothStepper(rigs,{workerCount,workerFactory:factory});
 try{
  const owners=new Map();for(let group=0;group<groups.length;group++)for(const id of groups[group]){assert.ok(!owners.has(id));owners.set(id,group);}
  assert.equal(owners.size,catalog.length);
  for(let id=0;id<catalog.length;id++)assert.notEqual(owners.get(id),owners.get((id+1)%catalog.length),`adjacent garments ${id} must not serialize`);
  if(workerCount===8)for(let id=0;id<catalog.length;id++)if(catalog[id].type==='longSleeve')assert.deepEqual(groups[owners.get(id)],[id],'heavy folded cloth must not queue behind another moving garment');
 }finally{stepper.dispose();rigs.forEach(rig=>rig.dispose());}
});

for(const workerCount of[4,8])test(`${workerCount} real worker threads preserve all ten cloth trajectories byte for byte through switching, contacts and resets`,async()=>{
  const make=()=>catalog.map((item,i)=>({rig:createSurfaceRig(data[item.type],item.motion,item.type),motion:new HangingMotion(garmentRackX(i,10),-1.43,item.type==='longSleeve',item.motion)}));
  const parallel=make(),serial=make(),warnings=[];
  const stepper=await createClothStepper(parallel.map(p=>p.rig),{workerCount,workerFactory,onWarning:message=>warnings.push(message)});
  const contacts=[new GarmentContacts(),new GarmentContacts()];
  try{
    assert.equal(stepper.workerCount,workerCount);assert.equal(stepper.contactKernel,'wasm');
    for(let frame=0;frame<100;frame++){
      const chosen=[7,4,0,5][Math.floor(frame/25)],reduced=frame===80;
      const plans=[parallel,serial].map(all=>all.map((p,i)=>{
        const m=p.motion,previous={x:m.x.value,y:m.y.value,z:m.z.value,yaw:m.yaw.value};m.step(garmentRackX(i,10,chosen),chosen===i?.15:0,chosen===i?-.03:-1.43,1/60,reduced);
        return{rig:p.rig,pose:{x:m.x.value,y:m.y.value,z:m.z.value,yaw:m.yaw.value,roll:m.roll.value,pitch:m.pitch.value},opacity:frame>=60&&frame<65&&i!==chosen?0:1,preciseContacts:i===chosen,substeps:frame>=25&&frame<50?2:1,layoutOffset:frame>=25&&frame<50?m.x.value-previous.x:0};
      }));
      await stepper.step(plans[0],1/60,reduced);
      for(const p of plans[1])if(p.opacity>.015)p.rig.update(1/60,p.pose,reduced,p.preciseContacts,p.substeps,p.layoutOffset);
      for(let group=0;group<2;group++){
        const all=group?serial:parallel;contacts[group].step(all.map(p=>p.rig.solver));
        // Simulate a cross-garment correction from the main-thread contact
        // phase; the next worker step must consume its positions and momentum.
        if(frame===35){const s=all[chosen].rig.solver;for(let n=0;n<s.count;n++)if(s.inverseMass[n]){s.position[n*3]+=.0002;s.velocity[n*3+2]-=.001;}s.asleep=false;s.stillFrames=0;s.version++;s.updateLocal();}
        for(let i=0;i<all.length;i++){if(plans[group][i].opacity>.015)all[i].rig.sync();else all[i].rig.suspend();}
      }
      for(let i=0;i<10;i++){
        const a=parallel[i].rig.solver,b=serial[i].rig.solver;
        for(const field of fields)assert.deepEqual(a[field],b[field],`${frame}/${i}/${field}`);
        for(const key of ['asleep','initialized','stillFrames','phase','version','layoutVersion'])assert.equal(a[key],b[key],`${frame}/${i}/${key}`);
        assert.deepEqual(parallel[i].rig.texture.image.data,serial[i].rig.texture.image.data,`${frame}/${i}/display`);
      }
    }
    assert.deepEqual(warnings,[]);
  }finally{stepper.dispose();for(const p of [...parallel,...serial])p.rig.dispose();}
});

test('an unavailable worker retains the complete synchronous solver',async()=>{
  const a=createSurfaceRig(data.shortSleeve,catalog[0].motion,'fallback'),b=createSurfaceRig(data.shortSleeve,catalog[0].motion,'fallback'),warnings=[];
  const stepper=await createClothStepper([a],{workerCount:2,workerFactory:()=>{throw new Error('unavailable');},onWarning:message=>warnings.push(message)});
  try{
    for(let frame=0;frame<4;frame++){const pose={x:frame*.03,yaw:frame*.1};await stepper.step([{rig:a,pose,opacity:1,preciseContacts:true}],1/60,false);b.update(1/60,pose,false,true);assert.deepEqual(a.solver.position,b.solver.position);}
    assert.equal(stepper.workerCount,0);assert.deepEqual(warnings,['unavailable']);
  }finally{stepper.dispose();a.dispose();b.dispose();}
});

test('a failed batch commits no partial state and resumes the exact full local step',async()=>{
  const make=()=>catalog.slice(0,2).map(item=>createSurfaceRig(data.shortSleeve,item.motion,item.id));
  const a=make(),b=make(),warnings=[];let fail=false;
  const factory=()=>{const worker=workerFactory(),post=worker.postMessage;worker.postMessage=(message,...args)=>{if(fail&&message.type==='step'){fail=false;throw new Error('test batch failure');}post(message,...args);};return worker;};
  const stepper=await createClothStepper(a,{workerCount:2,workerFactory:factory,onWarning:message=>warnings.push(message)});
  try{
    for(let frame=0;frame<6;frame++){
      if(frame===2)fail=true;
      const pose={x:frame*.04,yaw:-1.43+frame*.08};
      await stepper.step(a.map(rig=>({rig,pose,opacity:1,preciseContacts:true})),1/60,false);
      b.forEach(rig=>rig.update(1/60,pose,false,true));
      for(let i=0;i<a.length;i++)for(const field of fields)assert.deepEqual(a[i].solver[field],b[i].solver[field],`${frame}/${i}/${field}`);
    }
    assert.equal(stepper.workerCount,0);assert.deepEqual(warnings,['test batch failure']);
  }finally{stepper.dispose();for(const rig of [...a,...b])rig.dispose();}
});

test('sleeping rigs avoid IPC yet preserve exact state through drift, layout shifts, contact wakes and visibility resets',async()=>{
 const make=()=>[0,1].map(i=>createSurfaceRig(data.shortSleeve,catalog[i].motion,'sleep-'+i));
 const a=make(),b=make(),sent=[];const pose={x:0,y:1.65,z:0,yaw:-1.43};
 for(const rig of[...a,...b])rig.update(1/60,pose,false,true);
 const factory=()=>{const worker=workerFactory(),post=worker.postMessage;worker.postMessage=(message,...args)=>{if(message.type==='step')sent.push(message.entries.length);return post(message,...args);};return worker;};
 const stepper=await createClothStepper(a,{workerCount:2,workerFactory:factory});
 try{
  for(let frame=0;frame<42;frame++){
   const layoutOffset=frame===10?.5:0;
   const x=frame<10?frame*1e-7:frame<25?.5+(frame-10)*1e-7:.5;
   const target={...pose,x},reduced=frame===38,hidden=frame===35;
   if(frame===30)for(const rig of[a[0],b[0]]){const s=rig.solver;for(let n=0;n<s.count;n++)if(s.inverseMass[n]){s.position[n*3]+=.0002;s.velocity[n*3+2]-=.01;}s.asleep=false;s.stillFrames=0;s.version++;s.updateLocal();}
   await stepper.step(a.map(rig=>({rig,pose:target,opacity:hidden?0:1,preciseContacts:true,substeps:frame%2+1,layoutOffset})),1/60,reduced);
   for(const rig of b)if(!hidden)rig.update(1/60,target,reduced,true,frame%2+1,layoutOffset);
   if(hidden)for(const rig of[...a,...b])rig.suspend();
   for(let i=0;i<a.length;i++){for(const field of fields)assert.deepEqual(a[i].solver[field],b[i].solver[field],`${frame}/${i}/${field}`);assert.deepEqual(a[i].solver.lastPose,b[i].solver.lastPose);for(const key of['version','layoutVersion','phase','stillFrames','asleep','initialized'])assert.equal(a[i].solver[key],b[i].solver[key],`${frame}/${i}/${key}`);}
   if(frame<25){assert.equal(stepper.lastSent,0);assert.equal(stepper.lastSleeping,2);assert.equal(sent.length,0,'no worker requests for unchanged sleeping state');}
  }
  assert.ok(sent.length>0,'real work resumes for wakes and reduced-motion resets');
 }finally{stepper.dispose();for(const rig of[...a,...b])rig.dispose();}
});
