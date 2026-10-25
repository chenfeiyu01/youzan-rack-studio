import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import {createHash}from'node:crypto';
import * as T from 'three';
import {fabricPresets,fabricPreset,fabricColorGain}from'../src/fabric-presets.js';
import {fabricRepeat,preloadFabricTextures,fabricTextures}from'../src/fabric-textures.js';
import {catalog}from'../src/catalog.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} versus ${b}`);

test('new material maps match their recorded source dimensions and checked web assets',()=>{
 for(const name of['melange','fleece']){
  const p=fabricPreset(name),root=new URL('../public/textures/'+p.folder+'/',import.meta.url),meta=JSON.parse(readFileSync(new URL('metadata.json',root)));
  near(p.patchMetres,Math.sqrt(meta.dimensionsMm[0]*meta.dimensionsMm[1])/1000);near(p.colorGain,meta.colorGain);
  for(const key of['normal','roughness','albedo']){const file=key+'-'+p.resolution+'.jpg',bytes=readFileSync(new URL(file,root));assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.maps[file].sha256);assert.equal(bytes.length,meta.maps[file].bytes);}
 }
 for(const item of catalog)assert.ok(fabricPreset(item.fabric));
 for(const key of['missing','__proto__','constructor'])assert.throws(()=>fabricPreset(key),RangeError);
});

test('the same geometry keeps each rectangular scan at its source physical aspect and density',()=>{
 const plane=new T.PlaneGeometry(1,1);try{
  const original=fabricRepeat(plane);
  for(const name of['melange','fleece']){const p=fabricPreset(name),meta=JSON.parse(readFileSync(new URL('../public/textures/'+p.folder+'/metadata.json',import.meta.url))),repeat=fabricRepeat(plane,p.patchMetres);near(.283/(repeat*p.repeatAspect[0]),meta.dimensionsMm[0]/1000);near(.283/(repeat*p.repeatAspect[1]),meta.dimensionsMm[1]/1000);}
  near(fabricRepeat(plane),original,'cached geometry must not inherit the last family\'s scale');
  for(const size of[0,-1,Infinity,NaN])assert.throws(()=>fabricRepeat(plane,size),RangeError);
 }finally{plane.dispose();}
});

test('scan tint compensation preserves the mean dye and keeps bright fibers within unit reflectance',()=>{
 for(const item of catalog){const family=item.fabric??'cotton',p=fabricPreset(family),dye=new T.Color(item.color).toArray(),gain=fabricColorGain(family,dye);assert.ok(dye.every(c=>c*gain>=0&&c*gain<=1));if(family==='cotton'){assert.equal(gain,1);continue;}const meta=JSON.parse(readFileSync(new URL('../public/textures/'+p.folder+'/metadata.json',import.meta.url)));for(const c of dye)near(c*gain*meta.albedoMeanLinear,c*meta.legacyAlbedoMeanLinear);}
 for(const name of Object.keys(fabricPresets))for(const color of[[1,1,1],[0,0,0],[.9,.1,.05]]){const gain=fabricColorGain(name,color);assert.ok(color.every(c=>c*gain<=1));}
});

test('concurrent preloads share image work, retries recover, and per-garment repeat transforms stay independent',async()=>{
 const original=T.TextureLoader.prototype.loadAsync,calls=[];let failFleece=true;
 T.TextureLoader.prototype.loadAsync=async function(url){calls.push(url);await new Promise(resolve=>setImmediate(resolve));if(url.includes('knitted-fleece/normal')&&failFleece){failFleece=false;throw new Error('expected interrupted image load');}return new T.Texture({width:8,height:8});};
 try{
  await Promise.all([preloadFabricTextures(['cotton','melange']),preloadFabricTextures(['melange'])]);assert.equal(calls.length,6);
  await assert.rejects(preloadFabricTextures(['fleece']),/expected interrupted/);await preloadFabricTextures(['fleece']);assert.equal(calls.length,12);
  const before=calls.length;await preloadFabricTextures();assert.equal(calls.length,before);
  const a=fabricTextures(2,'melange'),b=fabricTextures(3,'melange'),c=fabricTextures(2,'fleece');
  try{
   assert.equal(a.normal.source,b.normal.source);assert.notEqual(a.normal.source,c.normal.source);near(a.normal.repeat.x,2*fabricPreset('melange').repeatAspect[0]);near(b.normal.repeat.x,3*fabricPreset('melange').repeatAspect[0]);
   a.normal.repeat.x=99;assert.notEqual(b.normal.repeat.x,99);assert.equal(a.albedo.colorSpace,T.SRGBColorSpace);assert.equal(a.normal.colorSpace,T.NoColorSpace);assert.equal(a.roughness.colorSpace,T.NoColorSpace);assert.equal(a.normal.wrapS,T.RepeatWrapping);
  }finally{for(const set of[a,b,c])for(const texture of Object.values(set))texture.dispose();}
 }finally{T.TextureLoader.prototype.loadAsync=original;}
});
