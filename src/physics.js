// A small, fixed-step hanging-garment rig. The hook is fixed; the hanger has
// angular inertia, and a low-resolution two-layer XPBD cage carries the cloth.
// Cage offsets skin the detailed mesh on the GPU, including its printed ink.
export const HANGER_ROLL_LIMIT=.012,HANGER_PITCH_LIMIT=.008;
export const CLOTH_COLUMNS=5;
export const CLOTH_ROWS=9;
export const CLOTH_COUNT=CLOTH_COLUMNS*CLOTH_ROWS*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

export class Spring {
  constructor(value=0,stiffness=65,damping=9) {
    this.value=value;this.velocity=0;this.acceleration=0;this.stiffness=stiffness;this.damping=damping;
  }
  step(target,dt,force=0) {
    this.acceleration=this.stiffness*(target-this.value)-this.damping*this.velocity+force;
    this.velocity+=this.acceleration*dt;
    this.value+=this.velocity*dt;
    return this.value;
  }
  snap(value){this.value=value;this.velocity=0;this.acceleration=0;}
}

export class HangingMotion {
  constructor(x,yaw=-1.43,longSleeve=false,profile={}) {
    const mass=profile.mass??1,rate=1/Math.sqrt(mass);
    this.slideLimit=(longSleeve?1.15:1.45)/Math.pow(mass,.20);
    this.x=new Spring(x,150*rate,24*Math.sqrt(rate));
    this.y=new Spring(1.56,120*rate,22*Math.sqrt(rate));
    this.z=new Spring(0,100*rate,20*Math.sqrt(rate));
    this.turnLimit=(longSleeve?1.65:2.0)/Math.pow(mass,.30);
    const turn=(longSleeve?43:55)*rate;
    this.yaw=new Spring(yaw,turn,2*Math.sqrt(turn));
    this.roll=new Spring(0,19,7);
    this.pitch=new Spring(0,22,8);
  }
  step(x,z,yaw,dt,reduced=false,y=1.56) {
    if(reduced){this.x.snap(x);this.y.snap(y);this.z.snap(z);this.yaw.snap(yaw);this.roll.snap(0);this.pitch.snap(0);return;}
    if(!Number.isFinite(dt)||dt<=0)return;
    const slide=(spring,target,limit)=>{
      const previous=spring.value,previousVelocity=spring.velocity;
      spring.step(target,dt);spring.velocity=clamp(spring.velocity,-limit,limit);spring.value=previous+spring.velocity*dt;
      // The velocity limiter is the carrier actuator. At constant limited
      // speed its actual acceleration is zero, even if spring demand is high.
      spring.acceleration=(spring.velocity-previousVelocity)/dt;
    };
    slide(this.x,x,this.slideLimit);slide(this.y,y,.85);slide(this.z,z,.85);
    slide(this.yaw,yaw,this.turnLimit);
    this.roll.step(0,dt,-clamp(this.x.acceleration,-35,35)*.045);
    this.pitch.step(0,dt,clamp(this.z.acceleration,-20,20)*.035);
    // A rigid angular stop absorbs outward momentum. Do not retain hidden
    // velocity while the visible hanger is already resting against its limit.
    for(const[spring,limit]of[[this.roll,HANGER_ROLL_LIMIT],[this.pitch,HANGER_PITCH_LIMIT]]){
      if(spring.value>limit){spring.value=limit;spring.velocity=Math.min(spring.velocity,0);}
      else if(spring.value< -limit){spring.value=-limit;spring.velocity=Math.max(spring.velocity,0);}
    }
  }
}

