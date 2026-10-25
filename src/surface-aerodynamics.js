// Area-lumped panel drag. Opposite-facing cloth panels contribute separately;
// their normals must not cancel before pressure is evaluated. Coefficients are
// the existing relative material presets, not measured air/fabric constants.
// Panel normal/area basis: UCSD CSE169, slides 18–23:
// https://cseweb.ucsd.edu/classes/wi18/cse169-a/slides/CSE169_11.pdf
// This implementation uses nodal quadrature and symmetric analytic flows,
// rather than the lecture's face-mean velocity and Euler force update.
const topology=new WeakMap();
function incidence(data){
 if(topology.has(data))return topology.get(data);
 const count=data.positions.length/3,triangles=data.triangles,starts=new Uint32Array(count+1);
 for(const node of triangles)starts[node+1]++;
 for(let i=1;i<starts.length;i++)starts[i]+=starts[i-1];
 const faces=new Uint32Array(triangles.length),cursor=starts.slice();
 for(let f=0;f<triangles.length/3;f++)for(let k=0;k<3;k++)faces[cursor[triangles[f*3+k]]++]=f;
 const result={starts,faces};topology.set(data,result);return result;
}
export class SurfaceAerodynamics{
 constructor(data,areas,mass){
  this.triangles=data.triangles;this.areas=areas;this.mass=mass;Object.assign(this,incidence(data));
  this.normals=new Float64Array(data.triangles.length);this.faceArea=new Float64Array(data.triangles.length/3);
  this.tangent=new Float64Array(this.faces.length);this.linear=new Float64Array(this.faces.length);
 }
 step(p,v,inverseMass,dt,drag,scale=1){
  if(drag===0||dt<=0)return;
  const t=this.triangles,n=this.normals,area=this.faceArea;
  for(let f=0;f<area.length;f++){
   const j=f*3,a=t[j]*3,b=t[j+1]*3,c=t[j+2]*3,ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],wx=p[c]-p[a],wy=p[c+1]-p[a+1],wz=p[c+2]-p[a+2],x=uy*wz-uz*wy,y=uz*wx-ux*wz,z=ux*wy-uy*wx,length=Math.sqrt(x*x+y*y+z*z);
   area[f]=length/6;const divisor=length||1;n[j]=x/divisor;n[j+1]=y/divisor;n[j+2]=z/divisor;
  }
  const starts=this.starts,faces=this.faces,tangent=this.tangent,linear=this.linear;
  for(let node=0;node<this.mass.length;node++){
   if(!inverseMass[node]||!(this.areas[node]>0))continue;
   const i=node*3,start=starts[node],end=starts[node+1],rate=drag*dt/(2*this.mass[node]*this.areas[node]*scale*scale);let x=v[i],y=v[i+1],z=v[i+2];
   // Positive half flows in forward/reverse order give a symmetric, second-order
   // split. Each panel's linear/quadratic flow is analytic and dissipative. For
   // parallel panels these flows compose to the original exact planar response.
   for(let pass=0;pass<2;pass++)for(let k=0;k<end-start;k++){
    const slot=pass?end-1-k:start+k,face=faces[slot],j=face*3;
    if(pass===0){const time=rate*area[face];tangent[slot]=Math.exp(-.55*time);linear[slot]=Math.exp(-.95*time);}
    const nx=n[j],ny=n[j+1],nz=n[j+2],vn=x*nx+y*ny+z*nz,a=tangent[slot],b=linear[slot],normal=b/(1+(.25/.95)*Math.abs(vn)*(1-b)),change=vn*(normal-a);
    x=x*a+nx*change;y=y*a+ny*change;z=z*a+nz*change;
   }
   v[i]=x;v[i+1]=y;v[i+2]=z;
  }
 }
}
