import test from'node:test';import assert from'node:assert/strict';import*as T from'three';
import{studioEnvironment}from'../src/studio-environment.js';import{makeStudio}from'../src/studio-set.js';
function disposeScene(scene){scene.traverse(o=>{o.geometry?.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());o.shadow?.dispose();});}
const lightState=scene=>scene.children.filter(o=>o.isLight).map(o=>({type:o.type,color:o.color.toArray(),intensity:o.intensity,position:o.position.toArray(),width:o.width,height:o.height,angle:o.angle,distance:o.distance,decay:o.decay,target:o.target?.position.toArray()}));
test('environment captures the current lit backdrop without adding emissive source cards or a recursive environment',()=>{
 const original=T.PMREMGenerator.prototype.fromScene,nominal=new T.Scene(),target=new T.WebGLRenderTarget(2,2);makeStudio(nominal);let captured=false,disposedTarget=false;target.addEventListener('dispose',()=>{disposedTarget=true;});
 T.PMREMGenerator.prototype.fromScene=function(scene){
  captured=true;assert.deepEqual(lightState(scene),lightState(nominal));assert.equal(scene.environment,null);
  const meshes=[];scene.traverse(o=>{if(o.isMesh)meshes.push(o);if(o.isLight)assert.equal(o.castShadow,false);});
  assert.equal(meshes.length,1);assert.equal(meshes[0].material.emissive.getHex(),0);assert.equal(meshes[0].material.isMeshStandardMaterial,true);
  assert.deepEqual(meshes[0].geometry.attributes.position.array,nominal.children.find(o=>o.isMesh).geometry.attributes.position.array);return target;
 };
 try{assert.equal(studioEnvironment({compile(){}}),target);assert.equal(captured,true);assert.equal(disposedTarget,false);}
 finally{T.PMREMGenerator.prototype.fromScene=original;disposeScene(nominal);target.dispose();}
});
test('capture failure releases every owned geometry, material and shadow and the PMREM generator',()=>{
 const original=T.PMREMGenerator.prototype.fromScene,dispose=T.PMREMGenerator.prototype.dispose,expected=new Error('expected capture interruption'),resources=[];let generatorDisposals=0;
 T.PMREMGenerator.prototype.fromScene=function(scene){
  scene.traverse(o=>{
   for(const object of[o.geometry,...(o.material?(Array.isArray(o.material)?o.material:[o.material]):[])])if(object){const entry={count:0};resources.push(entry);object.addEventListener('dispose',()=>entry.count++);}
   if(o.shadow){const entry={count:0},before=o.shadow.dispose.bind(o.shadow);resources.push(entry);o.shadow.dispose=()=>{entry.count++;before();};}
  });throw expected;
 };
 T.PMREMGenerator.prototype.dispose=function(){generatorDisposals++;return dispose.call(this);};
 try{assert.throws(()=>studioEnvironment({compile(){}}),error=>error===expected);assert.ok(resources.length>=6);assert.ok(resources.every(r=>r.count===1));assert.equal(generatorDisposals,1);}
 finally{T.PMREMGenerator.prototype.fromScene=original;T.PMREMGenerator.prototype.dispose=dispose;}
});
