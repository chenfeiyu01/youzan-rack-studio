import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createSurfaceRig} from '../src/surface-rig.js';
import {createFlowReference} from '../src/surface-flow-grid.js';
import {makeSurfaceBinder} from '../src/surface-bindings.js';
import {HangingMotion} from '../src/physics.js';
import {catalog} from '../src/catalog.js';
const read=f=>JSON.parse(readFileSync(new URL(f,import.meta.url))),data=read('../public/models/short-sleeve-simulation.json');
function det(sample,p){const h=.0005,columns=[];for(let k=0;k<3;k++){const a=p.slice(),b=p.slice();a[k]+=h;b[k]-=h;const u=sample(a),v=sample(b);columns.push(new T.Vector3(...u.map((x,j)=>(x-v[j])/(2*h))));}return columns[0].dot(columns[1].cross(columns[2]));}
function cross(a,b){const ray=new T.Ray(),d=new T.Vector3(),hit=new T.Vector3();for(const[t,other]of[[a,b],[b,a]])for(let i=0;i<3;i++){d.subVectors(other[(i+1)%3],other[i]);const length=d.length();if(length<1e-8)continue;ray.set(other[i],d.divideScalar(length));if(ray.intersectTriangle(...t,false,hit)){const distance=hit.distanceTo(other[i]);if(distance>1e-6&&distance<length-1e-6)return true;}}return false;}
test('continuous transfer fixes the real negative local volume, preserves rest and fixes the collar',()=>{
 const flow=createFlowReference(data),zero=new Float32Array(data.positions.length);flow.update(zero,3);
 for(const p of[[.79,-.134,-.032],[-.8,-.1,.02],[0,.735,.163],[0,-1.5,.1]])assert.deepEqual([...flow.sample(...p)],[0,0,0]);
 const fixture=read('./fixtures/short-sleeve-turn-field.json'),offsets=new Float32Array(fixture.offsets),bind=makeSurfaceBinder(data);flow.update(offsets,3);
 const legacy=p=>{const b=bind(p,[0,0,1]),v=p.slice();for(let j=0;j<b.ids.length;j++)for(let k=0;k<3;k++)v[k]+=offsets[b.ids[j]*3+k]*b.coefficients[j*4];return v;},sample=p=>p.map((v,k)=>v+flow.sample(...p)[k]);
 assert.ok(det(legacy,fixture.point)<-.25,'the frozen source must reproduce the old inversion');assert.ok(det(sample,fixture.point)>.1,'local material volume must retain its orientation');
 for(const p of[[0,.735,.163],[0,.96,-.1],[.2,.55,.03]])assert.deepEqual([...flow.sample(...p)],[0,0,0]);
});
test('white and black reversal fields separate the saved source cuff patches',async()=>{
 const bytes=readFileSync(new URL('../public/models/short-sleeve.glb',import.meta.url)),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');asset.scene.updateMatrixWorld(true);let mesh;asset.scene.traverse(o=>{if(o.name==='Fabric')mesh=o;});const box=new T.Box3().setFromObject(asset.scene),center=box.getCenter(new T.Vector3()),scale=2.48/box.getSize(new T.Vector3()).y,g=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);g.scale(scale,scale,scale);g.translate(-center.x*scale,.98-box.max.y*scale,-center.z*scale);const p=g.attributes.position,cases=read('./fixtures/short-sleeve-turn-pairs.json'),flow=createFlowReference(data),traces=[];
 for(const index of[6,7]){const item=catalog[index],rig=createSurfaceRig(data,item.motion,'flow-regression',{flow:true}),motion=new HangingMotion(0,0,false,item.motion);for(let frame=0;frame<=63;frame++){
  const stage=Math.floor(frame/12)%6;motion.step([0,0,.66,-.66,0,0][stage],stage===4?0:.35,[0,Math.PI,0,Math.PI,-1.43,0][stage],1/60,false,stage===4?1.56:1.94);rig.update(1/60,{x:motion.x.value,y:motion.y.value,z:motion.z.value,yaw:motion.yaw.value,roll:motion.roll.value,pitch:motion.pitch.value},false);rig.sync();const sample=cases.find(c=>c.id===item.id&&c.frame===frame);if(!sample)continue;flow.update(rig.texture.image.data);const vertex=i=>{const q=new T.Vector3().fromBufferAttribute(p,i);return q.add(new T.Vector3(...flow.sample(q.x,q.y,q.z)));};assert.ok(sample.pairs.length>=14);for(const pair of sample.pairs)assert.equal(cross(...pair.map(t=>t.map(vertex))),false,`${item.id} ${frame} ${JSON.stringify(pair)}`);if(frame===38)traces.push(vertex(5234));
 }rig.dispose();}assert.ok(traces[0].distanceTo(traces[1])>.001,'different fabric profiles must keep different rendered responses');g.dispose();
});
test('flow composes cloth and depth and computes the same field without float render targets',()=>{
 const rig=createSurfaceRig(data,catalog[6].motion,'flow-material',{flow:true}),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,.1,0,0,0,-.1,0],3));geometry.computeVertexNormals();const material=new T.MeshPhysicalMaterial(),mesh=new T.Mesh(geometry,material);rig.bind(mesh);
 for(const m of[material,mesh.customDepthMaterial]){const lib=m===material?T.ShaderLib.physical:T.ShaderLib.depth,s={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};m.onBeforeCompile(s,{});assert.ok(s.vertexShader.includes('sampleFlowCloth(position);'));assert.equal(s.uniforms.uFlowGrid,rig.flow.uniforms.uFlowGrid);assert.equal(s.uniforms.uSurface.value,rig.texture);assert.ok(s.vertexShader.includes('vGarmentRest=position'));}
 const field=read('./fixtures/short-sleeve-turn-field.json'),source=rig.texture.image.data;
 for(let i=0;i<field.offsets.length/3;i++)for(let k=0;k<3;k++)source[i*4+k]=field.offsets[i*3+k];
 rig.texture.needsUpdate=true;rig.prepare({extensions:{has:()=>false}});
 const reference=createFlowReference(data);reference.update(source);
 assert.equal(rig.flow.uniforms.uFlowEnabled.value,1);assert.equal(rig.flow.supported,false);
 assert.deepEqual(rig.flow.uniforms.uFlowGrid.value.image.data,reference.pixels);
 assert.notEqual(rig.flow.uniforms.uFlowGrid.value,rig.texture);
 assert.equal(geometry.hasAttribute('clothBinding'),false,'flow must not allocate legacy per-vertex probe bindings');
 for(let i=0;i<geometry.attributes.position.count;i++){
  const u=new T.Vector3().fromBufferAttribute(geometry.attributes.clothTangent,i),v=new T.Vector3().fromBufferAttribute(geometry.attributes.clothBitangent,i);
  assert.ok(Math.abs(u.length()-1)<1e-6&&Math.abs(v.length()-1)<1e-6&&Math.abs(u.dot(v))<1e-6);
 }
 const previous=rig.flow.uniforms.uFlowGrid.value;source.fill(0);rig.texture.needsUpdate=true;rig.prepare({extensions:{has:()=>false}});
 assert.equal(rig.flow.uniforms.uFlowGrid.value,previous);assert.ok(previous.image.data.every(v=>v===0));
 rig.dispose();geometry.dispose();material.dispose();mesh.customDepthMaterial.dispose();
});
