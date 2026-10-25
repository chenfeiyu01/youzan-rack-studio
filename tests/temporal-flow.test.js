import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import*as T from'three';import{createSurfaceRig}from'../src/surface-rig.js';import{createFlowReference}from'../src/surface-flow-grid.js';
const read=file=>JSON.parse(readFileSync(new URL(file,import.meta.url)));
test('long cloth interpolates complete projected endpoints without changing simulation or rebuilding them between display frames',()=>{
 const data=read('../public/models/hanging-long-sleeve-simulation.json'),rig=createSurfaceRig(data,{},'temporal-long',{flow:true}),source=rig.texture.image.data,renderer={get extensions(){throw Error('no float target required');}},fields=['position','previous','velocity','target','local','offsets','normal'],before=fields.map(k=>rig.solver[k].slice());
 try{
  rig.prepare(renderer,0,10);const initial=rig.flow.uniforms.uFlowGrid.value.image.data.slice();assert.equal(rig.flow.uniforms.uFlowMix.value,1);
  source.set(read('./fixtures/invalid-long-cage.json').sourceOffsets);rig.texture.needsUpdate=true;const sourceBefore=source.slice();rig.prepare(renderer,0,11);
  const uniforms=rig.flow.uniforms,current=uniforms.uFlowGrid.value,version=current.version,reference=createFlowReference(data);reference.update(source);
  assert.equal(uniforms.uFlowMix.value,0);assert.deepEqual(uniforms.uPreviousFlowGrid.value.image.data,initial);assert.deepEqual(current.image.data,reference.pixels);
  rig.prepare(renderer,.5,11);assert.equal(uniforms.uFlowMix.value,.5);assert.equal(current.version,version,'intermediate display frames must reuse the physical endpoint');assert.equal(uniforms.uFlowGrid.value,current);assert.deepEqual(source,sourceBefore);
  rig.prepare(renderer,0,12);assert.equal(uniforms.uFlowMix.value,1,'unchanged cloth cannot replay stale history on unrelated physical commits');
  for(let i=0;i<fields.length;i++)assert.deepEqual(rig.solver[fields[i]],before[i],fields[i]);
 }finally{rig.dispose();}
});
test('GPU cloth copies the previous complete endpoint and never blends history into its physical field composition',()=>{
 const data=read('../public/models/short-sleeve-simulation.json'),rig=createSurfaceRig(data,{},'temporal-gpu',{flow:true}),state={target:{name:'frame'},viewport:new T.Vector4(1,2,300,200),scissor:new T.Vector4(2,3,100,90)},original={...state,viewport:state.viewport.clone(),scissor:state.scissor.clone()},draws=[];
 const renderer={extensions:{has:()=>true},xr:{enabled:true},autoClear:false,getRenderTarget:()=>state.target,getActiveCubeFace:()=>2,getActiveMipmapLevel:()=>1,getViewport:v=>v.copy(state.viewport),getScissor:v=>v.copy(state.scissor),getScissorTest:()=>true,setRenderTarget:t=>{state.target=t;},setViewport:v=>state.viewport.copy(v),setScissor:v=>state.scissor.copy(v),setScissorTest(){},render:scene=>draws.push({copy:Boolean(scene.children[0].material.uniforms.image),shader:scene.children[0].material.fragmentShader,mix:rig.flow.uniforms.uFlowMix.value,target:state.target})};
 try{
  rig.prepare(renderer,1,0);assert.equal(draws.length,4);draws.length=0;rig.texture.needsUpdate=true;rig.prepare(renderer,.25,1);
  assert.equal(draws.length,5);assert.equal(draws[0].copy,true);assert.ok(draws.slice(1).every(d=>d.mix===1));assert.ok(draws.every(d=>!d.shader.includes('uPreviousFlowGrid')),'endpoint passes must have no framebuffer feedback sampler');assert.equal(rig.flow.uniforms.uFlowMix.value,.25);assert.notEqual(rig.flow.uniforms.uPreviousFlowGrid.value,rig.flow.uniforms.uFlowGrid.value);
  assert.equal(state.target,original.target);assert.deepEqual(state.viewport,original.viewport);assert.deepEqual(state.scissor,original.scissor);assert.equal(renderer.xr.enabled,true);assert.equal(renderer.autoClear,false);
  draws.length=0;rig.prepare(renderer,.75,1);assert.equal(draws.length,0);assert.equal(rig.flow.uniforms.uFlowMix.value,.75);
 }finally{rig.dispose();}
});
