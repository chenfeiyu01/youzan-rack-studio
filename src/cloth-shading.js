// Join split shading normals only where coincident cloth corners already
// describe a smooth geometric surface. Keep sharp folds and degenerate fans.
const SAME_SURFACE=Math.cos(5*Math.PI/180),SMOOTH_FAN=Math.cos(30*Math.PI/180);
export function repairClothShading(geometry){
 const p=geometry.attributes.position,n=geometry.attributes.normal,index=geometry.index;
 if(!p||!n||p.count!==n.count)return{changed:0,groups:0};
 const count=p.count,sums=new Float64Array(count*3),areas=new Float64Array(count),fan=new Float64Array(count).fill(1),groups=new Map(),ids=new Int32Array(3),cross=new Float64Array(3);
 const face=f=>{
  for(let k=0;k<3;k++)ids[k]=index?index.getX(f+k):f+k;
  const[a,b,c]=ids,ux=p.getX(b)-p.getX(a),uy=p.getY(b)-p.getY(a),uz=p.getZ(b)-p.getZ(a),vx=p.getX(c)-p.getX(a),vy=p.getY(c)-p.getY(a),vz=p.getZ(c)-p.getZ(a);
  cross[0]=uy*vz-uz*vy;cross[1]=uz*vx-ux*vz;cross[2]=ux*vy-uy*vx;return Math.hypot(...cross);
 };
 for(let f=0;f+2<(index?.count??count);f+=3){const area=face(f);if(area<1e-12)continue;for(const id of ids){areas[id]+=area;for(let k=0;k<3;k++)sums[id*3+k]+=cross[k];}}
 for(let id=0;id<count;id++){
  const i=id*3,length=Math.hypot(sums[i],sums[i+1],sums[i+2]);if(length<1e-12)continue;
  for(let k=0;k<3;k++)sums[i+k]/=length;
  const key=[p.getX(id),p.getY(id),p.getZ(id)].map(v=>Math.round(v*1e6)).join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(id);
 }
 for(let f=0;f+2<(index?.count??count);f+=3){const area=face(f);if(area<1e-12)continue;for(const id of ids){const i=id*3;fan[id]=Math.min(fan[id],(cross[0]*sums[i]+cross[1]*sums[i+1]+cross[2]*sums[i+2])/area);}}
 let changed=0,joined=0,maxAngle=0;
 for(const all of groups.values()){
  const valid=all.filter(id=>fan[id]>=SMOOTH_FAN&&areas[id]>1e-12&&[n.getX(id),n.getY(id),n.getZ(id)].every(Number.isFinite)&&Math.hypot(n.getX(id),n.getY(id),n.getZ(id))>1e-12);if(valid.length<2)continue;
  const parent=valid.map((_,i)=>i),root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
  for(let a=0;a<valid.length;a++)for(let b=0;b<a;b++){
   const i=valid[a]*3,j=valid[b]*3;if(sums[i]*sums[j]+sums[i+1]*sums[j+1]+sums[i+2]*sums[j+2]>=SAME_SURFACE)parent[root(a)]=root(b);
  }
  const parts=new Map();for(let i=0;i<valid.length;i++){const key=root(i);if(!parts.has(key))parts.set(key,[]);parts.get(key).push(valid[i]);}
  for(const vertices of parts.values()){
   if(vertices.length<2)continue;const normals=vertices.map(id=>{const x=n.getX(id),y=n.getY(id),z=n.getZ(id),length=Math.hypot(x,y,z)||1;return[x/length,y/length,z/length];}),base=normals[0];
   if(normals.every(v=>base[0]*v[0]+base[1]*v[1]+base[2]*v[2]>1-1e-6))continue;
   const average=[0,0,0];normals.forEach((v,i)=>{for(let k=0;k<3;k++)average[k]+=v[k]*areas[vertices[i]];});const length=Math.hypot(...average);if(length<1e-12)continue;
   for(let k=0;k<3;k++)average[k]/=length;
   normals.forEach((v,i)=>{const angle=Math.acos(Math.max(-1,Math.min(1,v[0]*average[0]+v[1]*average[1]+v[2]*average[2])));maxAngle=Math.max(maxAngle,angle);n.setXYZ(vertices[i],...average);changed++;});joined++;
  }
 }
 if(changed)n.needsUpdate=true;return{changed,groups:joined,maxAngleDegrees:maxAngle*180/Math.PI};
}
