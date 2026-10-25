// Keep complete fixed simulation steps independent of display callbacks.
// Slow frames retain their debt; pausing a hidden tab starts a fresh clock.
export function createFixedStepLoop(step,{dt=1/60,now=()=>performance.now(),schedule=(callback,delay)=>setTimeout(callback,delay),cancel=id=>clearTimeout(id),onError=console.error}={}){
  let active=false,running=false,pending=null,deadline=0,generation=0;
  async function tick(){
    pending=null;if(!active||running)return;
    running=true;const current=generation;
    try{if(await step(dt)===false&&current===generation)active=false;}
    catch(error){active=false;onError(error);}
    finally{
      running=false;
      if(active){if(current!==generation)deadline=now();deadline+=dt*1000;pending=schedule(tick,Math.max(0,deadline-now()));}
    }
  }
  return {
    start(){if(active)return;active=true;generation++;deadline=now();if(!running)pending=schedule(tick,0);},
    stop(){active=false;generation++;if(pending!==null)cancel(pending);pending=null;},
    get active(){return active;},
  };
}
