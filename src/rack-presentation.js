import{garmentRackX,garmentRackPositions}from'./rack-layout.js';
import{RackHoverMotion}from'./rack-hover-motion.js';

const SIDE=-1.43,FRONT=-.03,EPS=1/1024;
export const circularDifference=(target,current)=>Math.atan2(Math.sin(target-current),Math.cos(target-current));
export function presentationYaw(rack,inspected,focus,current){
  return current+circularDifference(rack,current)*(1-focus)+circularDifference(inspected,current)*focus;
}
const parked=m=>Math.abs(circularDifference(SIDE,m.yaw.value))<.06&&Math.abs(m.yaw.velocity)<.35;

// Match the available lateral width to the outgoing garment's actual turn.
// The parked tolerance has zero weight, so retiring an outgoing item is smooth.
const foldedWidth=Math.cos(SIDE+.06),openWidth=Math.cos(FRONT);
export const rackOpenFraction=yaw=>Math.max(0,Math.min(1,(Math.cos(yaw)-foldedWidth)/(openWidth-foldedWidth)));
export const rackOpenYaw=fraction=>fraction>=1?FRONT:fraction<=0?SIDE:-Math.acos(foldedWidth+(openWidth-foldedWidth)*fraction);

// Hover pickup starts immediately, while one shared gap passes from the closing
// garment to the incoming one. Inspection return retains its guided handoff.
export class RackPresentation{
  constructor(active){this.hoverMotion=new RackHoverMotion();this.owner=active;this.turned=false;this.choice=null;this.mode='rack';this.returning=false;this.outgoing=new Set();this.inspectionHandoff=false;}
  setState(state){
    if(state.mode==='focus'){this.hoverMotion.reset();this.owner=state.active;this.turned=state.turned;this.choice=state.active;this.returning=false;this.outgoing.clear();this.inspectionHandoff=false;}
    else if(this.mode==='focus'){this.returning=true;this.inspectionHandoff=true;}
    this.mode=state.mode;
  }
  plan(state,focus,mobile,motions,placements=[],dt=1/60,reduced=false){
    const desired=state.mode==='focus'?this.owner:(state.hovered??(mobile?state.active:null));
    let ready=true;
    if(this.returning){
      for(let i=0;i<motions.length;i++)if(i!==this.owner){
        if(!parked(motions[i])||Math.abs(motions[i].x.value-garmentRackX(i,motions.length,this.choice))>.025){ready=false;break;}
      }
      if(ready)this.returning=false;
    }
    const ownerReady=desired===this.owner?Math.abs(circularDifference(FRONT,motions[this.owner].yaw.value))<.03&&Math.abs(motions[this.owner].yaw.velocity)<.15:parked(motions[this.owner]);
    if(this.inspectionHandoff&&focus<.05&&ownerReady)this.inspectionHandoff=false;
    if(state.mode==='rack'&&focus<.05&&!this.returning&&!this.inspectionHandoff){
      const hover=this.hoverMotion.plan(desired,motions,dt,reduced);this.choice=hover.chosen;this.outgoing=new Set(hover.outgoing);
      return{...hover,openingYaw:FRONT,returnYaws:motions.map(()=>SIDE),focusTarget:0};
    }
    if(this.choice!==desired&&!this.returning&&!this.inspectionHandoff){
      if(this.choice==null||focus<.05){
        if(this.choice!=null&&!parked(motions[this.choice]))this.outgoing.add(this.choice);
        this.choice=desired;
      }
    }
    for(const index of this.outgoing)if(index===this.choice||parked(motions[index]))this.outgoing.delete(index);
    const outgoing=[...this.outgoing],space=new Array(motions.length).fill(0);
    let openingYaw=FRONT;
    if(state.mode==='focus'||this.returning||this.inspectionHandoff){if(this.choice!=null)space[this.choice]=1;}
    else{
      const widths=outgoing.map(index=>rackOpenFraction(motions[index].yaw.value)),total=widths.reduce((sum,width)=>sum+width,0);
      for(let i=0;i<outgoing.length;i++)space[outgoing[i]]=widths[i]/Math.max(1,total);
      const available=Math.max(0,1-total);
      if(this.choice!=null)space[this.choice]=available;
      openingYaw=rackOpenYaw(available);
    }
    // The incoming hook must clear the rail before it can turn. During that
    // pickup, close the outgoing item only halfway; finish both turns together.
    const receiving=this.choice!=null&&placements[this.choice]&&placements[this.choice].phase!=='free';
    const returnYaws=motions.map((motion,index)=>receiving&&this.outgoing.has(index)?SIDE+Math.max(0,Math.min(circularDifference(motion.yaw.value,SIDE),rackOpenYaw(.5)-SIDE)):SIDE);
    return{
      chosen:this.choice,
      opening:state.mode==='focus'?this.owner:(this.choice===desired?this.choice:null),
      outgoing,space,openingYaw,returnYaws,
      positions:garmentRackPositions(motions.length,space),
      focusTarget:state.mode==='focus'||(this.returning&&!ready)?1:0,
    };
  }
  viewIndex(active,focus){return this.mode==='focus'||focus>EPS?this.owner:active;}
}
