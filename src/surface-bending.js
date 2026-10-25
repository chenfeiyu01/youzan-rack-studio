// XPBD signed-dihedral bending. Unlike an opposite-vertex distance spring,
// the angle separates resistance to folds from in-plane stretch.
// Formulation reference: Müller et al., A Survey on Position Based Dynamics,
// 2017, sections 4.2 and 5.2. Gradients use the signed atan2 form.
const gradient=new Float64Array(12);

export function dihedralAngle(p,a,b,c,d,g=gradient){
  a*=3;b*=3;c*=3;d*=3;
  const ex=p[b]-p[a],ey=p[b+1]-p[a+1],ez=p[b+2]-p[a+2],l2=ex*ex+ey*ey+ez*ez,L=Math.sqrt(l2);
  const cx=p[c]-p[a],cy=p[c+1]-p[a+1],cz=p[c+2]-p[a+2],dx=p[d]-p[a],dy=p[d+1]-p[a+1],dz=p[d+2]-p[a+2];
  const nx=ey*cz-ez*cy,ny=ez*cx-ex*cz,nz=ex*cy-ey*cx,mx=dy*ez-dz*ey,my=dz*ex-dx*ez,mz=dx*ey-dy*ex;
  const n2=nx*nx+ny*ny+nz*nz,m2=mx*mx+my*my+mz*mz;
  if(l2<1e-16||n2<1e-18||m2<1e-18)return null;
  const sine=(ex*(ny*mz-nz*my)+ey*(nz*mx-nx*mz)+ez*(nx*my-ny*mx))/L,cosine=nx*mx+ny*my+nz*mz;
  const angle=Math.atan2(sine,cosine),nc=-L/n2,nd=-L/m2,uc=(cx*ex+cy*ey+cz*ez)/l2,ud=(dx*ex+dy*ey+dz*ez)/l2;
  g[6]=nc*nx;g[7]=nc*ny;g[8]=nc*nz;g[9]=nd*mx;g[10]=nd*my;g[11]=nd*mz;
  for(let k=0;k<3;k++){g[3+k]=-uc*g[6+k]-ud*g[9+k];g[k]=-g[3+k]-g[6+k]-g[9+k];}
  return angle;
}

// A unit curvature across a hinge has directional energy
// ku*cos(phi)^4 + 2*km*cos(phi)^2*sin(phi)^2 + kv*sin(phi)^4.
// Normalize its angular mean so softness continues to set overall resistance.
// These are relative appearance presets, not measured textile rigidities.
function directionalStiffness(rest,a,b,c,face,grain,weights){
  if(!grain||!weights||!Number.isInteger(face)||grain[face*4+3]!==1)return 1;
  const i=a*3,j=b*3,k=c*3,dx=rest[j]-rest[i],dy=rest[j+1]-rest[i+1],dz=rest[j+2]-rest[i+2],length=Math.hypot(dx,dy,dz);
  const ex=dx/length,ey=dy/length,ez=dz/length,along=(rest[k]-rest[i])*ex+(rest[k+1]-rest[i+1])*ey+(rest[k+2]-rest[i+2])*ez;
  const px=rest[k]-rest[i]-ex*along,py=rest[k+1]-rest[i+1]-ey*along,pz=rest[k+2]-rest[i+2]-ez*along,across=Math.hypot(px,py,pz);
  if(!(length>1e-8&&across>1e-8))return 1;
  const u=face*4,alongU=grain[u]*ex+grain[u+1]*ey+grain[u+2]*ez,acrossU=(grain[u]*px+grain[u+1]*py+grain[u+2]*pz)/across,denominator=alongU*alongU+acrossU*acrossU;
  if(!(denominator>1e-12&&Number.isFinite(denominator)))return 1;
  const cos2=Math.max(0,Math.min(1,acrossU*acrossU/denominator)),sin2=1-cos2;
  return weights.u*cos2*cos2+2*weights.mixed*cos2*sin2+weights.v*sin2*sin2;
}

