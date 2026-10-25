import {Matrix4,Vector3} from 'three';
import {RACK_YAW,INSPECTION_Y,INSPECTION_Z,MAX_INSPECTION_SCALE} from './rack-layout.js';
import {HANGER_ROLL_LIMIT,HANGER_PITCH_LIMIT} from './physics.js';
import {circularDifference} from './rack-presentation.js';

// The renderer and placement geometry use the same unchanged rail cylinder.
export const RAIL=Object.freeze({radius:.035,height:1.57,length:9.12});
const SIDE=RACK_YAW,CY=RAIL.height,R=RAIL.radius,SKIN=1.e-5;
const angle=circularDifference;
// Extrema of an edge plus a circle, swept along the rail-relative Z segment.
function edgeEnvelope(ay,az,by,bz,r,depth,bounds){
 const dy=by-ay,dz=bz-az,cuts=[0,1];if(Math.abs(dz)>1e-16)for(const z of[-depth-r,-depth,0,r]){const t=(z-az)/dz;if(t>0&&t<1)cuts.push(t);}cuts.sort((a,b)=>a-b);
 const add=(t,center)=>{const y=ay+dy*t,z=az+dz*t,offset=center==null?0:z-center;if(Math.abs(offset)>r+1e-12)return;const extra=Math.sqrt(Math.max(0,r*r-offset*offset));bounds[0]=Math.min(bounds[0],y-extra);bounds[1]=Math.max(bounds[1],y+extra);};
 for(let i=0;i<cuts.length-1;i++){
  const lo=cuts[i],hi=cuts[i+1],mid=az+dz*(lo+hi)/2,center=mid>0?0:mid< -depth?-depth:null;if(center!=null&&Math.abs(mid-center)>r)continue;
  add(lo,center);add(hi,center);
  if(center!=null&&Math.abs(dz)>1e-16){const length=Math.hypot(dy,dz),q=dy*Math.sign(dz)*r/length;for(const z of[q,-q]){const t=(center+z-az)/dz;if(t>lo&&t<hi)add(t,center);}}
 }
}
export function forbiddenIntervals(data,depth=0,{yaw=SIDE,radius=R+SKIN}={}){
 const p=data.positions,tri=data.triangles,projected=new Float64Array(p.length/3*2),cy=Math.cos(yaw),sy=Math.sin(yaw),intervals=[];
 for(let i=0,j=0;i<p.length;i+=3,j+=2){projected[j]=p[i+1];projected[j+1]=-p[i]*sy+p[i+2]*cy;}
 for(let i=0;i<tri.length;i+=3){const bounds=[Infinity,-Infinity];for(let k=0;k<3;k++){const a=tri[i+k]*2,b=tri[i+(k+1)%3]*2;edgeEnvelope(projected[a],projected[a+1],projected[b],projected[b+1],radius,depth,bounds);}if(bounds[0]<Infinity)intervals.push([CY-bounds[1],CY-bounds[0]]);}
 intervals.sort((a,b)=>a[0]-b[0]);const merged=[];for(const i of intervals){const previous=merged.at(-1);if(previous&&i[0]<=previous[1]+1e-12)previous[1]=Math.max(previous[1],i[1]);else merged.push(i);}return merged;
}
export function seatGeometry(data,clearanceZ=INSPECTION_Z){
 const rotationZ=freeDepth(data);clearanceZ=Math.max(clearanceZ,rotationZ+.01);
 const vertical=forbiddenIntervals(data),horizontal=forbiddenIntervals(data,clearanceZ);if(vertical.length<2)throw Error('The hanger has no rail-sized opening');
 const restY=vertical[0][1]+SKIN,ceiling=vertical[1][0]-SKIN,candidates=[];let below=restY;
 for(const[lo,hi]of horizontal){const low=Math.max(restY,below),high=Math.min(ceiling,lo);if(high-low>.004)candidates.push([low,high]);below=Math.max(below,hi+SKIN);}
 candidates.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]));if(!candidates.length)throw Error('The hook cannot be withdrawn along this path');const corridor=candidates[0];return{rotationZ,restY,transitY:(corridor[0]+corridor[1])/2,clearanceZ,corridor,vertical,horizontal};
}
// This plans the controlled pickup/return of the rigid hanger. The existing
// world-space cloth solver still responds to every actual carrier step.
export class HangerPlacement{
 static fromObject(root){return new HangerPlacement(seatGeometry(rigidHangerData(root)));}
 get moving(){return this.phase!=='seated'&&this.phase!=='free';}
 constructor(geometry){Object.assign(this,geometry);this.rotationZ=geometry.rotationZ??geometry.clearanceZ;this.phase='seated';this.wanted=false;this.holdYaw=SIDE;this.holdY=this.restY;}
 inCorridor(m){let y=m.y.value,v=m.y.velocity;for(let i=0;i<120;i++){if(y<this.corridor[0]+.002||y>this.corridor[1]-.002)return false;v+= (m.y.stiffness*(this.transitY-y)-m.y.damping*v)/60;v=Math.max(-.85,Math.min(.85,v));y+=v/60;}return true;}
 get inContactPath(){return['seated','lift','withdraw','approach','seat'].includes(this.phase);}
 scaleTarget(requested,m){return this.phase==='free'&&(m.z.value>=this.rotationZ||requested<=1.0005)?requested:1;}
 plan(m,request,scale=1,reduced=false){
  const{wanted,y,z,yaw}=request;
  if(reduced){this.wanted=wanted;this.phase=wanted?'free':'seated';return{y:wanted?y:this.restY,z:wanted?z:0,yaw:wanted?yaw:m.yaw.value+angle(SIDE,m.yaw.value),pin:!wanted};}
  if(wanted!==this.wanted){
   this.wanted=wanted;
   if(wanted){if(['seated','seat','approach'].includes(this.phase))this.phase='lift';else if(m.z.value>=this.rotationZ)this.phase='free';else{this.phase='backout';this.holdYaw=m.yaw.value;this.holdY=m.y.value;}}
   else{if(this.phase==='lift')this.phase=Math.abs(m.z.value)>.0001?'approach':'seat';else if(this.phase==='withdraw')this.phase='approach';else if(m.z.value>=this.rotationZ)this.phase='align';else if(this.phase!=='seated'){this.phase='backout';this.holdYaw=m.yaw.value;this.holdY=m.y.value;}}
  }
  if(this.phase==='free'&&Math.abs(angle(yaw,m.yaw.value))>.01&&m.z.value<this.rotationZ){this.phase='backout';this.holdYaw=m.yaw.value;this.holdY=m.y.value;}
  if(this.phase==='lift'&&this.inCorridor(m)&&Math.abs(scale-1)<.0005)this.phase='withdraw';
  if((this.phase==='withdraw'||this.phase==='backout')&&m.z.value>=this.rotationZ)this.phase=this.wanted?'free':'align';
  if(this.phase==='align'&&Math.abs(angle(SIDE,m.yaw.value))<.005&&Math.abs(m.yaw.velocity)<.03&&this.inCorridor(m)&&Math.abs(scale-1)<.0005&&Math.abs(m.roll.value)<.002&&Math.abs(m.pitch.value)<.002)this.phase='approach';
  if(this.phase==='approach'&&Math.abs(m.z.value)<.001&&Math.abs(m.z.velocity)<.02){m.z.snap(0);this.phase='seat';}
  if(this.phase==='seat'&&Math.abs(m.y.value-this.restY)<.0001&&Math.abs(m.y.velocity)<.003){m.y.snap(this.restY);m.z.snap(0);this.phase='seated';}
  const side=m.yaw.value+angle(SIDE,m.yaw.value);
  if(this.phase==='free'){const turning=Math.abs(angle(yaw,m.yaw.value))>.01||Math.abs(m.yaw.velocity)>.03;return{y,z:turning?Math.max(z,this.clearanceZ):z,yaw,pin:false};}
  if(this.phase==='backout')return{y:this.holdY,z:this.clearanceZ,yaw:this.holdYaw,pin:false};
  if(this.phase==='align')return{y:this.transitY,z:this.clearanceZ,yaw:side,pin:false};
  return{y:this.phase==='seated'||this.phase==='seat'?this.restY:this.transitY,z:this.phase==='withdraw'?this.clearanceZ:0,yaw:side,pin:true};
 }
 finish(m,control){if(control.pin){m.yaw.snap(m.yaw.value+angle(SIDE,m.yaw.value));m.roll.snap(0);m.pitch.snap(0);if(m.z.value<0)m.z.snap(0);if(m.y.value<this.restY)m.y.snap(this.restY);}}
}

