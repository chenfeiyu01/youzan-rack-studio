// Three prefix/suffix interval bitsets intersect conservative candidates.
// Exact swept bounds, exclusions and Float64 contact checks follow below.
export function candidates(
 queries:usize,queryActive:usize,queryCount:i32,bounds:usize,active:usize,count:i32,
 masks:usize,grid:usize,offsets:usize,result:usize,capacity:i32,
 cell:f64,minX:i32,minY:i32,minZ:i32,nx:i32,ny:i32,nz:i32,self:i32,
 old:usize,current:usize,primitives:usize,mode:i32,nearDistance:f64
):i32{
 const words=(count+31)>>5,total=nx+ny+nz,bytes=<usize>words*4;
 memory.fill(grid,0,<usize>(2*total)*bytes);
 for(let id=0;id<count;id++){
  if(!load<u8>(active+id))continue;const i=bounds+<usize>id*48,word=id>>5,bit=<u32>1<<(id&31);
  for(let axis=0;axis<3;axis++){
   const origin=axis===0?minX:axis===1?minY:minZ,base=axis===0?0:axis===1?nx:nx+ny;
   const lo=<i32>Math.floor(load<f64>(i+<usize>axis*8)/cell)-origin,hi=<i32>Math.floor(load<f64>(i+<usize>(axis+3)*8)/cell)-origin;
   const start=grid+<usize>(base+lo)*bytes+<usize>word*4,end=grid+<usize>(total+base+hi)*bytes+<usize>word*4;
   store<u32>(start,load<u32>(start)|bit);store<u32>(end,load<u32>(end)|bit);
  }
 }
 for(let axis=0;axis<3;axis++){
  const base=axis===0?0:axis===1?nx:nx+ny,n=axis===0?nx:axis===1?ny:nz;
  for(let row=1;row<n;row++)for(let w=0;w<words;w++){
   const p=grid+<usize>(base+row)*bytes+<usize>w*4,e=grid+<usize>(total+base+n-1-row)*bytes+<usize>w*4;
   store<u32>(p,load<u32>(p)|load<u32>(p-bytes));store<u32>(e,load<u32>(e)|load<u32>(e+bytes));
  }
 }
 let size=0;
 for(let q=0;q<queryCount;q++){
  store<u32>(offsets+<usize>q*4,size);if(!load<u8>(queryActive+q))continue;
  const i=queries+<usize>q*48,x0=load<f64>(i),y0=load<f64>(i+8),z0=load<f64>(i+16),x1=load<f64>(i+24),y1=load<f64>(i+32),z1=load<f64>(i+40);
  const ax=<i32>Math.floor(x0/cell)-minX,ay=<i32>Math.floor(y0/cell)-minY,az=<i32>Math.floor(z0/cell)-minZ,bx=<i32>Math.floor(x1/cell)-minX,by=<i32>Math.floor(y1/cell)-minY,bz=<i32>Math.floor(z1/cell)-minZ;
  if(ax>=nx||ay>=ny||az>=nz||bx<0||by<0||bz<0)continue;
  const sx=grid+<usize>min(nx-1,bx)*bytes,ex=grid+<usize>(total+max(0,ax))*bytes,sy=grid+<usize>(nx+min(ny-1,by))*bytes,ey=grid+<usize>(total+nx+max(0,ay))*bytes,sz=grid+<usize>(nx+ny+min(nz-1,bz))*bytes,ez=grid+<usize>(total+nx+ny+max(0,az))*bytes;
  const first=self?q>>5:0,maskRow=masks+<usize>(q*words)*4;
  for(let word=first;word<words;word++){
   const w=<usize>word*4;let bits=load<u32>(sy+w)&load<u32>(ey+w)&~load<u32>(maskRow+w);
   if(self&&word===first)bits&=<u32>(-2<<(q&31));if(!bits)continue;
   bits&=load<u32>(sx+w)&load<u32>(ex+w)&load<u32>(sz+w)&load<u32>(ez+w);
   while(bits){const bit=bits&-bits,other=(word<<5)+<i32>ctz(bit);bits^=bit;const j=bounds+<usize>other*48;
    if(x0>load<f64>(j+24)||x1<load<f64>(j)||y0>load<f64>(j+32)||y1<load<f64>(j+8)||z0>load<f64>(j+40)||z1<load<f64>(j+16))continue;
    if(mode&&!possibleContact(q,other,old,current,primitives,mode,nearDistance))continue;
    if(size===capacity)return -1;store<u32>(result+<usize>size*4,other);size++;
   }
  }
 }
 store<u32>(offsets+<usize>queryCount*4,size);return size;
}

