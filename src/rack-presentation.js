import{garmentRackX}from'./rack-layout.js';

const SIDE=-1.43,EPS=1/1024;
export const circularDifference=(target,current)=>Math.atan2(Math.sin(target-current),Math.cos(target-current));
export function presentationYaw(rack,inspected,focus,current){
  return current+circularDifference(rack,current)*(1-focus)+circularDifference(inspected,current)*focus;
}
const parked=m=>Math.abs(circularDifference(SIDE,m.yaw.value))<.06&&Math.abs(m.yaw.velocity)<.35;

// A new rack selection must not become the owner of an inspection that is
// still returning. Keep its gap until the wide hanger has actually parked.
export class RackPresentation{
  constructor(active){this.owner=active;this.turned=false;this.choice=null;this.mode='rack';this.returning=false;}
  setState(state){
    if(state.mode==='focus'){this.owner=state.active;this.turned=state.turned;this.choice=state.active;this.returning=false;}
    else if(this.mode==='focus')this.returning=true;
    this.mode=state.mode;
  }
  plan(state,focus,mobile,motions){
    const desired=state.mode==='focus'?this.owner:(state.hovered??(mobile?state.active:null));
    let ready=true;
    if(this.returning){
      for(let i=0;i<motions.length;i++)if(i!==this.owner){
        if(!parked(motions[i])||Math.abs(motions[i].x.value-garmentRackX(i,motions.length,this.choice))>.025){ready=false;break;}
      }
      if(ready)this.returning=false;
    }
    if(this.choice!==desired&&!this.returning){
      if(this.choice==null||(focus<.05&&parked(motions[this.choice])))this.choice=desired;
    }
    return{
      chosen:this.choice,
      opening:state.mode==='focus'?this.owner:(this.choice===desired?this.choice:null),
      focusTarget:state.mode==='focus'||(this.returning&&!ready)?1:0,
    };
  }
  viewIndex(active,focus){return this.mode==='focus'||focus>EPS?this.owner:active;}
}
