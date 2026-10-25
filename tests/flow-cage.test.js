import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FLOW_CAGE,createFlowReference} from '../src/surface-flow-grid.js';
import {createSurfaceRig} from '../src/surface-rig.js';
import {HangingMotion} from '../src/physics.js';
import {catalog} from '../src/catalog.js';
const data=JSON.parse(readFileSync(new URL('../public/models/short-sleeve-simulation.json',import.meta.url)));

test('every displayed short-sleeve triangle lies within one affine deformation cell',async()=>{
 const bytes=readFileSync(new URL('../public/models/short-sleeve.glb',import.meta.url));
 const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 asset.scene.updateMatrixWorld(true);let mesh;asset.scene.traverse(o=>{if(o.name==='Fabric')mesh=o;});
 assert.deepEqual(mesh.userData.deformationCage,FLOW_CAGE,'offline mesh and runtime field must use the same cage');
 const box=new T.Box3().setFromObject(asset.scene),center=box.getCenter(new T.Vector3()),scale=2.48/box.getSize(new T.Vector3()).y;
 const g=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);g.scale(scale,scale,scale);g.translate(-center.x*scale,.98-box.max.y*scale,-center.z*scale);
 const p=g.attributes.position,index=g.index,{dimensions:d,min:lo,max:hi}=FLOW_CAGE,step=lo.map((v,k)=>(hi[k]-v)/(d[k]-1));let checked=0,top=0;
 for(let f=0;f<index.count;f+=3){
  const points=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,index.getX(f+j)).toArray());
  if(points.every(v=>v[1]>=hi[1]-1e-7)){top++;continue;}
  const q=points.map(p=>p.map((v,k)=>(v-lo[k])/step[k])),center=[0,1,2].map(k=>q.reduce((s,p)=>s+p[k],0)/3),cell=center.map((v,k)=>Math.min(d[k]-2,Math.floor(v))),frac=center.map((v,k)=>v-cell[k]),order=[0,1,2].sort((a,b)=>frac[b]-frac[a]);
  for(const point of q){const r=point.map((v,k)=>v-cell[k]);assert.ok(r.every(v=>v>=-1e-5&&v<=1+1e-5),`face ${f/3} spans multiple cubes`);assert.ok(r[order[0]]+1e-5>=r[order[1]]&&r[order[1]]+1e-5>=r[order[2]],`face ${f/3} spans multiple tetrahedra`);}
  checked++;
 }
 assert.ok(checked>100000&&top>3000,'exercise the complete production mesh and fixed shoulder');g.dispose();
});

const determinant=(a,b,c)=>a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);
test('all short-sleeve fabric profiles retain positive cage volumes during repeated reversals',t=>{
 const flow=createFlowReference(data),[nx,ny,nz]=flow.dimensions,base=flow.shared.positions,permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]],cells=[];
 for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++)for(const permutation of permutations){
  const c=[x,y,z],ids=[];for(let j=0;j<4;j++){if(j)c[permutation[j-1]]++;ids.push(c[2]*ny*nx+c[1]*nx+c[0]);}
  const points=ids.map(i=>Array.from(base.slice(i*3,i*3+3))),edges=[1,2,3].map(i=>points[i].map((v,k)=>v-points[0][k]));cells.push({ids,rest:determinant(...edges)});
 }
 let samples=0,minimumAll=Infinity,worst=null;const positions=new Float64Array(base.length);
 for(const item of catalog.filter(item=>item.type==='shortSleeve')){
  const rig=createSurfaceRig(data,item.motion,'cage-'+item.id,{flow:true}),motion=new HangingMotion(0,0,false,item.motion);
  try{for(let frame=0;frame<180;frame++){
   const stage=Math.floor(frame/12)%6;motion.step([0,0,.66,-.66,0,0][stage],stage===4?0:.35,[0,Math.PI,0,Math.PI,-1.43,0][stage],1/60,false,stage===4?1.56:1.94);
   rig.update(1/60,{x:motion.x.value,y:motion.y.value,z:motion.z.value,yaw:motion.yaw.value,roll:motion.roll.value,pitch:motion.pitch.value},false);rig.sync();
   const field=flow.update(rig.texture.image.data);for(let i=0;i<base.length/3;i++)for(let k=0;k<3;k++)positions[i*3+k]=base[i*3+k]+field[i*4+k];let minimum=Infinity;
   for(const {ids,rest} of cells){
    const a=ids[0]*3,b=ids[1]*3,c=ids[2]*3,d=ids[3]*3;
    const ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2],vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2],wx=positions[d]-positions[a],wy=positions[d+1]-positions[a+1],wz=positions[d+2]-positions[a+2];
    minimum=Math.min(minimum,(ux*(vy*wz-vz*wy)-uy*(vx*wz-vz*wx)+uz*(vx*wy-vy*wx))/rest);
   }
   if(minimum<minimumAll){minimumAll=minimum;worst={id:item.id,frame};}
   assert.ok(minimum>0,`${item.id} frame ${frame}: minimum relative cage volume ${minimum}`);samples++;
  }}finally{rig.dispose();}
 }
 t.diagnostic(JSON.stringify({samples,minimumAll,worst}));
 assert.equal(samples,catalog.filter(item=>item.type==='shortSleeve').length*180);
});
