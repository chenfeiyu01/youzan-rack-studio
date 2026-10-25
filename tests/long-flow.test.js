import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FLOW_CAGE,createFlowReference} from '../src/surface-flow-grid.js';
import {makeSurfaceWeights} from '../src/surface-bindings.js';
import {createSurfaceRig} from '../src/surface-rig.js';
import {HangingMotion} from '../src/physics.js';
import {catalog} from '../src/catalog.js';
import {placeGarmentModel} from '../src/model-space.js';
import {modelConfig} from '../src/model-config.js';
const read=file=>JSON.parse(readFileSync(new URL(file,import.meta.url))),data=read('../public/models/hanging-long-sleeve-simulation.json');

test('all long-sleeve layers share the exact affine cells instead of spanning nonlinear bends',async()=>{
 const bytes=readFileSync(new URL('../public/models/hanging-long-sleeve.glb',import.meta.url)),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');placeGarmentModel(asset.scene,modelConfig.longSleeve);
 const {dimensions:d,min:lo,max:hi}=FLOW_CAGE,step=lo.map((v,k)=>(hi[k]-v)/(d[k]-1)),meshes=[];
 asset.scene.traverse(o=>{if(o.isMesh&&o.name.startsWith('Fabric'))meshes.push(o);});assert.equal(meshes.length,3);let checked=0,fixed=0;
 for(const mesh of meshes){assert.deepEqual(mesh.userData.deformationCage,FLOW_CAGE,mesh.name+' must share the runtime deformation grid');const g=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);const p=g.attributes.position,index=g.index;
  for(let face=0;face<index.count;face+=3){const points=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,index.getX(face+k)).toArray());if(points.every(p=>p[1]>=hi[1]-1e-7)){fixed++;continue;}
   const q=points.map(p=>p.map((v,k)=>(v-lo[k])/step[k])),centroid=[0,1,2].map(k=>q.reduce((s,p)=>s+p[k],0)/3),cell=centroid.map((v,k)=>Math.min(d[k]-2,Math.floor(v))),f=centroid.map((v,k)=>v-cell[k]),order=[0,1,2].sort((a,b)=>f[b]-f[a]);
   for(const point of q){const r=point.map((v,k)=>v-cell[k]);assert.ok(r.every(v=>v>=-1e-5&&v<=1+1e-5),mesh.name+' face '+face/3+' crosses a cube');assert.ok(r[order[0]]+1e-5>=r[order[1]]&&r[order[1]]+1e-5>=r[order[2]],mesh.name+' face '+face/3+' crosses a tetrahedron');}checked++;
  }g.dispose();
 }assert.ok(checked>200000&&fixed>5000,'exercise the full outer cloth, inner cloth, trim and fixed shoulders');
});

function det(fn,p){const h=.0005,columns=[];for(let k=0;k<3;k++){const a=p.slice(),b=p.slice();a[k]+=h;b[k]-=h;const u=fn(a),v=fn(b);columns.push(new T.Vector3(...u.map((x,j)=>(x-v[j])/(2*h))));}return columns[0].dot(columns[1].cross(columns[2]));}
test('the real long-sleeve reversal no longer inverts the display field near the spotted front panel',()=>{
 const fixture=read('./fixtures/long-sleeve-reversal-field.json'),offsets=new Float32Array(fixture.offsets),bind=makeSurfaceWeights(data),old=p=>{const t=T.MathUtils.clamp((p[1]-.3)/.25,0,1),free=1-t*t*(3-2*t),out=p.slice();for(const b of bind(p))for(let k=0;k<3;k++)out[k]+=Math.fround(b.w)*offsets[b.id*3+k]*free;return out;},flow=createFlowReference(data);flow.update(offsets,3);const now=p=>p.map((v,k)=>v+flow.sample(...p)[k]);
 assert.ok(det(old,fixture.point)<-.25,'the frozen actual field must reproduce the original inversion');assert.ok(det(now,fixture.point)>.1,'the corresponding displayed volume must preserve orientation');
 for(const p of[[0,.735,.1],[0,1.03,-.1],[-.6,.55,.03]])assert.deepEqual([...flow.sample(...p)],[0,0,0],'collar and hanger support stay fixed');
});

const determinant=(a,b,c)=>a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);
test('both long-sleeve fabrics keep positive volume through repeated reversals and retain distinct responses',t=>{
 const flow=createFlowReference(data),[nx,ny,nz]=flow.dimensions,base=flow.shared.positions,permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]],cells=[];
 for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++)for(const order of permutations){const c=[x,y,z],ids=[];for(let i=0;i<4;i++){if(i)c[order[i-1]]++;ids.push(c[2]*ny*nx+c[1]*nx+c[0]);}const p=ids.map(i=>Array.from(base.slice(i*3,i*3+3)));cells.push({ids,rest:determinant(...[1,2,3].map(i=>p[i].map((v,k)=>v-p[0][k])))});}
 const positions=new Float64Array(base.length),traces=[];let samples=0,minimumAll=Infinity,worst;
 for(const item of catalog.filter(item=>item.type==='longSleeve')){const rig=createSurfaceRig(data,item.motion,'long-cage-'+item.id,{flow:true}),motion=new HangingMotion(0,0,true,item.motion),trace=[];
  try{for(let frame=0;frame<180;frame++){const stage=Math.floor(frame/12)%6;motion.step([0,0,.66,-.66,0,0][stage],stage===4?0:.35,[0,Math.PI,0,Math.PI,-1.43,0][stage],1/60,false,stage===4?1.56:1.94);rig.update(1/60,{x:motion.x.value,y:motion.y.value,z:motion.z.value,yaw:motion.yaw.value,roll:motion.roll.value,pitch:motion.pitch.value},false);rig.sync();const field=flow.update(rig.texture.image.data);
   for(let i=0;i<base.length/3;i++)for(let k=0;k<3;k++)positions[i*3+k]=base[i*3+k]+field[i*4+k];let minimum=Infinity;
   for(const{ids,rest}of cells){const a=ids[0]*3,b=ids[1]*3,c=ids[2]*3,d=ids[3]*3,ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2],vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2],wx=positions[d]-positions[a],wy=positions[d+1]-positions[a+1],wz=positions[d+2]-positions[a+2];minimum=Math.min(minimum,(ux*(vy*wz-vz*wy)-uy*(vx*wz-vz*wx)+uz*(vx*wy-vy*wx))/rest);}
   if(minimum<minimumAll){minimumAll=minimum;worst={id:item.id,frame};}assert.ok(minimum>0,item.id+' frame '+frame+': minimum relative cage volume '+minimum);trace.push(...flow.sample(-.695,-.676,.109));samples++;
  }}finally{rig.dispose();}traces.push(trace);
 }assert.equal(samples,360);const rms=Math.sqrt(traces[0].reduce((sum,v,i)=>sum+(v-traces[1][i])**2,0)/traces[0].length);assert.ok(rms>.001,'thick and soft cloth keep different displayed motion');t.diagnostic(JSON.stringify({samples,minimumAll,worst,profileOffsetRMS:rms}));
});
