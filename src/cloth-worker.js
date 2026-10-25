import {SurfaceCloth} from './surface-physics.js';
import{initializeContactKernel,contactKernelAvailable}from'./contact-kernel.js';

// A worker owns complete solvers, with the same Float64 state and fixed steps
// as the main-thread path. Recycled output buffers cross the thread boundary;
// no particles, constraints, contact passes or material parameters are removed.
export class ClothBatch {
  constructor(entries) {
    this.entries=entries;
    this.solvers=new Map(entries.map(({id,data,profile})=>[id,new SurfaceCloth(data,profile)]));
  }
  warm(){
    const seen=new Set();
    for(const {data,profile} of this.entries){
      if(seen.has(data))continue;seen.add(data);
      // Compile the actual numerical kernels before enabling interaction.
      // Scratch solvers never contribute state or momentum to the scene.
      const solver=new SurfaceCloth(data,profile);
      for(let frame=0;frame<80;frame++){
        const t=frame/60;solver.preciseContacts=frame%20<10;
        solver.step(1/60,{x:.1*Math.sin(t*2),y:1.56+.03*Math.sin(t),z:.1,yaw:-1.43+t,roll:.003*Math.sin(t),pitch:.002*Math.cos(t)});
      }
    }
  }
  step(entries) {
    return entries.map(({id,dt,pose,reduced,preciseContacts,substeps=1,layoutOffset=0,state,patch,output})=>{
      const solver=this.solvers.get(id);
      if(patch)for(const key of['position','previous','velocity','target','local','offsets','normal'])if(patch[key])solver[key].set(patch[key]);
      Object.assign(solver,state);
      solver.preciseContacts=preciseContacts;
      solver.advance(dt,pose,reduced,substeps,layoutOffset);
      const n=solver.position.length;
      output??={world:new Float64Array(n*4),surface:new Float32Array(n*3)};
      for(const [i,key] of ['position','previous','velocity','target'].entries())output.world.set(solver[key],i*n);
      for(const [i,key] of ['local','offsets','normal'].entries())output.surface.set(solver[key],i*n);
      return {id,output,state:{initialized:solver.initialized,asleep:solver.asleep,stillFrames:solver.stillFrames,version:solver.version,layoutVersion:solver.layoutVersion,phase:solver.phase,lastPose:solver.lastPose}};
    });
  }
}

if(typeof self!=='undefined'&&typeof document==='undefined'){
  let batch;
  self.onmessage=async({data})=>{
    try{
      if(data.type==='init'){await initializeContactKernel();batch=new ClothBatch(data.entries);batch.warm();self.postMessage({type:'ready',compiled:contactKernelAvailable()});}
      else{
        const started=performance.now();
        const entries=batch.step(data.entries);
        self.postMessage({type:'result',entries,duration:performance.now()-started},entries.flatMap(e=>[e.output.world.buffer,e.output.surface.buffer]));
      }
    }catch(error){self.postMessage({type:'error',message:error.message});}
  };
}
