import test from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import*as T from'three';
import{applyStudioSoftShadow,studioShadowUniforms as uniforms}from'../src/studio-soft-shadow.js';
import{createStudioShadowFraming}from'../src/studio-shadow.js';
import{createSurfaceRig}from'../src/surface-rig.js';

test('each real scene capture updates world-space softness and the camera-to-light normal transform',()=>{
 const light=new T.DirectionalLight(),rail=new T.Group(),piece=new T.Group(),scene=new T.Scene(),camera=new T.PerspectiveCamera();
 light.position.set(-4,5,6);light.shadow.mapSize.set(2048,2048);light.shadow.camera.near=.2;light.shadow.camera.far=24;piece.position.set(3.285,1.94,.35);scene.add(light,rail,piece);camera.position.set(2,3,8);camera.lookAt(-1,0,0);
 const capture=createStudioShadowFraming(light,rail,()=>piece);
 for(const focused of[false,true,false]){
  rail.visible=!focused;capture(null,scene,camera);
  assert.deepEqual(uniforms.uStudioShadowExtent.value.toArray(),focused?[6,6.5]:[14,9]);assert.equal(uniforms.uStudioShadowDepth.value,23.8);
  for(const world of[new T.Vector3(1,0,0),new T.Vector3(0,1,0),new T.Vector3(0,0,1)]){
   const view=world.clone().transformDirection(camera.matrixWorldInverse),actual=view.applyMatrix3(uniforms.uStudioViewToLight.value).normalize(),expected=world.clone().transformDirection(light.shadow.camera.matrixWorldInverse);
   assert.ok(actual.distanceTo(expected)<1e-12);
  }
  camera.position.x-=1;camera.lookAt(1,0,0);
 }
});

test('soft shadows compose with the real cloth, ink, rib and hem shader without replacing their state',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/models/short-sleeve-simulation.json',import.meta.url))),rig=createSurfaceRig(data,{},'shadow-compose'),geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute([0,-.5,.15,.1,-.5,.15,0,-.6,.15],3));geometry.setIndex([0,1,2]);geometry.computeVertexNormals();
 const material=new T.MeshPhysicalMaterial();material.userData.collarRib={value:1};material.userData.hemStitch={value:1};const mesh=new T.Mesh(geometry,material),originalChunk=T.ShaderChunk.shadowmap_pars_fragment;
 try{
  rig.bind(mesh);applyStudioSoftShadow(material);const compile=material.onBeforeCompile,key=material.customProgramCacheKey();applyStudioSoftShadow(material);assert.equal(material.onBeforeCompile,compile);assert.equal(material.customProgramCacheKey(),key);
  const shader={uniforms:{},vertexShader:'void main(){\n#include <begin_vertex>\n#include <beginnormal_vertex>\n}',fragmentShader:'#include <shadowmap_pars_fragment>\n#include <map_fragment>\n#include <aomap_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <lights_physical_fragment>'};material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uSurface.value,rig.texture);assert.equal(shader.uniforms.uCollarRib,material.userData.collarRib);assert.equal(shader.uniforms.uHemStitch,material.userData.hemStitch);assert.equal(shader.uniforms.uStudioShadowExtent,uniforms.uStudioShadowExtent);
  assert.match(shader.vertexShader,/clothNormalRotation/);assert.match(shader.fragmentShader,/inkAlpha/);assert.match(shader.fragmentShader,/studioSoftShadow/);assert.equal(T.ShaderChunk.shadowmap_pars_fragment,originalChunk);
 }finally{rig.dispose();geometry.dispose();material.dispose();mesh.customDepthMaterial.dispose();}
});
