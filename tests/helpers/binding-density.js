import {fabricRepeat} from '../../src/fabric-textures.js';
import {MODEL_METRES} from '../../src/model-config.js';

// Measure physical scan density separately on each indexed strip. A global
// median alone can hide one cuff whose UVs are much denser than the other bands.
export function bindingDensity(geometry,patchMetres=.2638) {
  const p=geometry.attributes.position,uv=geometry.attributes.uv,index=geometry.index;
  const parent=Int32Array.from({length:p.count},(_,i)=>i);
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  for(let f=0;f<index.count;f+=3) {
    const a=find(index.getX(f));
    parent[find(index.getX(f+1))]=a;parent[find(index.getX(f+2))]=a;
  }
  const groups=new Map(),repeat=fabricRepeat(geometry,patchMetres);
  for(let f=0;f<index.count;f+=3) {
    const ids=[0,1,2].map(k=>index.getX(f+k)),root=find(ids[0]);
    if(!groups.has(root))groups.set(root,{vertices:new Set(),rows:[]});
    const group=groups.get(root);ids.forEach(i=>group.vertices.add(i));
    const points=ids.map(i=>[p.getX(i),p.getY(i),p.getZ(i)]);
    const a=points[1].map((v,k)=>v-points[0][k]),b=points[2].map((v,k)=>v-points[0][k]);
    const area=Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])*.5;
    const [i,j,k]=ids,uvArea=Math.abs((uv.getX(j)-uv.getX(i))*(uv.getY(k)-uv.getY(i))-(uv.getX(k)-uv.getX(i))*(uv.getY(j)-uv.getY(i)))*.5;
    if(area>0&&uvArea>0)group.rows.push({area,value:repeat*Math.sqrt(uvArea/area)*patchMetres/MODEL_METRES});
  }
  return [...groups.values()].map(group=>{
    const vertices=[...group.vertices],centroid=[0,1,2].map(k=>vertices.reduce((sum,i)=>sum+p.array[i*3+k],0)/vertices.length);
    const name=centroid[1]>.5?'neck':centroid[1]<-1.4?(centroid[0]<0?'cuff-left':'cuff-right'):'hem';
    const area=group.rows.reduce((sum,row)=>sum+row.area,0);group.rows.sort((a,b)=>a.value-b.value);
    const quantile=q=>{let sum=0;for(const row of group.rows){sum+=row.area;if(sum>=area*q)return row.value;}return group.rows.at(-1).value;};
    return {name,vertices,area,median:quantile(.5),p05:quantile(.05),p95:quantile(.95)};
  });
}
