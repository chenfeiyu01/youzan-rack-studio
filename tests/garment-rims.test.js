import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadGeometryAsset} from './helpers/geometry-asset.js';
import {measureSeamContinuity} from './helpers/seam-continuity.js';
import {bindingDensity} from './helpers/binding-density.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/garment-rims.json',import.meta.url)));
const asset=new URL('../public/models/hanging-long-sleeve.glb',import.meta.url);
function dispose(scene){scene.traverse(o=>{o.geometry?.dispose();for(const m of(Array.isArray(o.material)?o.material:[o.material]))m?.dispose();});}

test('neckline and hem folded borders share the complete original outer and inner body edges',async()=>{
 const {scene}=await loadGeometryAsset(asset);
 try {
  const rows=measureSeamContinuity(scene,fixture.segments,fixture.tolerance,['Fabric','Fabric_Inner','Fabric_Trim']);
  assert.equal(rows.length,304);
  for(const row of rows){assert.ok(row.uncoveredLength<=fixture.tolerance*3,`${row.rim} ${row.kind}: unjoined border ${row.uncoveredLength}`);assert.equal(row.badIncidence.length,0,`${row.rim} ${row.kind}: correct opposing body and trim faces`);}
 } finally {dispose(scene);}
});

test('all drawn folded trim edges close consistently through the actual body layers',async()=>{
 const {scene}=await loadGeometryAsset(asset);
 try {
  const ids=new Map(),points=[],edges=new Map();let trimFaces=0;
  scene.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.name.startsWith('Fabric'))return;
   const g=mesh.geometry,p=g.attributes.position,index=g.index,lookup=[];
   for(let i=0;i<p.count;i++){const xyz=[p.getX(i),p.getY(i),p.getZ(i)],key=xyz.join(':');if(!ids.has(key)){ids.set(key,points.length);points.push(xyz);}lookup.push(ids.get(key));}
   for(let i=0;i<index.count;i+=3){const triangle=[0,1,2].map(k=>lookup[index.getX(i+k)]),trim=mesh.name==='Fabric_Trim';if(trim)trimFaces++;for(let k=0;k<3;k++){const a=triangle[k],b=triangle[(k+1)%3];if(a===b)continue;const key=a<b?`${a}:${b}`:`${b}:${a}`;if(!edges.has(key))edges.set(key,{count:0,orientation:0,trim:false});const edge=edges.get(key);edge.count++;edge.orientation+=a<b?1:-1;edge.trim||=trim;}}
  });
  assert.ok(trimFaces>10000,'exercise neckline, hem and both cuffs after cage clipping');
  for(const edge of edges.values())if(edge.trim){assert.equal(edge.count,2,'no open or internal branch edges');assert.equal(edge.orientation,0,'continuous orientation');}
 } finally {dispose(scene);}
});

test('all four folded bands retain consistent physical weave scale and detect a mis-scaled cuff',async()=>{
 const {scene}=await loadGeometryAsset(asset);
 try {
  const g=scene.getObjectByName('Fabric_Trim').geometry,rows=bindingDensity(g);
  assert.equal(rows.length,4);assert.deepEqual(rows.map(r=>r.name).sort(),['cuff-left','cuff-right','hem','neck']);
  for(const row of rows){assert.ok(Math.abs(row.median-1)<.02,row.name+' median weave scale');assert.ok(row.p05>.9&&row.p95<1.1,row.name+' dominant-area weave scale');}
  const altered=g.clone(),uv=altered.attributes.uv,cuff=rows.find(r=>r.name==='cuff-left');
  for(const i of cuff.vertices)uv.setXY(i,uv.getX(i)*1.6,uv.getY(i)*1.6);uv.needsUpdate=true;
  assert.ok(bindingDensity(altered).find(r=>r.name==='cuff-left').median>1.4,'global fitting must not hide a dense cuff island');altered.dispose();
 } finally {dispose(scene);}
});
