import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{initializeContactKernel,contactKernelAvailable,findContactCandidates,ContactCandidateCache}from'../src/contact-kernel.js';
import{SurfaceCloth}from'../src/surface-physics.js';import{garmentSimulation}from'../src/garment-form.js';import{HangingMotion}from'../src/physics.js';import{RackHoverMotion}from'../src/rack-hover-motion.js';import{catalog}from'../src/catalog.js';import{modelConfig}from'../src/model-config.js';
await test('invalid compiled bytes retain JS fallback and a valid binary can recover',async()=>{
 assert.equal(contactKernelAvailable(),false);assert.equal(await initializeContactKernel(new Uint8Array([0,1,2])),false);assert.equal(contactKernelAvailable(),false);
 assert.equal(await initializeContactKernel(readFileSync(new URL('../src/contact-kernel.wasm',import.meta.url))),true);assert.equal(contactKernelAvailable(),true);
});
const overlaps=(a,i,b,j)=>!(a[i]>b[j+3]||a[i+3]<b[j]||a[i+1]>b[j+4]||a[i+4]<b[j+1]||a[i+2]>b[j+5]||a[i+5]<b[j+2]);
function verify(queries,queryActive,bounds,active,masks,self=false,cell=.18){
 const result=findContactCandidates(queries,queryActive,bounds,active,cell,masks,self);assert.ok(result);assert.ok(result.bytes<=8*1024*1024);assert.ok(result.cell<=cell);const words=Math.ceil(active.length/32);
 for(let q=0;q<queryActive.length;q++){
  const expected=[];if(queryActive[q])for(let other=self?q+1:0;other<active.length;other++)if(active[other]&&!(masks[q*words+(other>>>5)]&(1<<(other&31)))&&overlaps(queries,q*6,bounds,other*6))expected.push(other);
  const actual=Array.from(result.indices.subarray(result.offsets[q],result.offsets[q+1]));assert.equal(new Set(actual).size,actual.length);assert.deepEqual(actual.sort((a,b)=>a-b),expected);
 }
 return result;
}
test('compiled broad phase matches brute force across masks, high bits, scaling, hash boundaries and shared-arena reuse',()=>{
 let seed=1182;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(const[scale,origin]of[[1,0],[.2,-.35],[3.6,1024*.18],[1,0]]){
  const queries=new Float64Array(73*6),bounds=new Float64Array(97*6),qa=new Uint8Array(73),active=new Uint8Array(97),masks=new Uint32Array(73*4);
  for(const[array,flags]of[[queries,qa],[bounds,active]])for(let id=0;id<flags.length;id++){flags[id]=id%4!==0;for(let k=0;k<3;k++){array[id*6+k]=origin+(random()-.5)*.8*scale;array[id*6+3+k]=array[id*6+k]+(.01+random()*.15)*scale;}}
  for(let q=0;q<qa.length;q++)for(let id=0;id<active.length;id++)if((q+id)%7===0)masks[q*4+(id>>>5)]|=1<<(id&31);
  verify(queries,qa,bounds,active,masks,false,.18*scale);
  const pairs=new Uint32Array(97*4);for(let id=0;id<pairs.length;id++)pairs[id]=(id%3===0?0x80000001:0);
  verify(bounds,active,bounds,active,pairs,true,.18*scale);
 }
});
test('oversized, invalid and dense-overflow searches fall back without corrupting the next search',()=>{
 const active=new Uint8Array(400).fill(1),b=new Float64Array(400*6),masks=new Uint32Array(400*13);
 for(let id=0;id<400;id++)b.set([0,0,0,.01,.01,.01],id*6);
 assert.equal(findContactCandidates(b,active,b,active,.18,masks),null,'pair-budget overflow');
 const small=b.slice(0,12),sa=new Uint8Array(2).fill(1),sm=new Uint32Array(2);verify(small,sa,small,sa,sm,true);
 small[6]=small[9]=500;assert.equal(findContactCandidates(small,sa,small,sa,.18,sm,true),null,'sparse oversized domain');
 small[6]=small[9]=NaN;assert.equal(findContactCandidates(small,sa,small,sa,.18,sm,true),null);
 assert.equal(findContactCandidates(new Float32Array(12),sa,new Float32Array(12),sa,.18,sm),null);
});
test('compiled search preserves complete short and long cloth trajectories and ordered contacts byte for byte',()=>{
 for(const index of[0,4,5]){
  const item=catalog[index],data=garmentSimulation(JSON.parse(readFileSync(new URL('../public'+modelConfig[item.type].simulation,import.meta.url))),item),a=new SurfaceCloth(data,item.motion),b=new SurfaceCloth(data,item.motion),motion=new HangingMotion(0,-1.43,item.type==='longSleeve',item.motion),hover=new RackHoverMotion();a.contacts.compiledCandidates=false;motion.y.snap(1.65);let used=0;
  for(const key of['compiledFaceContacts','compiledEdgeContacts']){const fn=b.contacts[key].bind(b.contacts);b.contacts[key]=(...args)=>{const out=fn(...args);if(out)used++;return out;};}
  const init={x:0,y:1.65,z:0,yaw:-1.43};a.advance(1/60,init);b.advance(1/60,init);
  for(let frame=0;frame<105;frame++){
   const plan=hover.plan(Math.floor(frame/45)%2?null:0,[motion],1/60);motion.step(0,0,plan.yaws[0],1/60,false,1.65,true,plan.drive);const pose={x:0,y:1.65,z:0,yaw:motion.yaw.value,roll:motion.roll.value,pitch:motion.pitch.value};a.advance(1/60,pose);b.advance(1/60,pose);
   for(const field of['position','previous','velocity','target','local','offsets','normal'])assert.deepEqual(b[field],a[field],index+':'+frame+':'+field);assert.deepEqual(b.contacts.contacts,a.contacts.contacts,index+':'+frame+':contacts');
  }
  assert.ok(used>100,'the accelerated path must actually run');
 }
});

test('cached swept envelopes rebuild on escape and newly active primitives while preserving every pair',()=>{
 const n=65,flags=new Uint8Array(n).fill(1),bounds=new Float64Array(n*6),masks=new Uint32Array(n*3),cache=new ContactCandidateCache();
 for(let i=0;i<n;i++)bounds.set([i*.008,0,0,i*.008+.018,.02,.02],i*6);
 flags[7]=0;
 for(let frame=0;frame<24;frame++){
  if(frame===3)flags[7]=1;if(frame===6)masks[2*3]|=1<<6;if(frame===9)bounds[12]+=.1;
  for(let i=0;i<n;i++){bounds[i*6]+=.001;bounds[i*6+3]+=.001;if(bounds[i*6]>bounds[i*6+3])bounds[i*6+3]=bounds[i*6]+.018;}
  const a=cache.find(bounds,flags,bounds,flags,.18,masks,true),actual=Array.from({length:n},(_,i)=>Array.from(a.indices.subarray(a.offsets[i],a.offsets[i+1])).sort((a,b)=>a-b));
  const b=findContactCandidates(bounds,flags,bounds,flags,.18,masks,true),expected=Array.from({length:n},(_,i)=>Array.from(b.indices.subarray(b.offsets[i],b.offsets[i+1])).sort((a,b)=>a-b));
  assert.deepEqual(actual,expected);
 }
 assert.ok(cache.reuses>10);assert.ok(cache.builds>=3);
});
