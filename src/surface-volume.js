// A geometric barrier on the display lattice. The cloth solver keeps its
// masses/forces; only locally collapsed mapping cells are minimally displaced.
export class CageVolumeProjection {
 constructor(layout,{minimumRatio=.04,passes=32}={}){
  this.base=layout.positions;this.positions=new Float64Array(this.base.length);this.minimumRatio=minimumRatio;this.passes=passes;
  const [nx,ny,nz]=layout.dimensions,permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]],ids=[],rest=[];
  this.free=new Uint8Array(this.base.length/3);for(let i=0;i<this.free.length;i++)this.free[i]=Math.abs(this.base[i*3+1]-layout.hi[1])>1e-6?1:0;
  for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++)for(const order of permutations){const q=[x,y,z],vertices=[];for(let j=0;j<4;j++){if(j)q[order[j-1]]++;vertices.push(q[2]*ny*nx+q[1]*nx+q[0]);}ids.push(...vertices);const [a,b,c,d]=vertices.map(i=>i*3),p=this.base,ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2],wx=p[d]-p[a],wy=p[d+1]-p[a+1],wz=p[d+2]-p[a+2];rest.push(ux*(vy*wz-vz*wy)-uy*(vx*wz-vz*wx)+uz*(vx*wy-vy*wx));}
  this.ids=new Uint16Array(ids);this.rest=new Float64Array(rest);this.lastStats=null;
 }
 project(field){
  const p=this.positions,base=this.base,ids=this.ids,rest=this.rest,free=this.free;for(let i=0;i<free.length;i++)for(let k=0;k<3;k++)p[i*3+k]=base[i*3+k]+field[i*4+k];let changed=false,totalCorrections=0,minimumBefore=Infinity,passes=0;
  for(let pass=0;pass<this.passes;pass++){let corrections=0;
   for(let t=0;t<rest.length;t++){
    const ai=ids[t*4],bi=ids[t*4+1],ci=ids[t*4+2],di=ids[t*4+3],a=ai*3,b=bi*3,c=ci*3,d=di*3,ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2],wx=p[d]-p[a],wy=p[d+1]-p[a+1],wz=p[d+2]-p[a+2],gx=vy*wz-vz*wy,gy=vz*wx-vx*wz,gz=vx*wy-vy*wx,det=ux*gx+uy*gy+uz*gz,ratio=det/rest[t];
    if(pass===0)minimumBefore=Math.min(minimumBefore,ratio);if(ratio>=this.minimumRatio-1e-8)continue;
    const sign=Math.sign(rest[t]),bx=gx*sign,by=gy*sign,bz=gz*sign,cx=(wy*uz-wz*uy)*sign,cy=(wz*ux-wx*uz)*sign,cz=(wx*uy-wy*ux)*sign,dx=(uy*vz-uz*vy)*sign,dy=(uz*vx-ux*vz)*sign,dz=(ux*vy-uy*vx)*sign,ax=-bx-cx-dx,ay=-by-cy-dy,az=-bz-cz-dz,
     denominator=free[ai]*(ax*ax+ay*ay+az*az)+free[bi]*(bx*bx+by*by+bz*bz)+free[ci]*(cx*cx+cy*cy+cz*cz)+free[di]*(dx*dx+dy*dy+dz*dz);
    if(denominator<1e-24)continue;const lambda=(Math.abs(rest[t])*this.minimumRatio-det*sign)/denominator*.9;
    if(free[ai]){p[a]+=lambda*ax;p[a+1]+=lambda*ay;p[a+2]+=lambda*az;}if(free[bi]){p[b]+=lambda*bx;p[b+1]+=lambda*by;p[b+2]+=lambda*bz;}if(free[ci]){p[c]+=lambda*cx;p[c+1]+=lambda*cy;p[c+2]+=lambda*cz;}if(free[di]){p[d]+=lambda*dx;p[d+1]+=lambda*dy;p[d+2]+=lambda*dz;}
    corrections++;changed=true;
   }
   totalCorrections+=corrections;passes=pass+1;if(!corrections)break;
  }
  let maxCorrection=0,rms=0;if(changed){for(let i=0;i<free.length;i++)for(let k=0;k<3;k++){const before=field[i*4+k],value=p[i*3+k]-base[i*3+k],delta=value-before;maxCorrection=Math.max(maxCorrection,Math.abs(delta));rms+=delta*delta;field[i*4+k]=value;}}
  this.lastStats={changed,passes,corrections:totalCorrections,minimumObservedFirstPass:minimumBefore,maxCorrection,rmsCorrection:Math.sqrt(rms/(free.length*3))};return field;
 }
}
