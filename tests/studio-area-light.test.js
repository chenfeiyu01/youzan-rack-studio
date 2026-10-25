import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {makeStudio} from '../src/studio-set.js';
import {applyStudioAreaLight} from '../src/studio-area-light.js';
import {applyStudioSoftShadow,studioShadowUniforms} from '../src/studio-soft-shadow.js';
import {createSurfaceRig} from '../src/surface-rig.js';

test('one finite key faces the garments and its shadow proxy contributes no duplicate radiance',()=>{
 const first=new T.Scene(),a=makeStudio(first),tables=T.UniformsLib.LTC_FLOAT_1;
 const second=new T.Scene(),b=makeStudio(second);
 try{
  assert.equal(a.key.intensity,0);assert.equal(a.key.castShadow,true);assert.equal(first.children.filter(x=>x.isRectAreaLight).length,1);
  assert.ok(a.softbox.width>0&&a.softbox.height>0&&a.softbox.intensity>0);
  assert.equal(a.softbox.position.distanceTo(a.key.position),0);
  const emissionDirection=new T.Vector3(0,0,-1).applyQuaternion(a.softbox.getWorldQuaternion(new T.Quaternion()));
  assert.ok(emissionDirection.dot(a.key.target.position.clone().sub(a.key.position).normalize())>.99999);
  assert.equal(T.UniformsLib.LTC_FLOAT_1,tables,'shared lookup tables must not be replaced/leaked for a second scene');
 }finally{for(const scene of[first,second])scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
});

test('area integration composes with real cloth deformation, print, rib, hem and soft shadow callbacks',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/models/short-sleeve-simulation.json',import.meta.url))),rig=createSurfaceRig(data,{},'area-compose'),geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute([0,-.5,.15,.1,-.5,.15,0,-.6,.15],3));geometry.setIndex([0,1,2]);geometry.computeVertexNormals();
 const material=new T.MeshPhysicalMaterial({sheen:.22,clearcoat:.18});material.userData.collarRib={value:1};material.userData.hemStitch={value:1};const mesh=new T.Mesh(geometry,material),original=T.ShaderChunk.lights_fragment_begin;
 try{
  rig.bind(mesh);applyStudioSoftShadow(material);const previousKey=material.customProgramCacheKey();applyStudioAreaLight(material);const compile=material.onBeforeCompile,key=material.customProgramCacheKey();applyStudioAreaLight(material);
  assert.equal(material.onBeforeCompile,compile);assert.equal(material.customProgramCacheKey(),key);assert.ok(key.startsWith(previousKey));
  const shader={uniforms:{},vertexShader:T.ShaderLib.physical.vertexShader,fragmentShader:T.ShaderLib.physical.fragmentShader};material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uSurface.value,rig.texture);assert.equal(shader.uniforms.uCollarRib,material.userData.collarRib);assert.equal(shader.uniforms.uHemStitch,material.userData.hemStitch);assert.equal(shader.uniforms.uStudioShadowExtent,studioShadowUniforms.uStudioShadowExtent);
  for(const token of['inkAlpha','studioSoftShadow','studioDiffuseArea','BRDF_Sheen','clearcoatSpecularDirect+=coatLight.directSpecular','projectedView'])assert.ok(shader.fragmentShader.includes(token),token);
  assert.match(shader.vertexShader,/clothNormalRotation/);assert.equal(T.ShaderChunk.lights_fragment_begin,original);
  const shadow=shader.fragmentShader.indexOf('rectAreaLight.color*=getShadow');const response=shader.fragmentShader.indexOf('RE_Direct_RectArea( rectAreaLight',shadow);assert.ok(shadow>0&&response>shadow,'visibility must apply to every component of the key response');
 }finally{rig.dispose();geometry.dispose();material.dispose();mesh.customDepthMaterial.dispose();}
});

test('depth-only passes retain their existing deformation without lighting code',()=>{
 const material=new T.MeshDepthMaterial();let called=0;material.onBeforeCompile=shader=>{called++;shader.uniforms.existing={value:3};};applyStudioAreaLight(material);
 const shader={uniforms:{},vertexShader:T.ShaderLib.depth.vertexShader,fragmentShader:T.ShaderLib.depth.fragmentShader},fragment=shader.fragmentShader;material.onBeforeCompile(shader);
 assert.equal(called,1);assert.equal(shader.uniforms.existing.value,3);assert.equal(shader.fragmentShader,fragment);material.dispose();
});
