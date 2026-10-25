// Directional strain constraints on a rest triangle, after Strain Based
// Dynamics (Müller et al. 2014), with XPBD accumulated multipliers.
// Stretch uses material tangent lengths; shear uses their normalized dot so
// uniform extension is not mistaken for shear. Presets are relative, not SI.
const gradient=new Float64Array(9);
// Material tangent lengths are ordinary-scale here. Preserve the robust norm
// near collapse and for extreme/nonfinite input; avoid its scaling work otherwise.
const tangentLength=(x,y,z)=>{const squared=x*x+y*y+z*z;return squared>1e-16&&squared<1e300?Math.sqrt(squared):Math.hypot(x,y,z);};
export function triangleStrain(p,c,component,g=gradient){
 const a=c.a*3,b=c.b*3,d=c.c*3,ex=p[b]-p[a],ey=p[b+1]-p[a+1],ez=p[b+2]-p[a+2],dx=p[d]-p[a],dy=p[d+1]-p[a+1],dz=p[d+2]-p[a+2];
 const ux=ex*c.u1+dx*c.u2,uy=ey*c.u1+dy*c.u2,uz=ez*c.u1+dz*c.u2,vx=ex*c.v1+dx*c.v2,vy=ey*c.v1+dy*c.v2,vz=ez*c.v1+dz*c.v2,ul=tangentLength(ux,uy,uz),vl=tangentLength(vx,vy,vz);
 if(!(ul>1e-9&&vl>1e-9))return null;
 let gux,guy,guz,gvx,gvy,gvz,value;
 if(component===0){value=ul;gux=ux/ul;guy=uy/ul;guz=uz/ul;gvx=gvy=gvz=0;}
 else if(component===1){value=vl;gvx=vx/vl;gvy=vy/vl;gvz=vz/vl;gux=guy=guz=0;}
 else{value=(ux*vx+uy*vy+uz*vz)/(ul*vl);gux=vx/(ul*vl)-value*ux/(ul*ul);guy=vy/(ul*vl)-value*uy/(ul*ul);guz=vz/(ul*vl)-value*uz/(ul*ul);gvx=ux/(ul*vl)-value*vx/(vl*vl);gvy=uy/(ul*vl)-value*vy/(vl*vl);gvz=uz/(ul*vl)-value*vz/(vl*vl);}
 g[3]=c.u1*gux+c.v1*gvx;g[4]=c.u1*guy+c.v1*gvy;g[5]=c.u1*guz+c.v1*gvz;g[6]=c.u2*gux+c.v2*gvx;g[7]=c.u2*guy+c.v2*gvy;g[8]=c.u2*guz+c.v2*gvz;
 g[0]=-g[3]-g[6];g[1]=-g[4]-g[7];g[2]=-g[5]-g[8];return value;
}
export class TriangleStrain{
 constructor(data,compliance={u:1.5e-7,v:3e-7,shear:2e-5}){
  if(![compliance.u,compliance.v,compliance.shear].every(v=>Number.isFinite(v)&&v>0))throw new RangeError('布料拉伸与剪切柔度必须为有限正值');
  this.constraints=[];const p=data.positions,t=data.triangles,grain=data.grain;this.active=new Uint8Array(t.length/3);
  if(!grain)return;
  for(let f=0;f<t.length/3;f++){
   if(grain[f*4+3]!==1)continue;
   const a=t[f*3],b=t[f*3+1],c=t[f*3+2],i=a*3,j=b*3,k=c*3,ex=p[j]-p[i],ey=p[j+1]-p[i+1],ez=p[j+2]-p[i+2],dx=p[k]-p[i],dy=p[k+1]-p[i+1],dz=p[k+2]-p[i+2];
   let nx=ey*dz-ez*dy,ny=ez*dx-ex*dz,nz=ex*dy-ey*dx;const twiceArea=Math.hypot(nx,ny,nz),long2=Math.max(ex*ex+ey*ey+ez*ez,dx*dx+dy*dy+dz*dz,(ex-dx)**2+(ey-dy)**2+(ez-dz)**2);
   // A rest triangle thinner than 1/20 of its longest edge is too poorly
   // conditioned for this fixed-budget face solve. Keep its distance support.
   if(!(twiceArea>1e-12&&twiceArea/long2>.05))continue;nx/=twiceArea;ny/=twiceArea;nz/=twiceArea;
   let ux=grain[f*4],uy=grain[f*4+1],uz=grain[f*4+2];const normalU=ux*nx+uy*ny+uz*nz;ux-=normalU*nx;uy-=normalU*ny;uz-=normalU*nz;const ul=Math.hypot(ux,uy,uz);if(!(ul>1e-8))continue;ux/=ul;uy/=ul;uz/=ul;
   const vx=ny*uz-nz*uy,vy=nz*ux-nx*uz,vz=nx*uy-ny*ux,x1=ex*ux+ey*uy+ez*uz,y1=ex*vx+ey*vy+ez*vz,x2=dx*ux+dy*uy+dz*uz,y2=dx*vx+dy*vy+dz*vz,det=x1*y2-x2*y1,area=twiceArea*.5;
   this.constraints.push({a,b,c,u1:y2/det,u2:-y1/det,v1:-x2/det,v2:x1/det,compliance:[compliance.u/area,compliance.v/area,compliance.shear/area],lambda:new Float64Array(3)});this.active[f]=1;
  }
 }
 reset(){for(const c of this.constraints)c.lambda.fill(0);}
 solve(p,w,dt,reverse=false,scale=1){
  for(let j=0;j<this.constraints.length;j++){
   const c=this.constraints[reverse?this.constraints.length-1-j:j],wa=w[c.a],wb=w[c.b],wc=w[c.c],a=c.a*3,b=c.b*3,d=c.c*3;if(wa+wb+wc===0)continue;
   for(let k=0;k<3;k++){
    const component=reverse?2-k:k;
    // Keep scalar gradient intermediates in this hot projection. The exported
    // gradient evaluator remains available; numerical projection tests cover
    // the same definition without imposing scratch-buffer stores on every solve.
    const ex=p[b]-p[a],ey=p[b+1]-p[a+1],ez=p[b+2]-p[a+2],dx=p[d]-p[a],dy=p[d+1]-p[a+1],dz=p[d+2]-p[a+2];
    const ux=ex*c.u1+dx*c.u2,uy=ey*c.u1+dy*c.u2,uz=ez*c.u1+dz*c.u2,vx=ex*c.v1+dx*c.v2,vy=ey*c.v1+dy*c.v2,vz=ez*c.v1+dz*c.v2,ul=tangentLength(ux,uy,uz),vl=tangentLength(vx,vy,vz);
    if(!(ul>1e-9&&vl>1e-9))continue;
    let gux,guy,guz,gvx,gvy,gvz,value;
    if(component===0){value=ul;gux=ux/ul;guy=uy/ul;guz=uz/ul;gvx=gvy=gvz=0;}
    else if(component===1){value=vl;gvx=vx/vl;gvy=vy/vl;gvz=vz/vl;gux=guy=guz=0;}
    else{value=(ux*vx+uy*vy+uz*vz)/(ul*vl);gux=vx/(ul*vl)-value*ux/(ul*ul);guy=vy/(ul*vl)-value*uy/(ul*ul);guz=vz/(ul*vl)-value*uz/(ul*ul);gvx=ux/(ul*vl)-value*vx/(vl*vl);gvy=uy/(ul*vl)-value*vy/(vl*vl);gvz=uz/(ul*vl)-value*vz/(vl*vl);}
    const g3=c.u1*gux+c.v1*gvx,g4=c.u1*guy+c.v1*gvy,g5=c.u1*guz+c.v1*gvz,g6=c.u2*gux+c.v2*gvx,g7=c.u2*guy+c.v2*gvy,g8=c.u2*guz+c.v2*gvz;
    const g0=-g3-g6,g1=-g4-g7,g2=-g5-g8;
    const ga=g0**2+g1**2+g2**2,gb=g3**2+g4**2+g5**2,gc=g6**2+g7**2+g8**2,weight=wa*ga+wb*gb+wc*gc;
    if(!(weight>1e-16))continue;
    // Length constraints already contain scale; angular shear does not.
    const alpha=c.compliance[component]/(dt*dt*(component===2?scale*scale:1)),error=value-(component===2?0:scale),dl=(-error-alpha*c.lambda[component])/(weight+alpha);c.lambda[component]+=dl;
    // Preserve axis-major updates and the original XPBD arithmetic/traversal.
    p[a]+=wa*g0*dl;p[b]+=wb*g3*dl;p[d]+=wc*g6*dl;
    p[a+1]+=wa*g1*dl;p[b+1]+=wb*g4*dl;p[d+1]+=wc*g7*dl;
    p[a+2]+=wa*g2*dl;p[b+2]+=wb*g5*dl;p[d+2]+=wc*g8*dl;
   }
  }
 }
}
