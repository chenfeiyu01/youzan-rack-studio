import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{createSurfaceRig}from'../src/surface-rig.js';import{HangingMotion}from'../src/physics.js';
import{GarmentContacts}from'../src/garment-contacts.js';import{rackClearanceYaw}from'../src/rack-clearance.js';
import{garmentRackX,garmentFocusPose}from'../src/rack-layout.js';import{RackPresentation,presentationYaw}from'../src/rack-presentation.js';import{catalog}from'../src/catalog.js';import{modelConfig}from'../src/model-config.js';

test('rapid cross-rack selection during return keeps the real garments bounded and settles',()=>{
 const data={};for(const[type,config]of Object.entries(modelConfig))data[type]=JSON.parse(readFileSync(new URL('../public'+config.simulation,import.meta.url)));
 const all=catalog.map((item,index)=>({index,rig:createSurfaceRig(data[item.type],item.motion,item.type),motion:new HangingMotion(garmentRackX(index,10),-1.43,item.type==='longSleeve',item.motion)}));
 const presentation=new RackPresentation(9),contacts=new GarmentContacts(),motors=all.map(p=>p.motion);let focus=0,state={},lastOffset=0,lastStrain=0;
 try{
  for(let frame=0;frame<600;frame++){
   const active=frame<302?9:frame<304?8:frame<306?7:6,mode=frame>=120&&frame<300?'focus':'rack',next={active,hovered:mode==='rack'?active:null,mode,turned:frame>=180&&frame<300};
   if(JSON.stringify(next)!==JSON.stringify(state)){state=next;presentation.setState(state);}
   const view=presentation.plan(state,focus,false,motors);focus+=(view.focusTarget-focus)*(1-Math.exp(-9/60));
   const plans=all.map(p=>{const selected=p.index===presentation.owner,rackYaw=view.hover?view.yaws[p.index]:view.opening===p.index?-.03:-1.43,inspected=selected?(presentation.turned?Math.PI:0):-1.43;
    const pose=garmentFocusPose(selected,view.chosen===p.index,focus,1.28);
    return{...p,solver:p.rig.solver,opacity:selected?1:1-focus,targetX:view.positions[p.index],targetY:pose.y,targetZ:pose.z,rotation:presentationYaw(rackYaw,inspected,focus,p.motion.yaw.value),precise:mode==='focus'?selected:view.chosen===p.index||view.outgoing.includes(p.index)};});
   const rack=mode==='rack'&&focus<.05,participating=plans.filter(p=>p.opacity>.8),yaw=view.hover&&view.opening!=null?view.yaws[view.opening]:rack&&view.opening!=null?rackClearanceYaw(plans[view.opening],participating,view.openingYaw):-.03;
   for(const p of plans){const m=p.motion,previousX=m.x.value,targetYaw=rack&&p.index===view.opening?presentationYaw(yaw,yaw,0,m.yaw.value):p.rotation;m.step(p.targetX,p.targetZ,targetYaw,1/60,false,p.targetY,view.hover,view.drive);if(p.opacity>.015)p.rig.update(1/60,{x:m.x.value,y:m.y.value,z:m.z.value,yaw:m.yaw.value,roll:m.roll.value,pitch:m.pitch.value,scale:1},false,p.precise,1,view.hover?m.x.value-previousX:0);}
   if(rack)contacts.step(participating.map(p=>p.solver));lastOffset=lastStrain=0;
   for(const p of plans){if(p.opacity>.015)p.rig.sync();else p.rig.suspend();if(frame<300||p.opacity<.8)continue;const s=p.solver;
    for(let i=0;i<s.position.length;i+=3){const d=Math.hypot(s.position[i]-s.target[i],s.position[i+1]-s.target[i+1],s.position[i+2]-s.target[i+2]);assert.ok(d<.5,'large cloth displacement at frame '+frame+' item '+p.index);lastOffset=Math.max(lastOffset,d);}
    for(const c of s.constraints){if(c.length<.04)continue;const i=c.a*3,j=c.b*3,ratio=Math.hypot(s.position[i]-s.position[j],s.position[i+1]-s.position[j+1],s.position[i+2]-s.position[j+2])/c.length;assert.ok(ratio<1.25,'structural strain at frame '+frame+' item '+p.index);lastStrain=Math.max(lastStrain,ratio);}
   }
  }
  assert.equal(presentation.owner,9);assert.equal(presentation.choice,6);assert.ok(lastOffset<.06);assert.ok(lastStrain<1.08);
 }finally{for(const p of all)p.rig.dispose();}
});
