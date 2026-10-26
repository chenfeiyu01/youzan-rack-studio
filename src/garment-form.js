import{createFlowReference}from'./surface-flow-grid.js';
import{hangingDrape}from'./garment-drape.js';
// Rest-shape tailoring, evaluated once when a garment is loaded. The same
// map is applied to visible fabric and the complete simulation mesh. Supported
// shoulders and the rigid hanger stay in their original coordinates.
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function formPoint(x,y,z,form,out=[0,0,0],relax=null,relaxedZ=null){
  if(!form||y>=.55){out[0]=x;out[1]=y;out[2]=z;return out;}
  if(relax)z+=relaxedZ??relax(x,y,z);
  const free=smooth((.55-y)/.9),hem=smooth((-.25-y)/1.15);
  const sleeve=smooth((Math.abs(x)-.68)/.36),depth=1+((form.depth-1)+(form.sleeveEase??0)*sleeve)*free;
  out[0]=x*(1+form.width*free)+form.lean*hem;
  out[1]=y-form.length*free+form.hem*x*hem;
  out[2]=z*depth+form.drape*Math.sin(x*3.4+form.phase)*free*hem;
  return out;
}

// The inverse transpose carries source shading normals through tailoring;
// recomputing normals would erase the authored seams and folded trim edges.
const slope=x=>x>0&&x<1?6*x*(1-x):0;
const relaxationGradient=new Float64Array(4);
function differential(x,y,z,form,j,relax){
  j.fill(0);if(!form||y>=.55){j[0]=j[4]=j[8]=1;return j;}
  const f=(.55-y)/.9,h=(-.25-y)/1.15,free=smooth(f),hem=smooth(h),fy=-slope(f)/.9,hy=-slope(h)/1.15,s=(Math.abs(x)-.68)/.36,sleeve=smooth(s),ease=form.sleeveEase??0;
  const depth=1+(form.depth-1+ease*sleeve)*free,depthX=ease*slope(s)*Math.sign(x)/.36*free,depthY=(form.depth-1+ease*sleeve)*fy,phase=x*3.4+form.phase;
  const r=relaxationGradient;r.fill(0);if(relax)relax(x,y,z,r);
  j[0]=1+form.width*free;j[1]=form.hem*hem;j[2]=r[1]*depth+(z+r[0])*depthX+form.drape*3.4*Math.cos(phase)*free*hem;
  j[3]=x*form.width*fy+form.lean*hy;j[4]=1-form.length*fy+form.hem*x*hy;j[5]=r[2]*depth+(z+r[0])*depthY+form.drape*Math.sin(phase)*(fy*hem+free*hy);
  j[8]=(1+r[3])*depth;return j;
}
export function applyGarmentForm(geometry,form,data){
  if(!form)return geometry;
  const relax=data?.restSurface==='clean-pattern'?hangingDrape(form):data?restRelaxation(data):null;
  const p=geometry.attributes.position,n=geometry.attributes.normal,delta=geometry.getAttribute('clothDelta'),j=new Float64Array(9),q=[0,0,0],exit=[0,0,0];
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    if(n){
      differential(x,y,z,form,j,relax);const nx=n.getX(i),ny=n.getY(i),nz=n.getZ(i);
      const a=(j[4]*j[8]-j[5]*j[7])*nx+(j[7]*j[2]-j[8]*j[1])*ny+(j[1]*j[5]-j[2]*j[4])*nz;
      const b=(j[5]*j[6]-j[3]*j[8])*nx+(j[8]*j[0]-j[6]*j[2])*ny+(j[2]*j[3]-j[0]*j[5])*nz;
      const c=(j[3]*j[7]-j[4]*j[6])*nx+(j[6]*j[1]-j[7]*j[0])*ny+(j[0]*j[4]-j[1]*j[3])*nz,scale=1/(Math.hypot(a,b,c)||1);
      n.setXYZ(i,a*scale,b*scale,c*scale);
    }
    formPoint(x,y,z,form,q,relax,n?relaxationGradient[0]:null);
    if(delta){formPoint(x+delta.getX(i),y+delta.getY(i),z+delta.getZ(i),form,exit,relax);delta.setXYZ(i,exit[0]-q[0],exit[1]-q[1],exit[2]-q[2]);}
    p.setXYZ(i,...q);
  }
  // Ink remains attached to its authored cloth coordinates, then follows the
  // same rest-shape map before any physical movement is applied.
  const print=geometry.getAttribute('sourcePrintRest');
  if(print)for(let i=0;i<print.count;i++){formPoint(print.getX(i),print.getY(i),print.getZ(i),form,q,relax);print.setXYZ(i,...q);}
  const color=geometry.getAttribute('color');
  if(color)for(let i=0;i<color.count;i++)color.setX(i,1-(1-color.getX(i))*.60);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

