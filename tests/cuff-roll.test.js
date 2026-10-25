import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {loadGeometryAsset} from './helpers/geometry-asset.js';
import {measureSeamContinuity} from './helpers/seam-continuity.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/cuff-roll.json',import.meta.url)));

test('both rolled cuffs continuously join the original outer and inner body borders in the actual draw mesh',async()=>{
 const {scene}=await loadGeometryAsset(new URL('../public/models/hanging-long-sleeve.glb',import.meta.url));
 try {
  const rows=measureSeamContinuity(scene,fixture.segments,fixture.tolerance,['Fabric','Fabric_Inner','Fabric_Trim']);
  assert.equal(rows.length,104);
  for(const row of rows) {
   assert.ok(row.uncoveredLength<=fixture.tolerance*3,`${row.cuff} ${row.kind}: unsewn cuff border ${row.uncoveredLength}`);
   assert.equal(row.badIncidence.length,0,`${row.cuff} ${row.kind}: folded trim must share the body edge`);
  }
 } finally { scene.traverse(o=>{o.geometry?.dispose();for(const m of(Array.isArray(o.material)?o.material:[o.material]))m?.dispose();}); }
});

test('a closed body end wall cannot masquerade as an attached folded cuff',()=>{
 const scene=new T.Scene(),material=new T.MeshBasicMaterial();
 for(const [name,positions]of [['Fabric',[0,0,0,1,0,0,0,1,0]],['Fabric_Trim',[1,0,0,0,0,0,0,-1,0]]]) {
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex([0,1,2]);const mesh=new T.Mesh(geometry,material);mesh.name=name;scene.add(mesh);
 }
 const segment={a:[0,0,0],b:[1,0,0],expectedMeshes:['Fabric','Fabric_Trim']};
 const [attached]=measureSeamContinuity(scene,[segment],2e-7,['Fabric','Fabric_Trim']);assert.equal(attached.uncoveredLength,0);
 scene.children[1].name='Fabric';
 const [closedBodyOnly]=measureSeamContinuity(scene,[segment],2e-7,['Fabric','Fabric_Trim']);assert.equal(closedBodyOnly.uncoveredLength,1);assert.ok(closedBodyOnly.badIncidence.length>0);
 scene.children.forEach(o=>o.geometry.dispose());material.dispose();
});

test('every fine edge of the actual folded cuffs has exactly two oppositely oriented incident faces',async()=>{
 const {scene}=await loadGeometryAsset(new URL('../public/models/hanging-long-sleeve.glb',import.meta.url));
 try {
  const ids=new Map(),points=[],edges=new Map();let cuffFaces=0;
  scene.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.name.startsWith('Fabric'))return;
   const g=mesh.geometry,p=g.attributes.position,index=g.index,lookup=[];
   for(let i=0;i<p.count;i++) {
    const xyz=[p.getX(i),p.getY(i),p.getZ(i)],key=xyz.join(':');
    if(!ids.has(key)){ids.set(key,points.length);points.push(xyz);}
    lookup.push(ids.get(key));
   }
   for(let i=0;i<index.count;i+=3) {
    const triangle=[0,1,2].map(k=>lookup[index.getX(i+k)]);
    const cuff=mesh.name==='Fabric_Trim'&&triangle.every(i=>points[i][1]<-1.4);
    if(cuff)cuffFaces++;
    for(let k=0;k<3;k++) {
     const a=triangle[k],b=triangle[(k+1)%3];if(a===b)continue;
     const key=a<b?`${a}:${b}`:`${b}:${a}`;
     if(!edges.has(key))edges.set(key,{count:0,orientation:0,cuff:false});
     const edge=edges.get(key);edge.count++;edge.orientation+=a<b?1:-1;edge.cuff||=cuff;
    }
   }
  });
  assert.ok(cuffFaces>3000,'exercise both cuffs after clipping against the full deformation cage');
  const touched=[...edges.values()].filter(e=>e.cuff);
  assert.ok(touched.length>cuffFaces);
  for(const edge of touched){assert.equal(edge.count,2,'no open edges or internal wall branches');assert.equal(edge.orientation,0,'incident faces follow a consistent surface orientation');}
 } finally { scene.traverse(o=>{o.geometry?.dispose();for(const m of(Array.isArray(o.material)?o.material:[o.material]))m?.dispose();}); }
});
