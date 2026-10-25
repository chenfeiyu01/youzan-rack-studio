import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import*as T from'three';
import{applySourceFabricMaps}from'../src/source-fabric.js';import{cottonMaterial}from'../src/cloth-material.js';import{preloadFabricTextures}from'../src/fabric-textures.js';

test('source fold maps retain calibrated family albedo, dye and independent UV transforms',async()=>{
 const load=T.TextureLoader.prototype.loadAsync;T.TextureLoader.prototype.loadAsync=async()=>new T.Texture({width:8,height:8});
 try{await preloadFabricTextures(['cotton','melange']);}finally{T.TextureLoader.prototype.loadAsync=load;}
 const source=new T.MeshStandardMaterial({map:new T.Texture(),normalMap:new T.Texture(),roughnessMap:new T.Texture(),aoMap:new T.Texture(),normalScale:new T.Vector2(.7,.7),aoMapIntensity:.83});
 // Keep the calibrated mid-gray specimen independent of catalog redesigns.
 const color='#8f9391',m=cottonMaterial(color,{},2.3,'melange'),albedo=m.map,transform=m.map.repeat.clone(),bodyColor=m.color.clone(),sheen=m.sheenColor.clone();
 try{
  applySourceFabricMaps(m,source);
  assert.equal(m.map,albedo,'the albedo must remain present whenever its tint compensation is used');assert.notEqual(m.map,source.map);assert.ok(m.map.repeat.equals(transform));assert.ok(m.color.equals(bodyColor));assert.ok(m.sheenColor.equals(sheen));
  assert.equal(m.normalMap,source.normalMap);assert.ok(m.normalScale.equals(source.normalScale));assert.equal(m.roughnessMap,source.roughnessMap);assert.equal(m.aoMap,source.aoMap);assert.equal(m.aoMapIntensity,source.aoMapIntensity);
  const metadata=JSON.parse(readFileSync(new URL('../public/textures/jersey-melange/metadata.json',import.meta.url))),dye=new T.Color(color);
  for(const k of ['r','g','b'])assert.ok(Math.abs(m.color[k]*metadata.albedoMeanLinear-dye[k]*metadata.legacyAlbedoMeanLinear)<1e-6,'photo import must preserve the checked mean diffuse reflectance');
  assert.equal(m.map.colorSpace,T.SRGBColorSpace);assert.equal(m.normalMap.colorSpace,T.NoColorSpace);assert.equal(m.userData.sourceFabricMaps,true);
 }finally{m.dispose();source.dispose();}
});