export class ClothCage {
  constructor(longSleeve=false,profile={}) {
    this.position=new Float64Array(CLOTH_COUNT*3);
    this.previous=new Float64Array(CLOTH_COUNT*3);
    this.rest=new Float64Array(CLOTH_COUNT*3);
    this.targetWorld=new Float64Array(CLOTH_COUNT*3);
    this.tetherLambda=new Float64Array(CLOTH_COUNT*3);
    this.velocity=new Float64Array(CLOTH_COUNT*3);
    this.offsets=new Float32Array(CLOTH_COUNT*3);
    this.inverseMass=new Float64Array(CLOTH_COUNT);
    this.constraints=[];
    this.longSleeve=longSleeve;
    this.profile={mass:1,drag:longSleeve?1.9:2.5,softness:1,asymmetry:0,...profile};
    this.initialized=false;
    const id=(layer,row,col)=>layer*CLOTH_ROWS*CLOTH_COLUMNS+row*CLOTH_COLUMNS+col;
    for(let layer=0;layer<2;layer++)for(let row=0;row<CLOTH_ROWS;row++)for(let col=0;col<CLOTH_COLUMNS;col++) {
      const index=id(layer,row,col),i=index*3;
      this.rest[i]=-1.45+col*2.9/(CLOTH_COLUMNS-1);
      this.rest[i+1]=.98-row*2.58/(CLOTH_ROWS-1);
      this.rest[i+2]=(layer?-.14:.14);
      const side=(col/(CLOTH_COLUMNS-1)-.5)*2;
      this.inverseMass[index]=row<2?0:1/(this.profile.mass*(.8+.35*row/(CLOTH_ROWS-1))*(1+this.profile.asymmetry*side));
    }
    this.position.set(this.rest);this.previous.set(this.rest);
    const link=(a,b,compliance)=>{
      let distance=0;
      for(let k=0;k<3;k++)distance+=(this.rest[a*3+k]-this.rest[b*3+k])**2;
      this.constraints.push({a,b,length:Math.sqrt(distance),compliance:compliance*this.profile.softness,lambda:0});
    };
    for(let l=0;l<2;l++)for(let r=0;r<CLOTH_ROWS;r++)for(let c=0;c<CLOTH_COLUMNS;c++) {
      const a=id(l,r,c);
      if(c+1<CLOTH_COLUMNS)link(a,id(l,r,c+1),.000002);
      if(r+1<CLOTH_ROWS)link(a,id(l,r+1,c),.000001);
      if(c+1<CLOTH_COLUMNS&&r+1<CLOTH_ROWS){link(a,id(l,r+1,c+1),.000015);link(id(l,r,c+1),id(l,r+1,c),.000015);}
      if(r+2<CLOTH_ROWS)link(a,id(l,r+2,c),.006);
      if(c+2<CLOTH_COLUMNS)link(a,id(l,r,c+2),.009);
      if(l===0)link(a,id(1,r,c),.012);
    }
  }

