import test from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import*as T from'three';
import{loadGeometryAsset}from'./helpers/geometry-asset.js';
import{placeGarmentModel}from'../src/model-space.js';
import{modelConfig}from'../src/model-config.js';
import{createSurfaceRig}from'../src/surface-rig.js';
import{catalog}from'../src/catalog.js';
import{applyStudioAreaLight}from'../src/studio-area-light.js';
const config=modelConfig.shortSleeve,data=JSON.parse(readFileSync(new URL('../public'+config.simulation,import.meta.url)));
const asset=()=>loadGeometryAsset(new URL('../public'+config.url,import.meta.url));

test('gravity-fitted geometry retains hanger coordinates and its original print reference after import',async()=>{
 const {scene}=await asset(),mesh=scene.getObjectByName('Fabric'),g=mesh.geometry,p=g.attributes.position,rest=g.getAttribute('_cloth_print_rest'),front=g.getAttribute('_cloth_print_front'),before=new Float32Array(p.array);
 assert.equal(mesh.userData.rackCoordinates,'normalized');assert.equal(mesh.userData.sourceFabricMaps,true);assert.equal(mesh.userData.sourcePrintRest,true);
 assert.deepEqual(mesh.userData.deformationCage.dimensions,[16,24,8]);assert.equal(rest.count,p.count);assert.equal(front.count,p.count);
 placeGarmentModel(scene,config);scene.updateMatrixWorld(true);assert.deepEqual(mesh.matrixWorld.elements,new T.Matrix4().elements);assert.deepEqual(p.array,before);
 assert.ok(new T.Box3().setFromBufferAttribute(p).max.y<.9,'do not raise the collar back to the old .98 top');
 let changed=0,pinned=0;
 for(let i=0;i<p.count;i++){
  for(let k=0;k<3;k++)assert.ok(Number.isFinite(rest.array[i*3+k]));assert.ok(front.getX(i)>=0&&front.getX(i)<=1);
  if(Math.hypot(p.getX(i)-rest.getX(i),p.getY(i)-rest.getY(i),p.getZ(i)-rest.getZ(i))>.01)changed++;
  if(p.getY(i)>=.55)pinned++;
 }
 assert.ok(changed>10000,'ink must retain its original cloth reference');assert.ok(pinned>1000);
});

test('photo maps and original ink coordinates survive flow, depth and studio shader composition',async()=>{
 const {scene}=await asset(),g=scene.getObjectByName('Fabric').geometry;
 g.setAttribute('sourcePrintRest',g.getAttribute('_cloth_print_rest'));g.setAttribute('sourcePrintFront',g.getAttribute('_cloth_print_front'));
 const m=new T.MeshPhysicalMaterial({normalMap:new T.Texture(),roughnessMap:new T.Texture(),aoMap:new T.Texture()});m.userData.sourceFabricMaps=true;
 const mesh=new T.Mesh(g,m),rig=createSurfaceRig(data,catalog[0].motion,'gravity-photo-compose',{flow:true});
 try{
  rig.bind(mesh);applyStudioAreaLight(m);
  const shader={uniforms:{},vertexShader:T.ShaderLib.physical.vertexShader,fragmentShader:T.ShaderLib.physical.fragmentShader};m.onBeforeCompile(shader);
  assert.match(shader.vertexShader,/vGarmentRest=sourcePrintRest/);assert.match(shader.vertexShader,/vInkFront=sourcePrintFront/);assert.match(shader.vertexShader,/sampleFlowCloth\(position\)/);
  for(const [map,uv]of[['normalMap','vNormalMapUv'],['roughnessMap','vRoughnessMapUv'],['aoMap','vAoMapUv']])assert.ok(shader.fragmentShader.includes(`sourceClothSample(${map},${uv})`));
  assert.match(shader.fragmentShader,/normalScale\*mix\(1\.,\.50,inkAlpha\)/);
  const depth={uniforms:{},vertexShader:T.ShaderLib.depth.vertexShader,fragmentShader:T.ShaderLib.depth.fragmentShader};mesh.customDepthMaterial.onBeforeCompile(depth);
  assert.match(depth.vertexShader,/sampleFlowCloth\(position\)/);assert.match(depth.vertexShader,/vGarmentRest=sourcePrintRest/);
 }finally{rig.dispose();m.dispose();g.dispose();mesh.customDepthMaterial.dispose();}
});

test('each short-sleeve profile has a separate response while its supported top remains fixed',()=>{
 const dt=1/120,traces=[];
 for(const item of catalog.filter(i=>i.type==='shortSleeve')){
  const rig=createSurfaceRig(data,item.motion,item.id,{flow:true}),trace=[];
  try{
   for(let f=0;f<144;f++){
    const t=f*dt,a=t<.2?0:Math.sin(Math.min(1,(t-.2)/.8)*Math.PI/2);
    rig.update(dt,{x:.36*a,y:1.58+.045*a,z:.35*a,yaw:.65*a,roll:.009*Math.sin(t*5)*a,pitch:.055*Math.sin(t*4)*a},false);
    let sum=0;
    for(let i=0;i<rig.solver.count;i++)for(let k=0;k<3;k++){
     const value=rig.solver.offsets[i*3+k];assert.ok(Number.isFinite(value));if(!rig.solver.inverseMass[i])assert.equal(value,0);sum+=value*value;
    }
    if(f%12===0)trace.push(Math.sqrt(sum/rig.solver.count));
   }
   traces.push({id:item.id,trace});
  }finally{rig.dispose();}
 }
 for(let a=0;a<traces.length;a++)for(let b=0;b<a;b++)assert.ok(Math.hypot(...traces[a].trace.map((v,i)=>v-traces[b].trace[i]))>1e-4,`${traces[a].id} vs ${traces[b].id}`);
});
