import{SurfaceAerodynamics}from'./surface-aerodynamics.js';
import{MODEL_METRES}from'./model-config.js';
import {TriangleStrain}from'./surface-strain.js';
import{ShellConstraints}from'./surface-shell.js';
import {buildSurfaceSeams} from './surface-seams.js';
import {SurfaceContacts} from './surface-contact.js';
import {DihedralBending} from './surface-bending.js';
import {SurfaceParticleGrid} from './surface-particle-grid.js';
// XPBD on the garment's actual welded surface, rather than a rectangular cage.
// Stretch is stiff; fold resistance, areal mass and aerodynamic drag vary by item.
const CLOTH_ITERATIONS=5,CONTACT_REFINEMENT_ITERATIONS=4;
const MAX_SHELL_ORIENTATION_PASSES=512;
// The texture calibration assumes .283 metres per model unit.
const GRAVITY=9.81/MODEL_METRES;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const length=(x,y,z)=>Math.sqrt(x*x+y*y+z*z);
// Packed cell keys repeat every 1024 cells. Reject only when every such slab,
// expanded by observed movement of inserted particles, is out of reach.
function outsideBackgroundCell(value,index,width,reach){
 const period=width*1024,delta=value-(index+.5)*width;
 if(!(width>0)||!Number.isFinite(delta)||Math.abs(delta)>1e12*width)return false;
 const distance=Math.abs(delta-Math.round(delta/period)*period);
 return distance>width*.5+reach+1e-10*Math.max(1,Math.abs(value));
}