  step(dt,pose,reduced=false) {
    const p=this.position,v=this.velocity,rest=this.rest;
    // Simulate in world coordinates. Rotating the hook moves only pinned
    // shoulder particles; the rest of the cloth retains its world momentum.
    const {x=0,y=1.56,z=0,yaw=0,roll=0,pitch=0,scale=1}=pose;
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cz=Math.cos(roll),sz=Math.sin(roll),cx=Math.cos(pitch),sx=Math.sin(pitch);
    const target=this.targetWorld;
    for(let i=0;i<rest.length;i+=3) {
      const rx=rest[i]*scale,ry=(rest[i+1]-1.58)*scale,rz=rest[i+2]*scale;
      const py=ry*cx-rz*sx,pz=ry*sx+rz*cx;
      const qx=rx*cy+pz*sy,qz=-rx*sy+pz*cy;
      target[i]=x+qx*cz-py*sz;target[i+1]=y+qx*sz+py*cz;target[i+2]=z+qz;
    }
    if(!this.initialized||reduced) {
      this.initialized=true;p.set(target);this.previous.set(target);v.fill(0);this.offsets.fill(0);
      if(reduced)return;
    }
    this.previous.set(p);
    const air=Math.exp(-this.profile.drag*dt);
    for(let index=0;index<CLOTH_COUNT;index++) {
      if(!this.inverseMass[index])continue;
      const i=index*3;
      v[i]*=air;v[i+1]=(v[i+1]-9.81*dt)*air;v[i+2]*=air;
      for(let k=0;k<3;k++)p[i+k]+=v[i+k]*dt;
    }
    for(const con of this.constraints)con.lambda=0;
    this.tetherLambda.fill(0);
    const tetherAlpha=(this.longSleeve?.065:.045)*this.profile.softness/(dt*dt);
    for(let iteration=0;iteration<6;iteration++) {
      for(let index=0;index<CLOTH_COUNT;index++)if(!this.inverseMass[index]) {
        const i=index*3;p[i]=target[i];p[i+1]=target[i+1];p[i+2]=target[i+2];
      }
      for(const con of this.constraints) {
        const i=con.a*3,j=con.b*3,w0=this.inverseMass[con.a],w1=this.inverseMass[con.b];
        if(w0+w1===0)continue;
        const dx=p[i]-p[j],dy=p[i+1]-p[j+1],dz=p[i+2]-p[j+2];
        const len=Math.hypot(dx,dy,dz);
        if(len<1e-8)continue;
        const alpha=con.compliance/(dt*dt);
        const delta=(-(len-con.length*scale)-alpha*con.lambda)/(w0+w1+alpha);
        con.lambda+=delta;
        const a=delta*w0/len,b=delta*w1/len;
        p[i]+=dx*a;p[i+1]+=dy*a;p[i+2]+=dz*a;
        p[j]-=dx*b;p[j+1]-=dy*b;p[j+2]-=dz*b;
      }
      for(let index=0;index<CLOTH_COUNT;index++) {
        const i=index*3;
        if(!this.inverseMass[index])continue;
        // A compliant shape-memory tether preserves the authored folds without
        // attaching every vertex rigidly to the hanger's transform.
        for(let k=0;k<3;k++) {
          const weight=this.inverseMass[index];
          const delta=(-(p[i+k]-target[i+k])-tetherAlpha*this.tetherLambda[i+k])/(weight+tetherAlpha);
          this.tetherLambda[i+k]+=delta;p[i+k]+=weight*delta;
        }
        const lower=Math.floor((index%(CLOTH_ROWS*CLOTH_COLUMNS))/CLOTH_COLUMNS)/(CLOTH_ROWS-1);
        const maxDistance=(.07+.7*Math.pow(lower,.8))*scale;
        const dx=p[i]-target[i],dy=p[i+1]-target[i+1],dz=p[i+2]-target[i+2],d=Math.hypot(dx,dy,dz);
        if(d>maxDistance){const s=maxDistance/d;p[i]=target[i]+dx*s;p[i+1]=target[i+1]+dy*s;p[i+2]=target[i+2]+dz*s;}
      }
    }
    for(let i=0;i<p.length;i++)v[i]=(p[i]-this.previous[i])/dt;
    for(let index=0;index<CLOTH_COUNT;index++) {
      const i=index*3;
      const wx=p[i]-x,wy=p[i+1]-y,wz=p[i+2]-z;
      const qx=wx*cz+wy*sz,qy=-wx*sz+wy*cz;
      const rx=qx*cy-wz*sy,rz=qx*sy+wz*cy;
      const ry=qy*cx+rz*sx,pz=-qy*sx+rz*cx;
      this.offsets[i]=rx/scale-rest[i];
      this.offsets[i+1]=ry/scale+1.58-rest[i+1];
      this.offsets[i+2]=pz/scale-rest[i+2];
    }
  }

  sample(x,y,z) {
    const gx=clamp((x+1.45)/2.9*(CLOTH_COLUMNS-1),0,CLOTH_COLUMNS-1.00001);
    const gy=clamp((.98-y)/2.58*(CLOTH_ROWS-1),0,CLOTH_ROWS-1.00001);
    const c=Math.floor(gx),r=Math.floor(gy),u=gx-c,t=gy-r,w=clamp((.14-z)/.28,0,1);
    const result=[0,0,0];
    for(let layer=0;layer<2;layer++)for(let row=0;row<2;row++)for(let col=0;col<2;col++) {
      const weight=(layer?w:1-w)*(row?t:1-t)*(col?u:1-u);
      const index=(layer*CLOTH_ROWS*CLOTH_COLUMNS+(r+row)*CLOTH_COLUMNS+c+col)*3;
      for(let k=0;k<3;k++)result[k]+=this.offsets[index+k]*weight;
    }
    return result;
  }
}
