// A scanned garment can contain both walls of the same thin piece of cloth.
// Keep those walls coupled across their rest thickness while allowing them to
// turn and bend together. Looking inward distinguishes material from an air gap.
const geometryCache=new WeakMap(),MAX_PAIR_DISTANCE=.02,MIN_HEIGHT_RATIO=.01,HEIGHT_TOLERANCE=1e-8;
const planeGradient=new Float64Array(12);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const length=Math.hypot(...v)||1;return v.map(x=>x/length);};

export function buildShellLinks(data){
  const p=data.positions,t=data.triangles,count=p.length/3;
  const normals=new Float64Array(p.length),faces=[],neighbors=Array.from({length:count},()=>new Set());
  const point=i=>p.slice(i*3,i*3+3);
  for(let i=0;i<t.length;i+=3){
    const ids=t.slice(i,i+3),[a,b,c]=ids.map(point),e1=b.map((x,k)=>x-a[k]),e2=c.map((x,k)=>x-a[k]),normal=cross(e1,e2);
    for(const id of ids){for(let k=0;k<3;k++)normals[id*3+k]+=normal[k];for(const other of ids)neighbors[id].add(other);}
    faces.push({ids,a,e1,e2,normal:unit(normal)});
  }
  const links=[];
  for(let a=0;a<count;a++){
    const origin=point(a),normal=unit(Array.from(normals.slice(a*3,a*3+3))),direction=normal.map(x=>-x);
    let nearest=MAX_PAIR_DISTANCE,found=null;
    for(const face of faces){
      if(face.ids.some(id=>neighbors[a].has(id))||dot(normal,face.normal)>-.5)continue;
      const h=cross(direction,face.e2),determinant=dot(face.e1,h);
      if(Math.abs(determinant)<1e-12)continue;
      const s=origin.map((x,k)=>x-face.a[k]),u=dot(s,h)/determinant;
      if(u<0||u>1)continue;
      const q=cross(s,face.e1),v=dot(direction,q)/determinant;
      if(v<0||u+v>1)continue;
      const distance=dot(face.e2,q)/determinant;
      if(distance<1e-5||distance>=nearest)continue;
      nearest=distance;
      found={a,b:face.ids[0],c:face.ids[1],d:face.ids[2],weights:[1-u-v,u,v],length:distance,restHeight:distance*dot(normal,face.normal),compliance:1e-8};
    }
    if(found)links.push(found);
  }
  return links;
}

// Signed point-to-plane height and its full four-point gradient. Updating the
// triangle normal is essential: its plane rotates with the moving cloth.
export function shellPlaneHeight(p,s,g=planeGradient){
  const i=s.a*3,j=s.b*3,k=s.c*3,l=s.d*3,[b,c,d]=s.weights;
  const ux=p[k]-p[j],uy=p[k+1]-p[j+1],uz=p[k+2]-p[j+2],vx=p[l]-p[j],vy=p[l+1]-p[j+1],vz=p[l+2]-p[j+2];
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const area=Math.hypot(nx,ny,nz);if(area<1e-12)return null;
  nx/=area;ny/=area;nz/=area;
  const hx=p[i]-b*p[j]-c*p[k]-d*p[l],hy=p[i+1]-b*p[j+1]-c*p[k+1]-d*p[l+1],hz=p[i+2]-b*p[j+2]-c*p[k+2]-d*p[l+2],height=hx*nx+hy*ny+hz*nz;
  const rx=(hx-height*nx)/area,ry=(hy-height*ny)/area,rz=(hz-height*nz)/area;
  const cx=vy*rz-vz*ry,cy=vz*rx-vx*rz,cz=vx*ry-vy*rx,dx=ry*uz-rz*uy,dy=rz*ux-rx*uz,dz=rx*uy-ry*ux;
  g[0]=nx;g[1]=ny;g[2]=nz;
  g[3]=-b*nx-cx-dx;g[4]=-b*ny-cy-dy;g[5]=-b*nz-cz-dz;
  g[6]=-c*nx+cx;g[7]=-c*ny+cy;g[8]=-c*nz+cz;
  g[9]=-d*nx+dx;g[10]=-d*ny+dy;g[11]=-d*nz+dz;
  return height;
}