export function freeDepth(data,maxY=INSPECTION_Y,maxScale=MAX_INSPECTION_SCALE){
 let norm=0;for(let i=0;i<data.positions.length;i+=3)norm=Math.max(norm,Math.hypot(...data.positions.slice(i,i+3)));
 const tilt=norm*(2*Math.sin(HANGER_ROLL_LIMIT/2)+2*Math.sin(HANGER_PITCH_LIMIT/2)),cutY=CY-R-maxY-tilt;let radius=0;
 const p=data.positions,tri=data.triangles;const add=(x,z)=>{radius=Math.max(radius,Math.hypot(x,z));};
 for(let i=0;i<tri.length;i+=3)for(let k=0;k<3;k++){const a=tri[i+k]*3,b=tri[i+(k+1)%3]*3;if(p[a+1]>=cutY)add(p[a],p[a+2]);if((p[a+1]<cutY)!==(p[b+1]<cutY)){const t=(cutY-p[a+1])/(p[b+1]-p[a+1]);add(p[a]+(p[b]-p[a])*t,p[a+2]+(p[b+2]-p[a+2])*t);}}
 return R+maxScale*(radius+tilt)+.001;
}

// Extract exactly the rendered rigid meshes in pivot-local coordinates. Cloth
// has its own solver and must not influence the fitted hook opening.
export function rigidHangerData(root){
 root.updateWorldMatrix(true,true);const inverse=new Matrix4().copy(root.matrixWorld).invert(),matrix=new Matrix4(),point=new Vector3(),positions=[],triangles=[];
 root.traverse(mesh=>{
  if(!mesh.isMesh||mesh.userData.cloth)return;
  const geometry=mesh.geometry,p=geometry.attributes.position,offset=positions.length/3;matrix.multiplyMatrices(inverse,mesh.matrixWorld);
  for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(matrix);positions.push(point.x,point.y,point.z);}
  const index=geometry.index;for(let i=0;i<(index?.count??p.count);i++)triangles.push(offset+(index?index.getX(i):i));
 });
 if(!triangles.length)throw new Error('The garment has no rigid hanger geometry');
 return{positions,triangles};
}
