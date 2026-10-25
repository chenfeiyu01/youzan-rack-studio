import{CageVolumeProjection}from'./surface-volume.js';
// Exponentiate the smooth cloth displacement on a fixed lattice. Three
// scaling-and-squaring steps compose small maps instead of flipping thin walls.
// Both normalized assets are embedded in these same affine display cells.
import {makeSurfaceWeights} from './surface-bindings.js';
export const FLOW_CAGE=Object.freeze({kind:'freudenthal',dimensions:Object.freeze([16,24,8]),min:Object.freeze([-1.35,-2,-.65]),max:Object.freeze([1.35,.55,.65])});
const cache=new WeakMap();
export function makeFlowLayout(data){return createFlowReference(data,true);}

export function createFlowReference(data,layoutOnly=false){
 const [nx,ny,nz]=FLOW_CAGE.dimensions,count=nx*ny*nz,lo=FLOW_CAGE.min,hi=FLOW_CAGE.max,step=lo.map((v,k)=>(hi[k]-v)/([nx,ny,nz][k]-1));
 let shared=cache.get(data);
 if(!shared){const bind=makeSurfaceWeights(data),ids=new Uint16Array(count*12),weights=new Float32Array(count*12),positions=new Float32Array(count*3),supportLo=[Infinity,Infinity,Infinity],supportHi=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<data.positions.length;i++){const k=i%3;supportLo[k]=Math.min(supportLo[k],data.positions[i]-.04);supportHi[k]=Math.max(supportHi[k],data.positions[i]+.04);}
  let row=0;
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
   const q=[x*step[0]+lo[0],y*step[1]+lo[1],z*step[2]+lo[2]];
   // The cloth has no velocity samples in the surrounding empty space.
   // Extend the supported field constantly rather than changing nearest
   // neighbors far outside the garment and creating an artificial curl.
   const b=bind(q.map((v,k)=>Math.max(supportLo[k],Math.min(supportHi[k],v)))),t=Math.max(0,Math.min(1,(q[1]-.30)/.25)),free=1-t*t*(3-2*t);positions.set(q,row*3);for(let j=0;j<b.length;j++){ids[row*12+j]=b[j].id;weights[row*12+j]=b[j].w*free;}row++;
  }shared={ids,weights,positions};cache.set(data,shared);
 }
 if(layoutOnly)return {...shared,dimensions:[nx,ny,nz],lo,hi,step};
 const projection=data.type==='longSleeve'?new CageVolumeProjection({...shared,dimensions:[nx,ny,nz],hi}):null;
 const fields=[new Float32Array(count*4),new Float32Array(count*4)],tmp=new Float64Array(3),{ids,weights,positions}=shared;
 function sample(field,px,py,pz,out){
  const x=Math.max(0,Math.min(nx-1,(px-lo[0])/step[0])),y=Math.max(0,Math.min(ny-1,(py-lo[1])/step[1])),z=Math.max(0,Math.min(nz-1,(pz-lo[2])/step[2])),ix=Math.min(nx-2,Math.floor(x)),iy=Math.min(ny-2,Math.floor(y)),iz=Math.min(nz-2,Math.floor(z)),fx=x-ix,fy=y-iy,fz=z-iz;
  let a=0,b=0,c=0;for(let dz=0;dz<2;dz++)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
   const w=(dx?fx:1-fx)*(dy?fy:1-fy)*(dz?fz:1-fz),j=((iz+dz)*ny*nx+(iy+dy)*nx+ix+dx)*4;a+=field[j]*w;b+=field[j+1]*w;c+=field[j+2]*w;
  }out[0]=a;out[1]=b;out[2]=c;return out;
 }
 let result=fields[0];
 return{dimensions:[nx,ny,nz],lo,hi,step,shared,
  update(offsets,stride=4){
   const initial=fields[0];
   for(let i=0;i<count;i++){let x=0,y=0,z=0;const k=i*12;for(let j=0;j<12;j++){const id=ids[k+j]*stride,w=weights[k+j];x+=offsets[id]*w;y+=offsets[id+1]*w;z+=offsets[id+2]*w;}initial[i*4]=x/8;initial[i*4+1]=y/8;initial[i*4+2]=z/8;}
   for(let pass=0;pass<3;pass++){
    const source=fields[pass%2],target=fields[(pass+1)%2];
    for(let i=0;i<count;i++){const j=i*4,k=i*3;sample(source,positions[k]+source[j],positions[k+1]+source[j+1],positions[k+2]+source[j+2],tmp);target[j]=source[j]+tmp[0];target[j+1]=source[j+1]+tmp[1];target[j+2]=source[j+2]+tmp[2];}
   }result=fields[1];projection?.project(result);return result;
  },
  sample(px,py,pz,out=new Float64Array(3)){
 const q=[px,py,pz].map((v,k)=>Math.max(0,Math.min([nx,ny,nz][k]-1,(v-lo[k])/step[k]))),cell=q.map((v,k)=>Math.min([nx,ny,nz][k]-2,Math.floor(v))),f=q.map((v,k)=>v-cell[k]),order=[0,1,2].sort((a,b)=>f[b]-f[a]),weights=[1-f[order[0]],f[order[0]]-f[order[1]],f[order[1]]-f[order[2]],f[order[2]]],c=cell.slice();out.fill(0);
 for(let i=0;i<4;i++){if(i)c[order[i-1]]++;const j=(c[2]*ny*nx+c[1]*nx+c[0])*4;for(let k=0;k<3;k++)out[k]+=result[j+k]*weights[i];}return out;
 },
  get pixels(){return result;},get projectionStats(){return projection?.lastStats;},
 };
}
