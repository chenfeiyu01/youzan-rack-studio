const keys=['x','y','z','yaw','roll','pitch','scale'];
// Display history borrows no simulation buffers. Interpolate already-computed
// endpoints while the complete next physical step runs on its worker.
export class RenderInterpolation{
 constructor(anchors){this.from=anchors.map(p=>({...p}));this.to=anchors.map(p=>({...p}));this.token=-1;this.time=0;this.span=1000/60;this.previousProgress=1;this.progress=1;this.first=true;}
 commit(token,time,anchors,progress=1){
  if(token===this.token)return;
  if(this.token<0){for(let i=0;i<anchors.length;i++){Object.assign(this.from[i],anchors[i]);Object.assign(this.to[i],anchors[i]);}this.first=true;}
  else{for(let i=0;i<anchors.length;i++){Object.assign(this.from[i],this.to[i]);Object.assign(this.to[i],anchors[i]);}this.span=Math.max(1000/60,time-this.time);this.first=false;}
  this.previousProgress=this.progress;this.progress=progress;this.time=time;this.token=token;
 }
 alpha(now,snap=false){return snap||this.first?1:Math.max(0,Math.min(1,(now-this.time)/this.span));}
 restart(now){this.time=now;this.span=1000/60;}
 anchor(index,alpha,out={}){
  const a=this.from[index],b=this.to[index];
  for(const key of keys){let delta=b[key]-a[key];if(['yaw','roll','pitch'].includes(key)&&Math.abs(delta)>Math.PI)delta=Math.atan2(Math.sin(delta),Math.cos(delta));out[key]=a[key]+delta*alpha;}
  return out;
 }
 get arrived(){return this.progress===1&&this.previousProgress===1;}
}