export class SurfaceCloth {
  constructor(data,profile={}) {
    this.rest=new Float64Array(data.positions);this.triangles=new Uint32Array(data.triangles);this.count=this.rest.length/3;
    this.position=new Float64Array(this.rest.length);this.previous=new Float64Array(this.rest.length);this.velocity=new Float64Array(this.rest.length);
    this.target=new Float64Array(this.rest.length);this.local=new Float32Array(this.rest);this.offsets=new Float32Array(this.rest.length);this.normal=new Float32Array(this.rest.length);
    this.backgroundGrid=new SurfaceParticleGrid(this.count);
    this.backgroundCellOrigins=new Float64Array(this.rest.length);
    this.arealMass=new Float64Array(this.count);
    this.inverseMass=new Float64Array(this.count);this.areas=new Float64Array(this.count);this.tetherLambda=new Float64Array(this.rest.length);
    this.profile={mass:1,drag:2.5,softness:1,asymmetry:0,friction:{static:.35,dynamic:.25},bending:{u:1.25,v:.85,mixed:1},stretch:{u:1.5e-7,v:3e-7,shear:2e-5},...profile};this.constraints=[];this.neighbors=Array.from({length:this.count},()=>new Set());
    this.initialized=false;this.phase=0;this.asleep=false;this.lastPose=null;this.stillFrames=0;this.version=0;
    const edges=new Map(),r=this.rest,t=this.triangles;
    for(let i=0;i<t.length;i+=3) {
      const a=t[i],b=t[i+1],c=t[i+2],ax=r[b*3]-r[a*3],ay=r[b*3+1]-r[a*3+1],az=r[b*3+2]-r[a*3+2],bx=r[c*3]-r[a*3],by=r[c*3+1]-r[a*3+1],bz=r[c*3+2]-r[a*3+2];
      const area=length(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx)/6;
      this.areas[a]+=area;this.areas[b]+=area;this.areas[c]+=area;
      for(const [u,v,opposite] of [[a,b,c],[b,c,a],[c,a,b]]) {
        this.neighbors[u].add(v);this.neighbors[v].add(u);const key=u<v?u+':'+v:v+':'+u;
        const edge=edges.get(key);if(edge){edge.opposite.push(opposite);edge.faces.push(i/3);}else edges.set(key,{a:u,b:v,opposite:[opposite],faces:[i/3]});
      }
    }
    // Rest-space height factors are constant; retain the same arithmetic in
    // every solve without repeating powers and clamps for five iterations.
    this.tetherBase=new Float64Array(this.count);this.maxOffsetBase=new Float64Array(this.count);
    for(let node=0;node<this.count;node++){const lower=clamp((.55-r[node*3+1])/2.15,0,1);this.tetherBase[node]=.003+.012*lower;this.maxOffsetBase[node]=.08+1.0*Math.pow(lower,.75);}
    const average=this.areas.reduce((a,b)=>a+b,0)/this.count;
    for(let i=0;i<this.count;i++){
      this.arealMass[i]=this.profile.mass*(1+this.profile.asymmetry*clamp(r[i*3],-1,1));
      this.inverseMass[i]=r[i*3+1]>=.55?0:1/(this.profile.mass*clamp(this.areas[i]/average,.35,3)*(1+this.profile.asymmetry*clamp(r[i*3],-1,1)));
    }
    this.aerodynamics=new SurfaceAerodynamics(data,this.areas,this.arealMass);
    this.strain=new TriangleStrain(data,this.profile.stretch);
    const linked=new Set();
    const add=(a,b,compliance,bend=false)=>{
      const key=a<b?a+':'+b:b+':'+a;if(linked.has(key)||a===b)return;linked.add(key);
      const c={a,b,length:length(r[a*3]-r[b*3],r[a*3+1]-r[b*3+1],r[a*3+2]-r[b*3+2]),compliance,lambda:0,bend};this.constraints.push(c);return c;
    };
    for(const edge of edges.values()){const c=add(edge.a,edge.b,.00000015);if(c)c.replacedByStrain=edge.faces.length<=2&&edge.faces.every(f=>this.strain.active[f]);}
    if(data.grain&&data.grain.length!==this.triangles.length/3*4)throw new RangeError('布纹数据与三角面数量不符');
    this.bending=new DihedralBending(r,edges.values(),this.profile.softness,{grain:data.grain,rigidity:this.profile.bending});
    // Stitch duplicate seam vertices without averaging opposing surface normals.
    for(let a=0;a<this.count;a++)for(let b=0;b<a;b++){
      const i=a*3,j=b*3,dx=r[i]-r[j],dy=r[i+1]-r[j+1],dz=r[i+2]-r[j+2];
      if(dx*dx+dy*dy+dz*dz<.000004)add(a,b,.00000001);
    }
    // Reconnect disconnected UV/trim panels at their nearest seam locations.
    // Keep their normals distinct while transferring tension across the seam.
    const parent=Array.from({length:this.count},(_,i)=>i);
    const root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
    for(const c of this.constraints)parent[root(c.a)]=root(c.b);
    const groups=new Map();for(let i=0;i<this.count;i++){const id=root(i);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(i);}
    const components=[...groups.values()].sort((a,b)=>b.length-a.length),connected=new Set(components[0]);
    for(const part of components.slice(1)){
      const pairs=[];for(const a of part)for(const b of connected){const i=a*3,j=b*3,d=(r[i]-r[j])**2+(r[i+1]-r[j+1])**2+(r[i+2]-r[j+2])**2;if(d<.04)pairs.push({a,b,d});}
      pairs.sort((a,b)=>a.d-b.d);const stitched=new Set();let links=0;
      for(const pair of pairs){if(stitched.has(pair.a))continue;add(pair.a,pair.b,.00000003);stitched.add(pair.a);if(++links>=Math.min(6,part.length))break;}
      for(const a of part)connected.add(a);
    }
    this.shell=new ShellConstraints(data);this.seams=buildSurfaceSeams(data).map(s=>({...s,lambda:0}));
    for(const s of this.seams){this.neighbors[s.a].add(s.b);this.neighbors[s.a].add(s.c);this.neighbors[s.b].add(s.a);this.neighbors[s.c].add(s.a);}
    this.contactLinks=[...this.constraints,...this.bending.links,...this.shell.links,...this.seams.flatMap(s=>[{a:s.a,b:s.b},{a:s.a,b:s.c}])];
    this.computeNormals();this.restNormal=new Float32Array(this.normal);this.contacts=new SurfaceContacts(data,this.inverseMass,this.contactLinks,this.profile.friction);
  }
  computeNormals() {
    const p=this.local,n=this.normal,t=this.triangles;n.fill(0);
    for(let i=0;i<t.length;i+=3){const a=t[i]*3,b=t[i+1]*3,c=t[i+2]*3,ax=p[b]-p[a],ay=p[b+1]-p[a+1],az=p[b+2]-p[a+2],bx=p[c]-p[a],by=p[c+1]-p[a+1],bz=p[c+2]-p[a+2],nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;for(const j of [a,b,c]){n[j]+=nx;n[j+1]+=ny;n[j+2]+=nz;}}
    for(let i=0;i<n.length;i+=3){const len=length(n[i],n[i+1],n[i+2])||1;n[i]/=len;n[i+1]/=len;n[i+2]/=len;}
  }
  step(dt,pose,reduced=false) {
    const {x=0,y=1.56,z=0,yaw=0,roll=0,pitch=0,scale=1}=pose;
    const poseValues=[x,y,z,yaw,roll,pitch,scale];
    const changed=!this.lastPose||poseValues.some((v,i)=>Math.abs(v-this.lastPose[i])>1e-6);
    this.lastPose=poseValues;
    // Hidden rigs invalidate their world state. Even an unchanged pose must
    // initialize again before this cloth can participate in rack contacts.
    if(this.initialized&&this.asleep&&!changed&&!reduced){this.previous.set(this.position);return;}
    this.asleep=false;this.version++;
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cz=Math.cos(roll),sz=Math.sin(roll),cx=Math.cos(pitch),sx=Math.sin(pitch);
    const target=this.target,p=this.position,prev=this.previous,v=this.velocity,r=this.rest,w=this.inverseMass;
    for(let i=0;i<r.length;i+=3){const rx=r[i]*scale,ry=(r[i+1]-1.58)*scale,rz=r[i+2]*scale,py=ry*cx-rz*sx,pz=ry*sx+rz*cx,qx=rx*cy+pz*sy,qz=-rx*sy+pz*cy;target[i]=x+qx*cz-py*sz;target[i+1]=y+qx*sz+py*cz;target[i+2]=z+qz;}
    if(!this.initialized||reduced){this.initialized=true;p.set(target);prev.set(target);v.fill(0);this.local.set(r);this.normal.set(this.restNormal);this.offsets.fill(0);this.asleep=reduced||(pitch===0&&roll===0);return;}
    prev.set(p);
    // Evaluate each panel in the existing world surface before prediction.
    // Nodal quadrature keeps local air work dissipative without averaging away
    // the opposing normals at a folded crease.
    this.aerodynamics.step(p,v,w,dt,this.profile.drag,scale);
    // The authored upright drape already carries its static gravity load.
    // Rotate that reference support with the carrier, but leave gravity vertical.
    // Their difference vanishes for yaw alone; tilt retains the missing load.
    const gx=GRAVITY*(cz*sy*sx-sz*cx),gy=GRAVITY*(sz*sy*sx+cz*cx-1),gz=GRAVITY*cy*sx;
    for(let node=0;node<this.count;node++) {
      if(!w[node])continue;const i=node*3;
      v[i]+=gx*dt;v[i+1]+=gy*dt;v[i+2]+=gz*dt;
      p[i]+=v[i]*dt;p[i+1]+=v[i+1]*dt;p[i+2]+=v[i+2]*dt;
    }
    for(const c of this.constraints)c.lambda=0;for(const s of this.seams)s.lambda=0;this.strain.reset();this.bending.reset();this.shell.reset();this.tetherLambda.fill(0);
    // Reuse the same XPBD multipliers while transmitting contact corrections
    // back into cloth tension. A separate post-process left cuff contacts and
    // seam/stretch constraints pulling against each other across time steps.
    let collisionScanned=false,refined=false;
    for(let iteration=0;iteration<CLOTH_ITERATIONS+CONTACT_REFINEMENT_ITERATIONS;iteration++) {
      if(iteration===CLOTH_ITERATIONS){
        if(this.preciseContacts===false)break;
        this.contacts.solve(prev,p,scale);collisionScanned=true;
        if(this.contacts.contacts.length===0)break;
      }
      if(iteration>=CLOTH_ITERATIONS)refined=true;
      for(let node=0;node<this.count;node++)if(!w[node]){const i=node*3;p[i]=target[i];p[i+1]=target[i+1];p[i+2]=target[i+2];}
      // Alternate the traversal to reduce a preferred left-to-right solver bias.
      for(let j=0;j<this.constraints.length;j++) {
        const c=this.constraints[iteration%2?this.constraints.length-1-j:j];if(c.replacedByStrain)continue;const i=c.a*3,k=c.b*3,w0=w[c.a],w1=w[c.b];if(w0+w1===0)continue;
        const dx=p[i]-p[k],dy=p[i+1]-p[k+1],dz=p[i+2]-p[k+2],len=length(dx,dy,dz);if(len<1e-8)continue;
        const alpha=c.compliance/(dt*dt),dl=(-(len-c.length*scale)-alpha*c.lambda)/(w0+w1+alpha);c.lambda+=dl;
        const a=dl*w0/len,b=dl*w1/len;p[i]+=dx*a;p[i+1]+=dy*a;p[i+2]+=dz*a;p[k]-=dx*b;p[k+1]-=dy*b;p[k+2]-=dz*b;
      }
      this.strain.solve(p,w,dt,Boolean(iteration%2),scale);
      this.bending.solve(p,w,dt,Boolean(iteration%2));
      this.shell.solve(p,w,dt,Boolean(iteration%2),scale);
      for(const seam of this.seams){
        const i=seam.a*3,j=seam.b*3,k=seam.c*3,b=1-seam.fraction,c=seam.fraction,dx=p[i]-b*p[j]-c*p[k],dy=p[i+1]-b*p[j+1]-c*p[k+1],dz=p[i+2]-b*p[j+2]-c*p[k+2],len=length(dx,dy,dz);if(len<1e-9)continue;
        const alpha=seam.compliance/(dt*dt),weight=w[seam.a]+w[seam.b]*b*b+w[seam.c]*c*c,dl=(-(len-seam.length*scale)-alpha*seam.lambda)/(weight+alpha);seam.lambda+=dl;
        for(let axis=0;axis<3;axis++){const n=(axis===0?dx:axis===1?dy:dz)/len;p[i+axis]+=n*dl*w[seam.a];p[j+axis]-=n*dl*w[seam.b]*b;p[k+axis]-=n*dl*w[seam.c]*c;}
      }
      for(let node=0;node<this.count;node++) {
        if(!w[node])continue;const i=node*3;
        // The supplied mesh is an authored hanging equilibrium. A weak, compliant
        // rest-shape term retains its creases while allowing surface inertia.
        const alpha=this.tetherBase[node]*this.profile.softness/(dt*dt);
        for(let k=0;k<3;k++){const dl=(-(p[i+k]-target[i+k])-alpha*this.tetherLambda[i+k])/(w[node]+alpha);this.tetherLambda[i+k]+=dl;p[i+k]+=w[node]*dl;}
        const dx=p[i]-target[i],dy=p[i+1]-target[i+1],dz=p[i+2]-target[i+2],d=length(dx,dy,dz),max=this.maxOffsetBase[node]*scale;
        if(d>max){const a=max/d;p[i]=target[i]+dx*a;p[i+1]=target[i+1]+dy*a;p[i+2]=target[i+2]+dz*a;}
      }
      if(iteration>=CLOTH_ITERATIONS)for(let pass=0;pass<2;pass++)for(const c of this.contacts.contacts)this.contacts.project(c,p);
    }
    if(this.preciseContacts===false&&this.phase++%2===0)this.separateSurface(scale);
    // Recheck the complete swept interval for contacts introduced by refinement.
    if(this.preciseContacts!==false){if(!collisionScanned||refined)this.contacts.solve(prev,p,scale);}
    else this.contacts.contacts.length=0;
    // Contact corrections can disturb a thin shell. Restore its signed side
    // before deriving velocities, with early exit once all gaps are valid.
    for(let pass=0;pass<MAX_SHELL_ORIENTATION_PASSES;pass++){
      const reverse=Boolean(pass%2),corrected=pass>=16&&pass%8===0
        ?this.shell.enforceCoupledOrientation(p,w,scale,reverse)
        :this.shell.enforceOrientation(p,w,scale,reverse);
      if(corrected===0)break;
    }
    for(let node=0;node<this.count;node++) {
      const i=node*3;
      for(let k=0;k<3;k++)v[i+k]=(p[i+k]-prev[i+k])/dt;
    }
    this.updateLocal();
    this.contacts.applyVelocities(v,p);
    let energy=0;for(let i=0;i<v.length;i++)energy+=v[i]*v[i];
    this.stillFrames=!changed&&energy/this.count<.000005?this.stillFrames+1:0;
    if(this.stillFrames>45){this.asleep=true;v.fill(0);}
  }
  updateLocal() {
    const [x,y,z,yaw,roll,pitch,scale]=this.lastPose,cy=Math.cos(yaw),sy=Math.sin(yaw),cz=Math.cos(roll),sz=Math.sin(roll),cx=Math.cos(pitch),sx=Math.sin(pitch),p=this.position,r=this.rest;
    for(let i=0;i<p.length;i+=3){
      const wx=p[i]-x,wy=p[i+1]-y,wz=p[i+2]-z,qx=wx*cz+wy*sz,qy=-wx*sz+wy*cz,rx=qx*cy-wz*sy,rz=qx*sy+wz*cy,ry=qy*cx+rz*sx,pz=-qy*sx+rz*cx;
      this.local[i]=rx/scale;this.local[i+1]=ry/scale+1.58;this.local[i+2]=pz/scale;
      for(let k=0;k<3;k++)this.offsets[i+k]=this.local[i+k]-r[i+k];
    }
    // Keep aerodynamic directions current in every physics step, including
    // corrections from other garments, independently of GPU upload cadence.
    this.computeNormals();
  }
  separateSurface(scale) {
    const p=this.position,r=this.rest,w=this.inverseMass,cell=.06*scale,maxRadius=.024*scale,grid=this.backgroundGrid,origins=this.backgroundCellOrigins;grid.reset();
    let spillX=0,spillY=0,spillZ=0;
    const keyOf=(x,y,z)=>((x&1023)<<20)|((y&1023)<<10)|(z&1023);
    for(let a=0;a<this.count;a++){
      const i=a*3,gx=Math.floor(p[i]/cell),gy=Math.floor(p[i+1]/cell),gz=Math.floor(p[i+2]/cell);
      origins[i]=gx*cell;origins[i+1]=gy*cell;origins[i+2]=gz*cell;
      for(let x=-1;x<=1;x++){
        if(outsideBackgroundCell(p[i],gx+x,cell,maxRadius+spillX))continue;
        for(let y=-1;y<=1;y++){
          if(outsideBackgroundCell(p[i+1],gy+y,cell,maxRadius+spillY))continue;
          for(let z=-1;z<=1;z++){
            if(outsideBackgroundCell(p[i+2],gz+z,cell,maxRadius+spillZ))continue;
            for(let b=grid.first(keyOf(gx+x,gy+y,gz+z));b!==-1;b=grid.next[b]){
              if(this.neighbors[a].has(b)||w[a]+w[b]===0)continue;const j=b*3;
              const dx=p[i]-p[j],dy=p[i+1]-p[j+1],dz=p[i+2]-p[j+2],dist=length(dx,dy,dz);
              if(dist>=maxRadius||dist<1e-8)continue;
              const restDistance=length(r[i]-r[j],r[i+1]-r[j+1],r[i+2]-r[j+2]),radius=Math.min(.024,restDistance*.5)*scale;
              if(dist>=radius)continue;const push=(radius-dist)/(dist*(w[a]+w[b]));
              p[i]+=dx*push*w[a];p[i+1]+=dy*push*w[a];p[i+2]+=dz*push*w[a];p[j]-=dx*push*w[b];p[j+1]-=dy*push*w[b];p[j+2]-=dz*push*w[b];
              // Buckets retain their original keys after a push. Expand later
              // queries conservatively instead of assuming particles stayed put.
              spillX=Math.max(spillX,origins[j]-p[j],p[j]-origins[j]-cell);
              spillY=Math.max(spillY,origins[j+1]-p[j+1],p[j+1]-origins[j+1]-cell);
              spillZ=Math.max(spillZ,origins[j+2]-p[j+2],p[j+2]-origins[j+2]-cell);
            }
          }
        }
      }
      spillX=Math.max(spillX,origins[i]-p[i],p[i]-origins[i]-cell);
      spillY=Math.max(spillY,origins[i+1]-p[i+1],p[i+1]-origins[i+1]-cell);
      spillZ=Math.max(spillZ,origins[i+2]-p[i+2],p[i+2]-origins[i+2]-cell);
      grid.add(keyOf(gx,gy,gz),a);
    }
  }
}
