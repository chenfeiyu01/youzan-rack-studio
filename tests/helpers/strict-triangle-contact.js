// Geometric regression check independent of the offline repair constraints.
// Count positive interior overlap, including coplanar area; shared edges and
// isolated boundary touches are allowed. Inputs are actual draw positions.
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=a=>Math.hypot(...a);
const plane=t=>{const n=cross(sub(t[1],t[0]),sub(t[2],t[0])),l=length(n);return l>1e-16?n.map(v=>v/l):null;};
function sharedBoundary(A,B,q){
 const shared=A.filter(a=>B.some(b=>length(sub(a,b))<1e-6));
 if(shared.some(p=>length(sub(q,p))<1e-6))return true;
 for(let i=0;i<shared.length;i++)for(let j=0;j<i;j++){
  const a=shared[j],d=sub(shared[i],a),l2=dot(d,d);if(l2<1e-20)continue;
  const t=Math.max(0,Math.min(1,dot(sub(q,a),d)/l2));
  if(length(sub(q,a.map((v,k)=>v+d[k]*t)))<1e-6)return true;
 }
 return false;
}
function clipPolygon(A,B){
 const side=(p,a,b)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
 const sign=Math.sign(B.reduce((s,p,i)=>s+p[0]*B[(i+1)%3][1]-B[(i+1)%3][0]*p[1],0))||1;let out=A;
 for(let i=0;i<3&&out.length;i++){
  const old=out;out=[];
  for(let k=0;k<old.length;k++){
   const p=old[k],q=old[(k+1)%old.length],a=side(p,B[i],B[(i+1)%3])*sign,b=side(q,B[i],B[(i+1)%3])*sign;
   if(a>=-1e-15)out.push(p);
   if((a>=-1e-15)!==(b>=-1e-15)&&Math.abs(a-b)>1e-25){const t=a/(a-b);out.push(p.map((v,j)=>v+(q[j]-v)*t));}
  }
 }
 return out;
}
export function strictTriangleContact(A,B){
 const N=plane(A),M=plane(B);if(!N||!M)return false;
 const da=B.map(p=>dot(sub(p,A[0]),N)),db=A.map(p=>dot(sub(p,B[0]),M));
 if(Math.abs(dot(N,M))>1-1e-8&&Math.max(...da.map(Math.abs))<1e-7&&Math.max(...db.map(Math.abs))<1e-7){
  const drop=N.map(Math.abs).indexOf(Math.max(...N.map(Math.abs))),keep=[0,1,2].filter(k=>k!==drop),poly=clipPolygon(A.map(p=>keep.map(k=>p[k])),B.map(p=>keep.map(k=>p[k])));
  if(poly.length<3)return false;
  const area=Math.abs(poly.reduce((s,p,i)=>s+p[0]*poly[(i+1)%poly.length][1]-poly[(i+1)%poly.length][0]*p[1],0))*.5;
  if(area<1e-14)return false;let width=Infinity;
  for(let i=0;i<poly.length;i++){const d=sub(poly[(i+1)%poly.length],poly[i]),l=length(d);if(l<1e-12)continue;const n=[-d[1]/l,d[0]/l],v=poly.map(p=>dot(p,n));width=Math.min(width,Math.max(...v)-Math.min(...v));}
  if(width<=1e-6)return false;
  const center=[0,0,0];for(const k of keep)center[k]=poly.reduce((s,p)=>s+p[keep.indexOf(k)],0)/poly.length;
  center[drop]=(dot(N,A[0])-keep.reduce((s,k)=>s+N[k]*center[k],0))/N[drop];
  return !sharedBoundary(A,B,center);
 }
 if(!(Math.min(...da)<-1e-7&&Math.max(...da)>1e-7&&Math.min(...db)<-1e-7&&Math.max(...db)>1e-7))return false;
 const d=cross(N,M),l=length(d);if(l<1e-12)return false;const axis=d.map(v=>v/l);
 const segment=(t,dist)=>{const rows=[];for(let i=0;i<3;i++){const j=(i+1)%3;if(Math.abs(dist[i])<1e-14)rows.push(t[i]);if(dist[i]*dist[j]<0){const u=dist[i]/(dist[i]-dist[j]);rows.push(t[i].map((v,k)=>v+(t[j][k]-v)*u));}}return rows.map(p=>({p,t:dot(p,axis)})).sort((a,b)=>a.t-b.t);};
 const a=segment(A,db),b=segment(B,da);if(a.length<2||b.length<2)return false;
 const low=Math.max(a[0].t,b[0].t),high=Math.min(a.at(-1).t,b.at(-1).t);if(high-low<=1e-6)return false;
 const u=((low+high)*.5-a[0].t)/(a.at(-1).t-a[0].t),center=a[0].p.map((v,k)=>v+(a.at(-1).p[k]-v)*u);
 return !sharedBoundary(A,B,center);
}
export function innerElbowContacts(scene){
 const rows=[];scene.traverse(mesh=>{
  if(!mesh.isMesh||!['Fabric','Fabric_Inner','Fabric_Trim'].includes(mesh.name))return;
  const g=mesh.geometry,p=g.attributes.position;
  for(let f=0;f<g.index.count;f+=3){
   const triangle=[0,1,2].map(k=>{const i=g.index.getX(f+k);return[p.getX(i),p.getY(i),p.getZ(i)];}),bounds=[0,1,2].map(k=>[Math.min(...triangle.map(p=>p[k])),Math.max(...triangle.map(p=>p[k]))]);
   if(bounds[1][1]<-1.15||bounds[1][0]>-.35||bounds[2][1]<-.4||bounds[2][0]>.4||bounds[0][1]<-1.15||bounds[0][0]>1.15||bounds[0][0]>-.25&&bounds[0][1]<.25)continue;
   rows.push({triangle,bounds,mesh:mesh.name,face:f/3});
  }
 });
 rows.sort((a,b)=>a.bounds[0][0]-b.bounds[0][0]);let candidates=0;const contacts=[];
 for(let i=0;i<rows.length;i++){const a=rows[i];for(let j=i+1;j<rows.length&&rows[j].bounds[0][0]<=a.bounds[0][1];j++){
  const b=rows[j];if(a.mesh!=='Fabric_Inner'&&b.mesh!=='Fabric_Inner')continue;
  if([1,2].some(k=>a.bounds[k][1]<b.bounds[k][0]||b.bounds[k][1]<a.bounds[k][0]))continue;
  candidates++;if(strictTriangleContact(a.triangle,b.triangle))contacts.push({meshes:[a.mesh,b.mesh],faces:[a.face,b.face]});
 }}
 return {triangles:rows.length,innerTriangles:rows.filter(r=>r.mesh==='Fabric_Inner').length,candidates,contacts};
}
