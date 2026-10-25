import{loadGeometryAsset}from'./helpers/geometry-asset.js';
import{placeGarmentModel}from'../src/model-space.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import * as T from 'three';
import {GLTFLoader}from'three/addons/loaders/GLTFLoader.js';
import {fabricRepeat}from'../src/fabric-textures.js';
import {modelConfig}from'../src/model-config.js';
const metreRatio=.283/.2638;
const near=(a,b)=>assert.ok(Math.abs(a-b)<=Math.max(1,Math.abs(b))*2e-6,`${a} versus ${b}`);

test('a known physical patch follows geometry and UV units without arbitrary repeat clamps',()=>{
 const plane=new T.PlaneGeometry(1,1),largeUV=new T.PlaneGeometry(1,1),smallUV=new T.PlaneGeometry(1,1),scaled=new T.PlaneGeometry(1,1);
 try{
  largeUV.attributes.uv.array.forEach((v,i,a)=>a[i]=v*1000);smallUV.attributes.uv.array.forEach((v,i,a)=>a[i]=v*.01);scaled.scale(3,3,3);
  near(fabricRepeat(plane),metreRatio);near(fabricRepeat(largeUV),metreRatio/1000);near(fabricRepeat(smallUV),metreRatio*100);near(fabricRepeat(scaled),metreRatio*3);
 }finally{for(const g of[plane,largeUV,smallUV,scaled])g.dispose();}
});

test('uniform subdivision, index expansion and mirrored/translated UVs retain the physical density',()=>{
 const coarse=new T.PlaneGeometry(2,3),fine=new T.PlaneGeometry(2,3,16,16),expanded=fine.toNonIndexed();
 try{
  const uv=expanded.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,13-uv.getX(i),7+uv.getY(i));
  const expected=Math.sqrt(6)*metreRatio;for(const g of[coarse,fine,expanded])near(fabricRepeat(g),expected);
 }finally{for(const g of[coarse,fine,expanded])g.dispose();}
});

test('a tiny distorted island cannot erase the weave over the dominant cloth area',()=>{
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,0,0,1,1,0,0,1,0,2,0,0,2.001,0,0,2,.001,0],3));geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,1,0,0,1,1,0,1,0,0,1000,0,0,1000],2));
 try{near(fabricRepeat(geometry),metreRatio);}finally{geometry.dispose();}
});

test('cached density follows edits and replacement of the position, UV and index data',()=>{
 const geometry=new T.PlaneGeometry(1,1),originalUV=geometry.attributes.uv.clone();
 try{
  near(fabricRepeat(geometry),metreRatio);const uv=geometry.attributes.uv;uv.array.forEach((v,i,a)=>a[i]=v*2);uv.needsUpdate=true;near(fabricRepeat(geometry),metreRatio/2);
  geometry.scale(3,3,3);near(fabricRepeat(geometry),metreRatio*1.5);geometry.setAttribute('uv',originalUV);near(fabricRepeat(geometry),metreRatio*3);
 }finally{geometry.dispose();}
 const indexed=new T.BufferGeometry();indexed.setAttribute('position',new T.Float32BufferAttribute([0,0,0,2,0,0,0,2,0,3,0,0,4,0,0,3,1,0],3));indexed.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,1,0,0,1,0,0,1],2));indexed.setIndex([0,1,2,3,4,5]);
 try{near(fabricRepeat(indexed),metreRatio*2);indexed.index.array.set([3,4,5,3,4,5]);indexed.index.needsUpdate=true;near(fabricRepeat(indexed),metreRatio);}finally{indexed.dispose();}
});

test('missing or degenerate UVs have a finite fallback and calibration leaves source buffers untouched',()=>{
 const missing=new T.PlaneGeometry(1,1);missing.deleteAttribute('uv');const zero=new T.PlaneGeometry(1,1);zero.attributes.uv.array.fill(0);const invalid=new T.PlaneGeometry(1,1);invalid.attributes.uv.array.fill(NaN);
 try{for(const g of[missing,zero,invalid])assert.equal(fabricRepeat(g),3.5);}finally{for(const g of[missing,zero,invalid])g.dispose();}
 const plane=new T.PlaneGeometry(1,1),positions=plane.attributes.position.array.slice(),uvs=plane.attributes.uv.array.slice(),indices=plane.index.array.slice();
 try{fabricRepeat(plane);assert.deepEqual(plane.attributes.position.array,positions);assert.deepEqual(plane.attributes.uv.array,uvs);assert.deepEqual(plane.index.array,indices);}finally{plane.dispose();}
});

test('photo cloth retains native UVs while folded long trim uses calibrated model-space UVs',async()=>{
 for(const[type,c]of Object.entries(modelConfig)){
  const asset=await loadGeometryAsset(new URL('../public'+c.url,import.meta.url));placeGarmentModel(asset.scene,c);const model=asset.scene;model.updateMatrixWorld(true);
  let checked=false;model.traverse(o=>{if(!o.isMesh||(type==='shortSleeve'?o.name!=='Fabric':o.name!=='Fabric_Trim'))return;const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld);try{const repeat=fabricRepeat(geometry);assert.ok(Number.isFinite(repeat)&&repeat>0);if(type==='shortSleeve'){assert.equal(o.userData.sourceFabricMaps,true);assert.equal(o.userData.rackCoordinates,'normalized');}else assert.ok(Math.abs(repeat/metreRatio-1)<.02,'fold UV arc lengths use model units before the physical scan repeat');checked=true;}finally{geometry.dispose();}});assert.ok(checked,type);
 }
});