// Local two-constraint projection with the smallest correction in the mass norm.
// Nearly opposing shell gaps
// can undo one another in scalar sweeps. Solve their 2x2 active block together;
// accept only a decrease in the actual nonlinear gap residual. Singular blocks
// and rejected steps retain the scalar projection as a conservative fallback.
const adjacencyCache=new WeakMap(),g1=new Float64Array(12),g2=new Float64Array(12),bestGradient=new Float64Array(12),old=new Float64Array(24),delta=new Float64Array(24);
const ids=s=>[s.a,s.b,s.c,s.d];
function adjacency(constraints){
 if(adjacencyCache.has(constraints))return adjacencyCache.get(constraints);
 const supports=constraints.map(ids),byNode=new Map();
 supports.forEach((list,i)=>{for(const v of list){if(!byNode.has(v))byNode.set(v,[]);byNode.get(v).push(i);}});
 const neighbors=supports.map((list,i)=>[...new Set(list.flatMap(v=>byNode.get(v)))].filter(j=>j!==i));
 const topology={supports,neighbors};adjacencyCache.set(constraints,topology);return topology;
}
function signed(p,s,g){const h=shellPlaneHeight(p,s,g);if(h===null)return null;const sign=Math.sign(s.restHeight);for(let k=0;k<12;k++)g[k]*=sign;return sign*h;}
function coupledOrientationSweep(shell,p,w,scale=1,reverse=false){
 const constraints=shell.constraints,{neighbors,supports}=adjacency(constraints);let corrected=0;
 for(let f=0;f<constraints.length;f++){
  const i=reverse?constraints.length-1-f:f,s=constraints[i],a=supports[i],h=signed(p,s,g1);if(h===null)continue;
  const gap=h-Math.abs(s.restHeight)*MIN_HEIGHT_RATIO*scale;if(gap>=-HEIGHT_TOLERANCE*scale)continue;
  let A=0;for(let j=0;j<4;j++)for(let k=0;k<3;k++)A+=w[a[j]]*g1[j*3+k]**2;if(A===0)continue;
  let best=-1,score=0,lambda1=0,lambda2=0,gap2=0;
  for(const j of neighbors[i]){
   const t=constraints[j],b=supports[j],ht=signed(p,t,g2);if(ht===null)continue;
   const ct=ht-Math.abs(t.restHeight)*MIN_HEIGHT_RATIO*scale;let D=0,B=0;
   for(let m=0;m<4;m++)for(let k=0;k<3;k++)D+=w[b[m]]*g2[m*3+k]**2;
   for(let m=0;m<4;m++)for(let n=0;n<4;n++)if(a[m]===b[n])for(let k=0;k<3;k++)B+=w[a[m]]*g1[m*3+k]*g2[n*3+k];
   if(D===0||B>=0||ct-B*gap/A>=-HEIGHT_TOLERANCE*scale)continue;
   // In the mass-weighted Gram matrix J W J^T, B couples shared nodes.
   const det=A*D-B*B;if(det<A*D*1e-8)continue;
   const l1=(-gap*D+B*ct)/det,l2=(-ct*A+B*gap)/det,coupling=-B/Math.sqrt(A*D);
   if(!Number.isFinite(l1)||!Number.isFinite(l2)||l1<0||l2<0||coupling<=score)continue;best=j;score=coupling;lambda1=l1;lambda2=l2;gap2=ct;bestGradient.set(g2);
  }
  let accepted=false;
  if(best>=0){
   const t=constraints[best],b=supports[best],union=[...new Set([...a,...b])],initial=gap*gap+Math.min(0,gap2)**2;delta.fill(0);
   for(let j=0;j<union.length;j++){const id=union[j];for(let k=0;k<3;k++){old[j*3+k]=p[id*3+k];for(let n=0;n<4;n++){if(a[n]===id)delta[j*3+k]+=w[id]*g1[n*3+k]*lambda1;if(b[n]===id)delta[j*3+k]+=w[id]*bestGradient[n*3+k]*lambda2;}}}
   for(let step=1;step>=1/64;step*=.5){
    for(let j=0;j<union.length;j++)for(let k=0;k<3;k++)p[union[j]*3+k]=old[j*3+k]+step*delta[j*3+k];
    const hs=shellPlaneHeight(p,s),ht=shellPlaneHeight(p,t);
    if(hs!==null&&ht!==null){const c1=Math.sign(s.restHeight)*hs-Math.abs(s.restHeight)*MIN_HEIGHT_RATIO*scale,c2=Math.sign(t.restHeight)*ht-Math.abs(t.restHeight)*MIN_HEIGHT_RATIO*scale,residual=Math.min(0,c1)**2+Math.min(0,c2)**2;if(residual<initial*(1-1e-4)||Math.min(c1,c2)>=-HEIGHT_TOLERANCE*scale){accepted=true;break;}}
   }
   if(!accepted)for(let j=0;j<union.length;j++)for(let k=0;k<3;k++)p[union[j]*3+k]=old[j*3+k];
  }
  if(!accepted){const lambda=-gap/A;for(let j=0;j<4;j++)for(let k=0;k<3;k++)p[a[j]*3+k]+=w[a[j]]*g1[j*3+k]*lambda;}
  corrected++;
 }
 return corrected;
}

