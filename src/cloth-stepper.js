import{initializeContactKernel,contactKernelAvailable}from'./contact-kernel.js';

function localStep(plans,dt,reduced){
  for(const p of plans)if(p.opacity>.015)p.rig.update(dt,p.pose,reduced,p.preciseContacts,p.substeps,p.layoutOffset);
}

const poseKeys=['x','y','z','yaw','roll','pitch','scale'],poseDefaults=[0,1.56,0,0,0,0,1];
function sleepingUnchanged(plan,reduced){
  const s=plan.rig.solver;if(reduced||!s.initialized||!s.asleep||!s.lastPose)return false;
  const layout=plan.layoutOffset??0;
  return poseKeys.every((key,i)=>Math.abs((plan.pose[key]??poseDefaults[i])-(s.lastPose[i]+(i===0?layout:0)))<=1e-6);
}

function endpoint(worker){
  let pending=null,failed=null;
  const fail=error=>{failed=error;pending?.reject(error);pending=null;};
  worker.onmessage=({data})=>{
    if(data.type==='error'){fail(new Error(data.message));return;}
    const request=pending;pending=null;request?.resolve(data);
  };
  worker.onerror=event=>{event.preventDefault?.();fail(new Error(event.message||'Cloth worker failed'));};
  worker.onmessageerror=()=>fail(new Error('Cloth worker message could not be read'));
  return {
    request(data,transfer=[]){
      if(failed)return Promise.reject(failed);
      return new Promise((resolve,reject)=>{pending={resolve,reject};try{worker.postMessage(data,transfer);}catch(error){fail(error);}});
    },
    dispose(){fail(new Error('Cloth worker disposed'));worker.terminate();},
  };
}

export async function createClothStepper(rigs,{workerCount=Math.min(8,Math.max(1,(globalThis.navigator?.hardwareConcurrency??4)-2)),workerFactory=()=>new Worker(new URL('./cloth-worker.js',import.meta.url),{type:'module'}),onWarning=()=>{}}={}){
  await initializeContactKernel();
  const groups=[],records=new Map();let disposed=false,parallel=workerCount>1,lastWorkerMs=0,lastSent=0,lastSleeping=0;
  const stop=()=>{for(const group of groups)group.endpoint.dispose();parallel=false;};
  if(parallel){
    try{
      for(let i=0;i<Math.min(workerCount,rigs.length);i++)groups.push({endpoint:endpoint(workerFactory()),entries:[],cost:0});
      // Folded long sleeves regularly use the complete contact-refinement
      // passes despite having fewer triangles than a short sleeve. Counting
      // topology alone put the white long sleeve and its incoming neighbour
      // on one worker, serializing both sides of that hover transition.
      const weighted=rigs.map((rig,id)=>({rig,id,cost:(rig.solver.count+3*rig.solver.strain.constraints.length+rig.solver.bending.constraints.length)*(rig.simulationData.type==='longSleeve'?2:1)})).sort((a,b)=>b.cost-a.cost);
      for(const {rig,id,cost} of weighted){
        // Neighbours are the most common simultaneously active pair, including
        // the first/last keyboard wrap. Keep them apart whenever a group fits.
        const independent=groups.filter(g=>g.entries.every(e=>{const distance=Math.abs(e.id-id);return distance!==1&&distance!==rigs.length-1;}));
        const group=(independent.length?independent:groups).reduce((a,b)=>a.cost<=b.cost?a:b);group.cost+=cost;
        const record={id,rig,version:-1,localSleep:false,output:null,group};records.set(rig,record);
        group.entries.push({id,data:rig.simulationData,profile:rig.solver.profile});
      }
      await Promise.all(groups.map(async g=>{const ready=await g.endpoint.request({type:'init',entries:g.entries});g.compiled=Boolean(ready.compiled);}));
    }catch(error){stop();onWarning(error.message);}
  }
  return {
    get workerCount(){return parallel?groups.length:0;},
    get contactKernel(){return parallel?(groups.every(g=>g.compiled)?'wasm':'javascript'):contactKernelAvailable()?'wasm':'javascript';},
    get workerMs(){return lastWorkerMs;},
    get lastSent(){return lastSent;},
    get lastSleeping(){return lastSleeping;},
    async step(plans,dt,reduced){
      if(disposed)return;
      if(!parallel){lastSent=lastSleeping=0;lastWorkerMs=0;localStep(plans,dt,reduced);return;}
      lastSent=lastSleeping=0;
      const batches=new Map(groups.map(group=>[group,[]]));
      for(const p of plans){
        if(p.opacity<=.015)continue;
        // This is the solver's exact sleeping fast path, including small pose
        // changes and layout-origin shifts. Keep previous/lastPose current for
        // inter-garment CCD and a subsequent wake, without worker IPC or copies.
        const record=records.get(p.rig),s=p.rig.solver;
        if(sleepingUnchanged(p,reduced)){p.rig.update(dt,p.pose,reduced,p.preciseContacts,p.substeps,p.layoutOffset);record.localSleep=true;lastSleeping++;continue;}
        lastSent++;
        const fullState=s.initialized&&(record.localSleep||record.version<0);
        const patch=fullState?Object.fromEntries(['position','previous','velocity','target','local','offsets','normal'].map(key=>[key,s[key]])):record.version!==s.version?{position:s.position,velocity:s.velocity}:null;
        batches.get(record.group).push({id:record.id,dt,pose:p.pose,reduced,preciseContacts:p.preciseContacts,substeps:p.substeps,layoutOffset:p.layoutOffset,patch,output:record.output,state:{initialized:s.initialized,asleep:s.asleep,stillFrames:s.stillFrames,version:s.version,layoutVersion:s.layoutVersion,phase:s.phase,lastPose:s.lastPose}});
      }
      try{
        // Commit only after every batch succeeds. If a worker fails, the full
        // original step can still run from the unchanged main-thread state.
        const results=await Promise.all([...batches].filter(([,entries])=>entries.length).map(([group,entries])=>group.endpoint.request({type:'step',entries},entries.flatMap(e=>e.output?[e.output.world.buffer,e.output.surface.buffer]:[]))));
        lastWorkerMs=Math.max(...results.map(result=>result.duration??0),0);
        if(disposed)return;
        const byId=new Map([...records.values()].map(record=>[record.id,record]));
        for(const result of results)for(const entry of result.entries){
          const record=byId.get(entry.id),solver=record.rig.solver,n=solver.position.length;
          for(const [i,key] of ['position','previous','velocity','target'].entries())solver[key].set(entry.output.world.subarray(i*n,(i+1)*n));
          for(const [i,key] of ['local','offsets','normal'].entries())solver[key].set(entry.output.surface.subarray(i*n,(i+1)*n));
          Object.assign(solver,entry.state);record.version=solver.version;record.localSleep=false;record.output=entry.output;
        }
      }catch(error){if(disposed)return;stop();onWarning(error.message);localStep(plans,dt,reduced);}
    },
    dispose(){disposed=true;stop();},
  };
}
