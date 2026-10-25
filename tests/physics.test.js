import test from 'node:test';
import assert from 'node:assert/strict';
import { ClothCage,HangingMotion,CLOTH_COLUMNS,CLOTH_ROWS } from '../src/physics.js';
import { catalog } from '../src/catalog.js';
const dt=1/120;
function run(item){
  const cage=new ClothCage(item.type==='longSleeve',item.motion),motion=new HangingMotion(0,-1.43,item.type==='longSleeve',item.motion);
  const trace=[];let peak=0,shoulder=0,lateMotion=0,previous;
  for(let frame=0;frame<1200;frame++){
    const moving=frame>=60&&frame<240;
    motion.step(moving?1:0,0,moving?0:-1.43,dt);
    assert.ok(Math.abs(motion.roll.value)<=.01201);
    cage.step(dt,{x:motion.x.value,y:1.56,yaw:motion.yaw.value,roll:motion.roll.value,pitch:motion.pitch.value});
    for(let i=0;i<cage.offsets.length;i++)assert.ok(Number.isFinite(cage.offsets[i]));
    for(let l=0;l<2;l++)for(let r=0;r<2;r++)for(let c=0;c<CLOTH_COLUMNS;c++){
      const i=(l*CLOTH_ROWS*CLOTH_COLUMNS+r*CLOTH_COLUMNS+c)*3;
      shoulder=Math.max(shoulder,Math.hypot(...cage.offsets.slice(i,i+3)));
    }
    const sample=cage.sample(.4,-1.3,.12);
    peak=Math.max(peak,Math.hypot(...sample));
    if(frame%12===0&&frame>=60&&frame<480)trace.push(sample[2]);
    if(frame>1100&&previous)lateMotion=Math.max(lateMotion,Math.hypot(...sample.map((v,i)=>v-previous[i])));
    previous=sample;
  }
  return{peak,shoulder,lateMotion,trace};
}
test('all garment presets keep the hanger support fixed, deform below, and settle',()=>{
  for(const item of catalog){const result=run(item);assert.ok(result.shoulder<1e-6,item.id);assert.ok(result.peak>.05&&result.peak<.9,`${item.id}: ${result.peak}`);assert.ok(result.lateMotion<.001,`${item.id}: ${result.lateMotion}`);}
});
test('light and heavy shirts follow different cloth trajectories for the same gesture',()=>{
  const light=run(catalog[0]),heavy=run(catalog[1]);
  const difference=light.trace.reduce((sum,v,i)=>sum+Math.abs(v-heavy.trace[i]),0)/light.trace.length;
  assert.ok(difference>.008,`trajectory difference ${difference}`);
});
test('reduced motion snaps all cage offsets to zero',()=>{
  const cage=new ClothCage();cage.step(dt,{yaw:1.3,x:2},true);assert.ok(cage.offsets.every(v=>v===0));
});
