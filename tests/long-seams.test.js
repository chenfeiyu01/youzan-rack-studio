import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {loadGeometryAsset} from './helpers/geometry-asset.js';
import {measureSeamContinuity} from './helpers/seam-continuity.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/long-seams.json',import.meta.url)));

test('all exposed long-sleeve panel seams form two continuous oriented sides in the actual draw mesh',async()=>{
 const {scene}=await loadGeometryAsset(new URL('../public/models/hanging-long-sleeve.glb',import.meta.url));
 try {
  const rows=measureSeamContinuity(scene,fixture.segments,fixture.tolerance);
  assert.equal(rows.length,782);
  for(const row of rows) {
   assert.ok(row.uncoveredLength<=fixture.tolerance*3,`${row.join} ${row.kind}: unsewn length ${row.uncoveredLength}`);
   assert.equal(row.badIncidence.length,0,`${row.join} ${row.kind}: sewn edge must have exactly two opposing faces`);
  }
 } finally { scene.traverse(o=>{o.geometry?.dispose();for(const m of(Array.isArray(o.material)?o.material:[o.material]))m?.dispose();}); }
});

test('seam coverage detects gaps, missing faces and reversed faces despite split attribute vertices',()=>{
 const make=(gap=0,reverse=false,missing=false)=>{
  const scene=new T.Scene(),geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,1,-gap,0,0,-gap,0,0,-1,0],3));
  geometry.setIndex(missing?[0,1,2]:reverse?[0,1,2,4,3,5]:[0,1,2,3,4,5]);
  const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial());mesh.name='Fabric';scene.add(mesh);return scene;
 };
 const segments=[{a:[0,0,0],b:[1,0,0]}];
 for(const [gap,reverse,missing,closed] of [[0,false,false,true],[.001,false,false,false],[0,true,false,false],[0,false,true,false]]) {
  const scene=make(gap,reverse,missing),[row]=measureSeamContinuity(scene,segments);
  assert.equal(row.uncoveredLength<1e-7,closed);
  scene.children[0].geometry.dispose();scene.children[0].material.dispose();
 }
});