const cache=new WeakMap();
const relaxed=new WeakMap();
function restRelaxation(data){
  if(relaxed.has(data))return relaxed.get(data);
  const p=data.positions,t=data.triangles,count=p.length/3,neighbors=Array.from({length:count},()=>new Set()),field=new Float32Array(count*4);
  for(let i=0;i<t.length;i+=3)for(const[a,b]of[[t[i],t[i+1]],[t[i+1],t[i+2]],[t[i+2],t[i]]]){neighbors[a].add(b);neighbors[b].add(a);}
  let a=Float64Array.from({length:count},(_,i)=>p[i*3+2]),b=a.slice();
  for(let pass=0;pass<14;pass++){
    for(let n=0;n<count;n++){
      let sum=0,total=0;for(const other of neighbors[n]){const i=n*3,j=other*3,w=1/Math.max(.02,Math.hypot(p[i]-p[j],p[i+1]-p[j+1],p[i+2]-p[j+2]));sum+=a[other]*w;total+=w;}
      const free=smooth((.55-p[n*3+1])/.65);b[n]=a[n]+.55*free*(total?sum/total-a[n]:0);
    }[a,b]=[b,a];
  }
  for(let n=0;n<count;n++)field[n*4+2]=(a[n]-p[n*3+2])*.85;
  // Share one continuous, monotone volume map across the two cloth walls,
  // seams and render mesh, instead of independently smoothing their vertices.
  const ref=createFlowReference(data);ref.update(field);const [nx,ny,nz]=ref.dimensions,grid=ref.pixels,h=ref.step[2];let minimum=0;
  for(let z=0;z<nz-1;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=(z*ny*nx+y*nx+x)*4+2;minimum=Math.min(minimum,(grid[i+nx*ny*4]-grid[i])/h);}
  const amount=minimum<-.35?-.35/minimum:1;
  // A C2 B-spline field prevents the rest-shape normals from exposing the
  // piecewise-affine simulation lattice as squares across the chest.
  // Its derivative is a convex blend of adjacent lattice differences, so
  // the same lower bound still keeps the depth mapping monotone.
  const weights=new Float64Array(12),derivatives=new Float64Array(12),cell=new Int32Array(3),dims=[nx,ny,nz],offsets=new Int32Array(12),strides=[4,nx*4,nx*ny*4];
  function sample(x,y,z,out){
    for(let k=0;k<3;k++){
      const coordinate=k===0?x:k===1?y:z;
      const q=Math.max(0,Math.min(dims[k]-1,(coordinate-ref.lo[k])/ref.step[k])),base=Math.floor(q),t=q-base,u=1-t,j=k*4;cell[k]=base-1;
      weights[j]=u*u*u/6;weights[j+1]=(3*t*t*t-6*t*t+4)/6;weights[j+2]=(-3*t*t*t+3*t*t+3*t+1)/6;weights[j+3]=t*t*t/6;
      for(let tap=0;tap<4;tap++)offsets[j+tap]=Math.max(0,Math.min(dims[k]-1,cell[k]+tap))*strides[k];
      const scale=coordinate<ref.lo[k]||coordinate>ref.hi[k]?0:1/ref.step[k];
      derivatives[j]=-.5*u*u*scale;derivatives[j+1]=(1.5*t*t-2*t)*scale;derivatives[j+2]=(-1.5*t*t+t+.5)*scale;derivatives[j+3]=.5*t*t*scale;
    }
    let value=0,dx=0,dy=0,dz=0;
    for(let k=0;k<4;k++)for(let j=0;j<4;j++)for(let i=0;i<4;i++){
      const v=grid[offsets[8+k]+offsets[4+j]+offsets[i]+2]*amount,wx=weights[i],wy=weights[4+j],wz=weights[8+k];
      value+=v*wx*wy*wz;if(out){dx+=v*derivatives[i]*wy*wz;dy+=v*wx*derivatives[4+j]*wz;dz+=v*wx*wy*derivatives[8+k];}
    }
    if(out){out[0]=value;out[1]=dx;out[2]=dy;out[3]=dz;}return value;
  }
  relaxed.set(data,sample);return sample;
}
export function garmentSimulation(data,item){
  if(!item.form)return data;
  let forms=cache.get(data);if(!forms){forms=new Map();cache.set(data,forms);}if(forms.has(item.id))return forms.get(item.id);
  const positions=new Array(data.positions.length),grain=data.grain?.slice(),j=new Float64Array(9),q=[0,0,0],relax=data.restSurface==='clean-pattern'?hangingDrape(item.form):restRelaxation(data);
  for(let i=0;i<positions.length;i+=3){formPoint(data.positions[i],data.positions[i+1],data.positions[i+2],item.form,q,relax);positions[i]=q[0];positions[i+1]=q[1];positions[i+2]=q[2];}
  if(grain)for(let f=0;f<data.triangles.length/3;f++){
    const a=data.triangles[f*3]*3,b=data.triangles[f*3+1]*3,c=data.triangles[f*3+2]*3,r=data.positions;
    differential((r[a]+r[b]+r[c])/3,(r[a+1]+r[b+1]+r[c+1])/3,(r[a+2]+r[b+2]+r[c+2])/3,item.form,j,relax);
    const i=f*4,u=grain[i],v=grain[i+1],w=grain[i+2],x=j[0]*u+j[3]*v+j[6]*w,y=j[1]*u+j[4]*v+j[7]*w,z=j[2]*u+j[5]*v+j[8]*w,len=Math.hypot(x,y,z)||1;
    grain[i]=x/len;grain[i+1]=y/len;grain[i+2]=z/len;
  }
  const result={...data,positions,grain};forms.set(item.id,result);return result;
}
