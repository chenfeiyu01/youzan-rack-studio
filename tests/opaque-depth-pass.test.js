import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createOpaqueDepthPass} from '../src/opaque-depth-pass.js';
function fixture(){
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(),material=new T.MeshPhysicalMaterial({side:T.DoubleSide}),geometry=new T.PlaneGeometry(),mesh=new T.Mesh(geometry,material),depth=new T.MeshDepthMaterial({side:T.BackSide});mesh.customDepthMaterial=depth;scene.background=new T.Color('#252627');scene.add(mesh);
 const renderer={autoClear:true,autoClearColor:true,autoClearDepth:true,clearColor(){},shadowMap:{autoUpdate:true,needsUpdate:true},render(){}};
 return{scene,camera,material,geometry,mesh,depth,renderer,pass:createOpaqueDepthPass(renderer),dispose(){this.pass.dispose();material.dispose();depth.dispose();geometry.dispose();}};
}
test('opaque prepass reuses cloth depth deformation and refreshes shadows only in the unchanged colour draw',()=>{
 const f=fixture(),background=f.scene.background,hook=function(s){assert.equal(this,f.depth);s.uniforms.marker={value:31};s.vertexShader+='\n// actual deformation';};f.depth.onBeforeCompile=hook;const before=f.geometry.attributes.position.array.slice(),calls=[];
 f.renderer.render=(scene,camera)=>{calls.push({material:f.mesh.material,colorWrite:f.depth.colorWrite,side:f.depth.side,background:scene.background,autoClear:f.renderer.autoClear,shadowUpdate:f.renderer.shadowMap.autoUpdate,shadowNeeds:f.renderer.shadowMap.needsUpdate});assert.equal(camera,f.camera);if(calls.length===2)f.renderer.shadowMap.needsUpdate=false;};
 try{f.pass.render(f.scene,f.camera);assert.equal(calls.length,2);assert.deepEqual(calls[0],{material:f.depth,colorWrite:false,side:T.DoubleSide,background,autoClear:true,shadowUpdate:false,shadowNeeds:false});assert.deepEqual(calls[1],{material:f.material,colorWrite:true,side:T.BackSide,background:null,autoClear:false,shadowUpdate:true,shadowNeeds:true});
  assert.equal(f.mesh.material,f.material);assert.equal(f.scene.background,background);assert.equal(f.renderer.autoClear,true);assert.equal(f.renderer.shadowMap.autoUpdate,true);assert.equal(f.renderer.shadowMap.needsUpdate,false,'retain the native renderer\'s consumed shadow update');assert.equal(f.depth.colorWrite,true);assert.equal(f.depth.side,T.BackSide);assert.deepEqual(f.geometry.attributes.position.array,before);
  const s={uniforms:{},vertexShader:'void main(){}'};f.depth.onBeforeCompile(s,{});assert.equal(s.uniforms.marker.value,31);assert.ok(s.vertexShader.startsWith('invariant gl_Position;'));assert.ok(s.vertexShader.includes('// actual deformation'));const key=f.material.customProgramCacheKey();f.pass.render(f.scene,f.camera);assert.equal(f.material.customProgramCacheKey(),key,'do not stack invariant hooks each frame');
 }finally{f.dispose();}
});
test('both draw failures restore scene, caster materials, colour/depth state and pending shadows',()=>{
 for(const failAt of[1,2]){const f=fixture(),background=f.scene.background;let calls=0;f.renderer.render=()=>{if(++calls===failAt)throw Error('draw failed');};try{assert.throws(()=>f.pass.render(f.scene,f.camera),/draw failed/);assert.equal(calls,failAt);assert.equal(f.mesh.material,f.material);assert.equal(f.scene.background,background);assert.equal(f.depth.colorWrite,true);assert.equal(f.depth.side,T.BackSide);assert.equal(f.renderer.autoClear,true);assert.deepEqual(f.renderer.shadowMap,{autoUpdate:true,needsUpdate:true});}finally{f.dispose();}}
});
test('other coverage and depth modes fall back before mutating any material or shader hook',()=>{
 for(const mode of['transparent','alphaTest','alphaHash','alphaMap','alphaToCoverage','displacementMap','wireframe','polygonOffset','depthTest','depthWrite','depthFunc','stencilWrite','clippingPlanes','array','autoClear','autoClearColor','autoClearDepth','override','background']){
  const f=fixture();if(mode==='array')f.mesh.material=[f.material];else if(['autoClear','autoClearColor','autoClearDepth'].includes(mode))f.renderer[mode]=false;else if(mode==='override')f.scene.overrideMaterial=f.material;else if(mode==='background')f.scene.background=new T.Texture();else f.material[mode]=({depthTest:false,depthWrite:false,depthFunc:T.AlwaysDepth,alphaTest:.5,alphaMap:{},displacementMap:{},clippingPlanes:[new T.Plane()]})[mode]??true;
  const hook=f.material.onBeforeCompile,depthHook=f.depth.onBeforeCompile,material=f.mesh.material,background=f.scene.background;let calls=0;f.renderer.render=()=>{calls++;assert.equal(f.mesh.material,material);assert.equal(f.scene.background,background);assert.equal(f.depth.colorWrite,true);};try{f.pass.render(f.scene,f.camera);assert.equal(calls,1,mode);assert.equal(f.material.onBeforeCompile,hook,mode);assert.equal(f.depth.onBeforeCompile,depthHook,mode);}finally{if(mode==='background')background.dispose();f.dispose();}
 }
});
test('hidden material surfaces never occlude and owned fallback depth resources are released once',()=>{
 const f=fixture();delete f.mesh.customDepthMaterial;let released=0,first;f.renderer.render=()=>{if(f.mesh.material!==f.material){first??=f.mesh.material;assert.equal(f.mesh.material,first);assert.equal(first.colorWrite,false);}};
 try{f.pass.render(f.scene,f.camera);first.addEventListener('dispose',()=>released++);f.pass.render(f.scene,f.camera);f.material.visible=false;let calls=0;f.renderer.render=()=>{calls++;assert.equal(f.mesh.material,f.material);};f.pass.render(f.scene,f.camera);assert.equal(calls,1);f.pass.dispose();assert.equal(released,1);f.pass.dispose();assert.equal(released,1);}finally{f.dispose();}
});
