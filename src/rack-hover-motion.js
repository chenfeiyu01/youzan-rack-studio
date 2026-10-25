import{garmentRackX}from'./rack-layout.js';

export const HOVER_DURATION=.52;
export const hoverRackX=(index,count,choice=null)=>garmentRackX(index,count)+(choice==null?0:Math.sign(index-choice)*1.1);
const SIDE=-1.43,FRONT=-.03,folded=Math.cos(SIDE),open=Math.cos(FRONT);
const clamp=value=>Math.max(0,Math.min(1,value));
export const hoverWidth=yaw=>clamp((Math.cos(yaw)-folded)/(open-folded));
const yawAt=width=>width<=0?SIDE:width>=1?FRONT:-Math.acos(folded+(open-folded)*width);
// A short, smooth acceleration at each end leaves most of the gesture at
// steady speed. The hanger reaches front promptly without a late speed spike.
function ease(t){const ramp=.18;if(t>1-ramp)return 1-ease(1-t);if(t>=ramp)return(t-ramp/2)/(1-ramp);const u=t/ramp;return ramp*(u*u*u-.5*u*u*u*u)/(1-ramp);}

// One guided carrier gesture shares one opening. Cloth is never driven with
// these angles: only its supported top follows, leaving full world inertia.
export class RackHoverMotion{
 constructor(){this.reset();}
 reset(){this.choice=undefined;this.from=[];this.elapsed=HOVER_DURATION;}
 plan(choice,motions,dt,reduced=false){
  if(this.choice===undefined){this.choice=null;this.from=motions.map(m=>hoverWidth(m.yaw.value));const sum=this.from.reduce((a,b)=>a+b,0);if(sum>1)this.from=this.from.map(v=>v/sum);}
  if(choice!==this.choice){
   this.from=motions.map(m=>hoverWidth(m.yaw.value));const sum=this.from.reduce((a,b)=>a+b,0);if(sum>1)this.from=this.from.map(v=>v/sum);
   this.choice=choice;this.elapsed=0;
  }
  this.elapsed=reduced?HOVER_DURATION:Math.min(HOVER_DURATION,this.elapsed+Math.max(0,dt));
  const progress=this.elapsed/HOVER_DURATION,t=hoverWidth(SIDE+(FRONT-SIDE)*ease(progress)),space=this.from.map((width,index)=>width*(1-t)+(choice===index?t:0));
  const positions=motions.map((_,index)=>garmentRackX(index,motions.length)+space.reduce((sum,width,slot)=>sum+Math.sign(index-slot)*1.1*width,0));
  const yaws=space.map(yawAt),outgoing=space.flatMap((width,index)=>index!==choice&&width>0?[index]:[]);
  return{chosen:choice,opening:choice,positions,space,yaws,outgoing,drive:true,hover:true,progress,substeps:1};
 }
}