export class DihedralBending{
  constructor(rest,edges,softness=1,{grain,rigidity}={}){
    let weights=null;
    if(rigidity){
      const {u,v,mixed}=rigidity;
      if(![u,v,mixed].every(value=>Number.isFinite(value)&&value>0))throw new RangeError('布纹弯折刚度必须为有限正值');
      const mean=.375*(u+v)+.25*mixed;weights={u:u/mean,v:v/mean,mixed:mixed/mean};
    }
    this.constraints=[];this.links=[];
    for(const{a,b,opposite,faces}of edges){
      if(opposite.length!==2)continue;
      const[c,d]=opposite;if(c===d||c===a||c===b||d===a||d===b)continue;
      this.links.push({a:c,b:d});
      const angle=dihedralAngle(rest,a,b,c,d);
      if(angle===null)continue;
      const i=a*3,j=b*3,k=c*3,l=d*3,ex=rest[j]-rest[i],ey=rest[j+1]-rest[i+1],ez=rest[j+2]-rest[i+2],l2=ex*ex+ey*ey+ez*ez;
      const crossArea=q=>{const x=rest[q]-rest[i],y=rest[q+1]-rest[i+1],z=rest[q+2]-rest[i+2];return Math.hypot(ey*z-ez*y,ez*x-ex*z,ex*y-ey*x);};
      const areaC=crossArea(k),areaD=crossArea(l);
      // A collapsed/sliver face has no stable bending direction. Structural
      // distances and seam/contact constraints still protect these vertices.
      if(Math.min(areaC,areaD)/l2<.005)continue;
      const stiffnessC=directionalStiffness(rest,a,b,c,faces?.[0],grain,weights),stiffnessD=directionalStiffness(rest,a,b,d,faces?.[1],grain,weights);
      const stiffness=(stiffnessC*areaC+stiffnessD*areaD)/(areaC+areaD);
      const compliance=.02*softness*(areaC+areaD)/(6*l2)/stiffness;
      this.constraints.push({a,b,c,d,angle,compliance,lambda:0});
    }
  }
  reset(){for(const c of this.constraints)c.lambda=0;}
  solve(p,w,dt,reverse=false){
    for(let j=0;j<this.constraints.length;j++){
      const c=this.constraints[reverse?this.constraints.length-1-j:j],wa=w[c.a],wb=w[c.b],wc=w[c.c],wd=w[c.d],a=c.a*3,b=c.b*3,d=c.c*3,e=c.d*3;
      if(wa+wb+wc+wd===0)continue;
      // Match the exported signed-angle evaluator, retaining scalar gradient
      // intermediates through projection instead of writing a scratch array.
      const ex=p[b]-p[a],ey=p[b+1]-p[a+1],ez=p[b+2]-p[a+2],l2=ex*ex+ey*ey+ez*ez,L=Math.sqrt(l2);
      const cx=p[d]-p[a],cy=p[d+1]-p[a+1],cz=p[d+2]-p[a+2],dx=p[e]-p[a],dy=p[e+1]-p[a+1],dz=p[e+2]-p[a+2];
      const nx=ey*cz-ez*cy,ny=ez*cx-ex*cz,nz=ex*cy-ey*cx,mx=dy*ez-dz*ey,my=dz*ex-dx*ez,mz=dx*ey-dy*ex;
      const n2=nx*nx+ny*ny+nz*nz,m2=mx*mx+my*my+mz*mz;
      if(l2<1e-16||n2<1e-18||m2<1e-18)continue;
      const sine=(ex*(ny*mz-nz*my)+ey*(nz*mx-nx*mz)+ez*(nx*my-ny*mx))/L,cosine=nx*mx+ny*my+nz*mz;
      const angle=Math.atan2(sine,cosine),nc=-L/n2,nd=-L/m2,uc=(cx*ex+cy*ey+cz*ez)/l2,ud=(dx*ex+dy*ey+dz*ez)/l2;
      const g6=nc*nx,g7=nc*ny,g8=nc*nz,g9=nd*mx,g10=nd*my,g11=nd*mz;
      const g3=-uc*g6-ud*g9,g4=-uc*g7-ud*g10,g5=-uc*g8-ud*g11;
      const g0=-g3-g6-g9,g1=-g4-g7-g10,g2=-g5-g8-g11;
      const ga=g0**2+g1**2+g2**2,gb=g3**2+g4**2+g5**2,gc=g6**2+g7**2+g8**2,gd=g9**2+g10**2+g11**2;
      const weight=wa*ga+wb*gb+wc*gc+wd*gd;if(weight===0)continue;
      // Both angles come from atan2, so their difference is in [-2pi, 2pi].
      // One circular wrap gives the same shortest fold without three trig calls.
      const delta=angle-c.angle,error=delta>Math.PI?delta-2*Math.PI:delta< -Math.PI?delta+2*Math.PI:delta,alpha=c.compliance/(dt*dt),dl=(-error-alpha*c.lambda)/(weight+alpha);c.lambda+=dl;
      // Four distinct hinge vertices, in the original axis-major order.
      p[a]+=wa*g0*dl;p[b]+=wb*g3*dl;p[d]+=wc*g6*dl;p[e]+=wd*g9*dl;
      p[a+1]+=wa*g1*dl;p[b+1]+=wb*g4*dl;p[d+1]+=wc*g7*dl;p[e+1]+=wd*g10*dl;
      p[a+2]+=wa*g2*dl;p[b+2]+=wb*g5*dl;p[d+2]+=wc*g8*dl;p[e+2]+=wd*g11*dl;
    }
  }
}
