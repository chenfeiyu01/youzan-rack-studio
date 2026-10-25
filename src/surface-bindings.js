// Preserve the established displacement field. Central surface probes include
// changes in support radius and neighbor membership, which the old analytic
// derivative incorrectly held constant. Coefficients are baked once per mesh.
// .04 model units is about 11 mm: resolve dynamic orientation at cloth mesh
// scale while retaining the original fine folds and photographed yarn normal map.
const PROBE_STEP=.04,cache=new WeakMap();
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=a=>{const length=Math.hypot(...a)||1;return a.map(v=>v/length);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function tree(p,ids,depth=0){if(!ids.length)return null;const axis=depth%3;ids.sort((a,b)=>p[a*3+axis]-p[b*3+axis]);const m=ids.length>>1;return{id:ids[m],axis,left:tree(p,ids.slice(0,m),depth+1),right:tree(p,ids.slice(m+1),depth+1)};}
function nearest(t,p,q,out){if(!t)return;const i=t.id*3,r=[q[0]-p[i],q[1]-p[i+1],q[2]-p[i+2]],d=dot(r,r);out.push({id:t.id,d});out.sort((a,b)=>a.d-b.d);if(out.length>12)out.pop();const diff=r[t.axis];nearest(diff<0?t.left:t.right,p,q,out);if(out.length<12||diff*diff<out.at(-1).d)nearest(diff<0?t.right:t.left,p,q,out);}
export function makeSurfaceBinder(data){
 if(cache.has(data))return cache.get(data);
 const p=data.positions,spatial=tree(p,Array.from({length:p.length/3},(_,i)=>i)),points=new Map();
 const weightsAt=point=>{
  const near=[];nearest(spatial,p,point,near);const radius=Math.max(.0001,Math.sqrt(near.at(-1).d)*1.0001),weights=near.map(({d})=>{const s=Math.max(0,Math.min(1,Math.sqrt(d)/radius));return(1-s)**4*(1+4*s);}),total=Math.max(1e-6,weights.reduce((a,b)=>a+b,0));
  return near.map((v,i)=>({id:v.id,w:weights[i]/total}));
 };
 const binder=(point,normal)=>{
  const key=point.map(v=>Math.round(v*1e6)).join(':');if(points.has(key))return points.get(key);
  const n=Math.hypot(...normal)>1e-8?unit(normal):[0,0,1],reference=Math.abs(n[0])<.8?[1,0,0]:[0,1,0],u=unit(cross(reference,n)),v=cross(n,u),epsilon=PROBE_STEP,records=new Map();
  const add=(sample,channel,factor)=>{for(const{id,w}of sample){if(!records.has(id))records.set(id,[0,0,0]);records.get(id)[channel]+=w*factor;}};
  add(weightsAt(point),0,1);
  for(const[direction,channel]of[[u,1],[v,2]])for(const sign of[-1,1])add(weightsAt(point.map((x,k)=>x+sign*epsilon*direction[k])),channel,sign/(2*epsilon));
  const ids=[...records.keys()],coefficients=new Float32Array(ids.length*4);
  ids.forEach((id,i)=>{coefficients.set(records.get(id),i*4);coefficients[i*4+3]=id;});
  const result={ids,u,v,coefficients};points.set(key,result);return result;
 };
 binder.weightsAt=weightsAt;cache.set(data,binder);return binder;
}

// Surface orientation comes from geometry, not the authored shading normal.
// UV duplicates share an area-weighted reference frame; authored normals are
// retained separately and rotate with that frame during cloth deformation.
export function surfaceReferenceNormals(positions,indices){
 const count=positions.length/3,raw=new Float64Array(positions.length),out=new Float32Array(positions.length),groups=new Map(),index=i=>indices?indices[i]:i;
 for(let i=0;i<(indices?.length??count);i+=3){const a=index(i)*3,b=index(i+1)*3,c=index(i+2)*3,u=[positions[b]-positions[a],positions[b+1]-positions[a+1],positions[b+2]-positions[a+2]],v=[positions[c]-positions[a],positions[c+1]-positions[a+1],positions[c+2]-positions[a+2]],n=cross(u,v);for(const j of[a,b,c])for(let k=0;k<3;k++)raw[j+k]+=n[k];}
 for(let i=0;i<count;i++){const key=[0,1,2].map(k=>Math.round(positions[i*3+k]*1e6)).join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}
 for(const ids of groups.values()){const first=ids.find(i=>Math.hypot(...raw.slice(i*3,i*3+3))>1e-12)??ids[0],base=unit(Array.from(raw.slice(first*3,first*3+3))),sum=[0,0,0];for(const id of ids){const normal=Array.from(raw.slice(id*3,id*3+3));if(dot(unit(normal),base)>.5)for(let k=0;k<3;k++)sum[k]+=normal[k];}const n=Math.hypot(...sum)>1e-12?unit(sum):[0,0,1];for(const id of ids)out.set(n,id*3);}
 return out;
}

// Position-only weights share the spatial tree without baking normal probes.
export function makeSurfaceWeights(data){return makeSurfaceBinder(data).weightsAt;}
