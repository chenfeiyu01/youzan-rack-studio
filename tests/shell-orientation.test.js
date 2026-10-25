import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {SurfaceCloth} from '../src/surface-physics.js';
import {HangingMotion} from '../src/physics.js';
import {catalog} from '../src/catalog.js';
const data=Object.fromEntries([['shortSleeve','short-sleeve'],['longSleeve','hanging-long-sleeve']].map(([type,name])=>[type,JSON.parse(readFileSync(new URL('../public/models/'+name+'-simulation.json',import.meta.url)))]));

test('cloth walls keep their side during repeated interrupted turns and neighboring-slot moves',()=>{
  // Independent plane-distance evaluation checks the actual world positions,
  // rather than trusting the solver's stored side or constraint residual.
  const plane=new THREE.Plane(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),d=new THREE.Vector3();
  function side(p,s){a.fromArray(p,s.a*3);b.fromArray(p,s.b*3);c.fromArray(p,s.c*3);d.fromArray(p,s.d*3);plane.setFromCoplanarPoints(b,c,d);assert.ok(plane.normal.lengthSq()>.9,'a counterpart face must remain nondegenerate');return plane.distanceToPoint(a);}
  for(const preset of[6,7,5]){
    const item=catalog[preset],solver=new SurfaceCloth(data[item.type],item.motion),motion=new HangingMotion(0,0,item.type==='longSleeve',item.motion),signs=solver.shell.constraints.map(s=>Math.sign(side(solver.rest,s)));
    let peak=0,pin=0;
    for(let frame=0;frame<180;frame++){
      const stage=Math.floor(frame/12)%6;
      motion.step([0,0,.66,-.66,0,0][stage],stage===4?0:.35,[0,Math.PI,0,Math.PI,-1.43,0][stage],1/60,false,stage===4?1.56:1.94);
      solver.step(1/60,{x:motion.x.value,y:motion.y.value,z:motion.z.value,yaw:motion.yaw.value,roll:motion.roll.value,pitch:motion.pitch.value});
      for(let i=0;i<solver.count;i++){const j=i*3,d=Math.hypot(solver.offsets[j],solver.offsets[j+1],solver.offsets[j+2]);assert.ok(Number.isFinite(d),item.id);peak=Math.max(peak,d);if(!solver.inverseMass[i])pin=Math.max(pin,d);}
      solver.shell.constraints.forEach((s,i)=>{const height=signs[i]*side(solver.position,s);assert.ok(height>=-1e-8,`${item.id}: inverted shell at frame ${frame}, attachment ${i}, height ${height}, rest ${s.restHeight}`);});
    }
    assert.ok(peak<.9,`${item.id}: unbounded motion ${peak}`);assert.ok(pin<1e-6,`${item.id}: hanger support moved`);
  }
});
