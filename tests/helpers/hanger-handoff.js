import{modelConfig}from'../../src/model-config.js';
import{rackClearanceYaw}from'../../src/rack-clearance.js';
import{readFileSync}from'node:fs';import{createSurfaceRig}from'../../src/surface-rig.js';import{HangingMotion}from'../../src/physics.js';import{HangerPlacement,seatGeometry,rigidHangerData}from'../../src/hanger-placement.js';import{createHangerSwivel}from'../../src/hanger-swivel.js';import{GarmentContacts}from'../../src/garment-contacts.js';import{garmentRackX,garmentFocusPose}from'../../src/rack-layout.js';import{RackPresentation,presentationYaw}from'../../src/rack-presentation.js';import{catalog}from'../../src/catalog.js';import{hangerFixtures,RailAudit}from'./hanger-fixtures.js';
export async function replayHangerScene({frames=900,onFrame,stateAtFrame,measureFrom=300}={}){
 const data={};for(const[type,config]of Object.entries(modelConfig))data[type]=JSON.parse(readFileSync(new URL('../../public'+config.simulation,import.meta.url)));
 const fixtures=await hangerFixtures(),all=catalog.map((item,index)=>{
  const fixture=fixtures[item.type==='longSleeve'?'long':'short'],root=fixture.root.clone(true),fit=seatGeometry(fixture.data),motion=new HangingMotion(garmentRackX(index,10),-1.43,item.type==='longSleeve',item.motion);motion.y.snap(fit.restY);
  const swivel=createHangerSwivel(root,motion);root.remove(swivel.hookGroup);const bodyAudit=new RailAudit(rigidHangerData(root));root.add(swivel.hookGroup);const hookAudit=new RailAudit(rigidHangerData(swivel.hookGroup));
  return{index,item,root,motion,swivel,bodyAudit,hookAudit,placement:new HangerPlacement(fit),inspectionZoom:1,rig:createSurfaceRig(data[item.type],item.motion,'hanger-live-'+index,{flow:true})};
 }),presentation=new RackPresentation(9),contacts=new GarmentContacts(),motors=all.map(p=>p.motion),metrics={hangerChecks:0,hangerPenetrations:0,minGap:Infinity,maxOffset:0,maxStrain:0,finalOffset:0,finalStrain:0,contacts:0,phases:{}};let focus=0,state={};
 try{for(let frame=0;frame<frames;frame++){
  const active=frame<302?9:frame<304?8:frame<306?7:6,mode=frame>=120&&frame<300?'focus':'rack',next=stateAtFrame?.(frame)??{active,hovered:mode==='rack'?active:null,mode,turned:frame>=180&&frame<300};
  if(JSON.stringify(next)!==JSON.stringify(state)){state=next;presentation.setState(state);}
  const view=presentation.plan(state,focus,false,motors,all.map(p=>p.placement),1/60);focus+=(view.focusTarget-focus)*(1-Math.exp(-9/60));
  const plans=all.map(p=>{
   const selected=p.index===presentation.owner,pose=garmentFocusPose(selected,view.chosen===p.index,focus,1.28,p.placement.restY),wanted=state.mode==='focus'?selected:view.opening===p.index;
   p.inspectionZoom+=(p.placement.scaleTarget(wanted?pose.scale:1,p.motion)-p.inspectionZoom)*(1-Math.exp(-9/60));
   return{...p,solver:p.rig.solver,opacity:selected?1:1-focus,targetX:view.positions[p.index],targetY:pose.y,targetZ:pose.z,rotation:view.hover?view.yaws[p.index]:presentationYaw(view.opening===p.index?-.03:-1.43,selected?(presentation.turned?Math.PI:0):-1.43,focus,p.motion.yaw.value),wanted,precise:state.mode==='focus'?selected:view.chosen===p.index||view.outgoing.includes(p.index)||p.placement.phase!=='seated'};
  });
  const rack=state.mode==='rack'&&focus<.05,participating=plans.filter(p=>p.opacity>.8),poses=[],clearance=view.hover&&view.opening!=null?view.yaws[view.opening]:rack&&view.opening!=null?rackClearanceYaw(plans[view.opening],participating,view.openingYaw):-.03;
  for(const p of plans){
   const m=p.motion,previousX=m.x.value,c=p.placement.plan(p.swivel.hookMotion,{wanted:state.mode==='focus'&&p.index===presentation.owner,y:p.targetY,z:p.targetZ,yaw:-1.43},p.inspectionZoom);
   if(c.pin)p.inspectionZoom=1;all[p.index].inspectionZoom=p.inspectionZoom;
   m.step(p.targetX,c.z,view.hover&&p.index===view.opening?clearance:p.rotation,1/60,false,c.y,view.hover,view.drive);p.placement.finish(p.swivel.hookMotion,c);
   const anchor={x:m.x.value,y:m.y.value,z:m.z.value,yaw:m.yaw.value,roll:m.roll.value,pitch:m.pitch.value,scale:1},pose=p.swivel.bodyPose(anchor);poses.push(pose);
   for(const hit of[p.bodyAudit.inspect(pose),p.hookAudit.inspect({...anchor,yaw:-1.43,roll:0,pitch:0})]){metrics.hangerPenetrations+=hit.count;metrics.minGap=Math.min(metrics.minGap,hit.minGap);}metrics.hangerChecks++;
   metrics.phases[p.placement.phase]=(metrics.phases[p.placement.phase]??0)+1;if(p.opacity>.015)p.rig.update(1/60,pose,false,p.precise,view.substeps??1,view.hover?m.x.value-previousX:0);
  }
  if(rack)metrics.contacts+=contacts.step(participating.map(p=>p.solver));metrics.finalOffset=metrics.finalStrain=0;
  for(const p of plans){
   if(p.opacity>.015)p.rig.sync();else p.rig.suspend();if(frame<measureFrom||p.opacity<.8)continue;const s=p.solver;
   for(let i=0;i<s.position.length;i+=3){const d=Math.hypot(s.position[i]-s.target[i],s.position[i+1]-s.target[i+1],s.position[i+2]-s.target[i+2]);if(d>metrics.maxOffset){metrics.maxOffset=d;metrics.maxOffsetAt={frame,index:p.index};}metrics.finalOffset=Math.max(metrics.finalOffset,d);}
   for(const c of s.constraints){if(c.length<.04)continue;const i=c.a*3,j=c.b*3,ratio=Math.hypot(s.position[i]-s.position[j],s.position[i+1]-s.position[j+1],s.position[i+2]-s.position[j+2])/c.length;if(ratio>metrics.maxStrain){metrics.maxStrain=ratio;metrics.maxStrainAt={frame,index:p.index};}metrics.finalStrain=Math.max(metrics.finalStrain,ratio);}
  }
  onFrame?.({frame,poses,inspectionZoom:all.map(p=>p.inspectionZoom),plans,focus,view,presentation});
 }
 metrics.owner=presentation.owner;metrics.choice=presentation.choice;metrics.returning=presentation.returning;metrics.finalPhases=all.map(p=>p.placement.phase);return metrics;
 }finally{for(const p of all)p.rig.dispose();}
}