export class ShellConstraints{
  constructor(data){
    if(!geometryCache.has(data))geometryCache.set(data,buildShellLinks(data));
    this.constraints=geometryCache.get(data).map(link=>({...link,weights:[...link.weights],lambda:0}));
    this.links=this.constraints.flatMap(s=>[s.b,s.c,s.d].map(b=>({a:s.a,b})));
  }
  reset(){for(const constraint of this.constraints){constraint.lambda=0;}}
  solve(p,w,dt,reverse=false,scale=1){
    for(let f=0;f<this.constraints.length;f++){
      const s=this.constraints[reverse?this.constraints.length-1-f:f];
      if(w[s.a]+w[s.b]+w[s.c]+w[s.d]===0)continue;
      const i=s.a*3,j=s.b*3,k=s.c*3,l=s.d*3,[b,c,d]=s.weights;
      const dx=p[i]-b*p[j]-c*p[k]-d*p[l],dy=p[i+1]-b*p[j+1]-c*p[k+1]-d*p[l+1],dz=p[i+2]-b*p[j+2]-c*p[k+2]-d*p[l+2];
      const length=Math.hypot(dx,dy,dz),weight=w[s.a]+w[s.b]*b*b+w[s.c]*c*c+w[s.d]*d*d;
      if(length<1e-10||weight===0)continue;
      const alpha=s.compliance/(dt*dt),delta=(-(length-s.length*scale)-alpha*s.lambda)/(weight+alpha);
      s.lambda+=delta;
      for(let axis=0;axis<3;axis++){
        const n=(axis===0?dx:axis===1?dy:dz)/length;
        p[i+axis]+=n*delta*w[s.a];p[j+axis]-=n*delta*w[s.b]*b;p[k+axis]-=n*delta*w[s.c]*c;p[l+axis]-=n*delta*w[s.d]*d;
      }
    }
    this.enforceOrientation(p,w,scale,reverse);
  }
  // Used only after ordinary orientation sweeps have failed to converge.
  enforceCoupledOrientation(p,w,scale=1,reverse=false){return coupledOrientationSweep(this,p,w,scale,reverse);}
  // Project violated one-sided gaps; valid layers retain their positions.
  // The small positive margin keeps the next distance solve away from a
  // zero-thickness configuration while normal rest thickness stays unchanged.
  enforceOrientation(p,w,scale=1,reverse=false){
    let corrected=0;
    for(let f=0;f<this.constraints.length;f++){
      const s=this.constraints[reverse?this.constraints.length-1-f:f];
      if(w[s.a]+w[s.b]+w[s.c]+w[s.d]===0)continue;
      const height=shellPlaneHeight(p,s);
      if(height===null)continue;
      const sign=Math.sign(s.restHeight),gap=sign*height-Math.abs(s.restHeight)*MIN_HEIGHT_RATIO*scale;
      if(gap>=-HEIGHT_TOLERANCE*scale)continue;
      const ids=[s.a,s.b,s.c,s.d];let weight=0;for(let a=0;a<4;a++)for(let k=0;k<3;k++)weight+=w[ids[a]]*planeGradient[a*3+k]**2;
      if(weight===0)continue;
      const delta=-gap*sign/weight;corrected++;
      for(let a=0;a<4;a++)for(let k=0;k<3;k++)p[ids[a]*3+k]+=w[ids[a]]*planeGradient[a*3+k]*delta;
    }
    return corrected;
  }
}