@inline function dot(ax:f64,ay:f64,az:f64,bx:f64,by:f64,bz:f64):f64{return ax*bx+ay*by+az*bz;}
@inline function at(p:usize,node:i32,axis:i32):f64{return load<f64>(p+<usize>(node*3+axis)*8);}
// Recheck a conservative, padded neighbour list against this exact swept step.
// All current bounds, exclusions and continuous-contact tests still apply.
export function filterCandidates(queries:usize,queryActive:usize,queryCount:i32,bounds:usize,active:usize,count:i32,masks:usize,inputOffsets:usize,input:usize,offsets:usize,result:usize,old:usize,current:usize,primitives:usize,mode:i32,nearDistance:f64):i32{
 const words=(count+31)>>5;let size=0;
 for(let q=0;q<queryCount;q++){
  store<u32>(offsets+<usize>q*4,size);if(!load<u8>(queryActive+q))continue;
  const i=queries+<usize>q*48,x0=load<f64>(i),y0=load<f64>(i+8),z0=load<f64>(i+16),x1=load<f64>(i+24),y1=load<f64>(i+32),z1=load<f64>(i+40),row=masks+<usize>(q*words)*4;
  for(let pair=load<u32>(inputOffsets+<usize>q*4),end=load<u32>(inputOffsets+<usize>(q+1)*4);pair<end;pair++){
   const other=load<u32>(input+<usize>pair*4);if(!load<u8>(active+other)||(load<u32>(row+<usize>(other>>5)*4)&(<u32>1<<(other&31))))continue;
   const j=bounds+<usize>other*48;
   if(x0>load<f64>(j+24)||x1<load<f64>(j)||y0>load<f64>(j+32)||y1<load<f64>(j+8)||z0>load<f64>(j+40)||z1<load<f64>(j+16))continue;
   if(mode&&!possibleContact(q,other,old,current,primitives,mode,nearDistance))continue;
   store<u32>(result+<usize>size*4,other);size++;
  }
 }
 store<u32>(offsets+<usize>queryCount*4,size);return size;
}
// Exact rejection from the same Bernstein bound and endpoint test as JS CCD.
// Any interval that may contain an interior root remains in the complete JS
// cubic solver. This never substitutes a discrete test for a swept crossing.
function possibleContact(q:i32,other:i32,old:usize,p:usize,indices:usize,mode:i32,nearDistance:f64):bool{
 let ra:i32,rb:i32,ua:i32,ub:i32,va:i32,vb:i32;
 if(mode===1){ra=q;rb=load<i32>(indices+<usize>other*12);ua=load<i32>(indices+<usize>other*12+4);ub=rb;va=load<i32>(indices+<usize>other*12+8);vb=rb;}
 else{const a=load<i32>(indices+<usize>q*8),b=load<i32>(indices+<usize>q*8+4),c=load<i32>(indices+<usize>other*8),d=load<i32>(indices+<usize>other*8+4);ra=c;rb=a;ua=b;ub=a;va=d;vb=c;}
 const rx=at(old,ra,0)-at(old,rb,0),ry=at(old,ra,1)-at(old,rb,1),rz=at(old,ra,2)-at(old,rb,2),ux=at(old,ua,0)-at(old,ub,0),uy=at(old,ua,1)-at(old,ub,1),uz=at(old,ua,2)-at(old,ub,2),vx=at(old,va,0)-at(old,vb,0),vy=at(old,va,1)-at(old,vb,1),vz=at(old,va,2)-at(old,vb,2);
 const drx=(at(p,ra,0)-at(p,rb,0))-rx,dry=(at(p,ra,1)-at(p,rb,1))-ry,drz=(at(p,ra,2)-at(p,rb,2))-rz,dux=(at(p,ua,0)-at(p,ub,0))-ux,duy=(at(p,ua,1)-at(p,ub,1))-uy,duz=(at(p,ua,2)-at(p,ub,2))-uz,dvx=(at(p,va,0)-at(p,vb,0))-vx,dvy=(at(p,va,1)-at(p,vb,1))-vy,dvz=(at(p,va,2)-at(p,vb,2))-vz;
 const n0x=uy*vz-uz*vy,n0y=uz*vx-ux*vz,n0z=ux*vy-uy*vx,n1x=duy*vz-duz*vy+uy*dvz-uz*dvy,n1y=duz*vx-dux*vz+uz*dvx-ux*dvz,n1z=dux*vy-duy*vx+ux*dvy-uy*dvx,n2x=duy*dvz-duz*dvy,n2y=duz*dvx-dux*dvz,n2z=dux*dvy-duy*dvx;
 const c0=dot(rx,ry,rz,n0x,n0y,n0z),length=Math.sqrt(dot(n0x,n0y,n0z,n0x,n0y,n0z));if(length<1e-10||Math.abs(c0)/length<1e-6)return false;
 const c1=dot(drx,dry,drz,n0x,n0y,n0z)+dot(rx,ry,rz,n1x,n1y,n1z),c2=dot(drx,dry,drz,n1x,n1y,n1z)+dot(rx,ry,rz,n2x,n2y,n2z),c3=dot(drx,dry,drz,n2x,n2y,n2z),b0=c0,b1=c0+c1/3,b2=c0+2*c1/3+c2/3,b3=((0+c0)+c1)+c2+c3;
 if(!(Math.min(Math.min(b0,b1),Math.min(b2,b3))>0||Math.max(Math.max(b0,b1),Math.max(b2,b3))<0))return true;
 const ax=ux+dux,ay=uy+duy,az=uz+duz,bx=vx+dvx,by=vy+dvy,bz=vz+dvz,px=rx+drx,py=ry+dry,pz=rz+drz,nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,denNormal=Math.sqrt(dot(nx,ny,nz,nx,ny,nz)),side=c0>0?1.:-1.;
 const distance=mode===1?dot(px,py,pz,nx,ny,nz)/denNormal*side:-dot(-px,-py,-pz,nx,ny,nz)/denNormal*side;
 if(distance<0||distance>nearDistance)return false;
 if(mode===1){
  const aa=dot(ax,ay,az,ax,ay,az),ab=dot(ax,ay,az,bx,by,bz),bb=dot(bx,by,bz,bx,by,bz),pa=dot(px,py,pz,ax,ay,az),pb=dot(px,py,pz,bx,by,bz),den=aa*bb-ab*ab;
  if(den<1e-18)return false;const u=(pa*bb-pb*ab)/den,v=(pb*aa-pa*ab)/den;return u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6;
 }
 const aa=dot(ax,ay,az,ax,ay,az),bb=dot(ax,ay,az,bx,by,bz),ee=dot(bx,by,bz,bx,by,bz),cc=dot(ax,ay,az,-px,-py,-pz),ff=dot(bx,by,bz,-px,-py,-pz),den=aa*ee-bb*bb;
 if(den<1e-18)return false;const u=(bb*ff-cc*ee)/den,v=(bb*u+ff)/ee;return u>=-1e-6&&u<=1+1e-6&&v>=-1e-6&&v<=1+1e-6;
}
