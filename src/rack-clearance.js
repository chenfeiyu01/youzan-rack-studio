// Let an item open as its neighbors make room. Compare height bands so a low
// sleeve does not block an unrelated shoulder. This follows geometry, not a timer.
export function rackClearanceYaw(chosen,records,front=-.03,side=-1.43){
  const center=chosen.motion.x.value,left=new Float64Array(32).fill(-Infinity),right=new Float64Array(32).fill(Infinity),band=y=>Math.max(0,Math.min(31,Math.floor((y+3.2)/.2)));
  for(const other of records){
    if(other===chosen||!other.solver?.initialized)continue;
    const p=other.solver.position,t=other.solver.triangles,isLeft=other.motion.x.value<center;
    const fill=(minX,maxX,lo,hi)=>{for(let b=lo;b<=hi;b++){if(isLeft)left[b]=Math.max(left[b],maxX);else right[b]=Math.min(right[b],minX);}};
    if(t?.length){for(let i=0;i<t.length;i+=3){const a=t[i]*3,b=t[i+1]*3,c=t[i+2]*3;fill(Math.min(p[a],p[b],p[c]),Math.max(p[a],p[b],p[c]),band(Math.min(p[a+1],p[b+1],p[c+1])),band(Math.max(p[a+1],p[b+1],p[c+1])));}}
    else for(let i=0;i<p.length;i+=3)fill(p[i],p[i],band(p[i+1]),band(p[i+1]));
  }
  const p=chosen.solver?.rest??chosen.solver?.local;if(!p)return front;
  const y=chosen.motion.y?.value??1.58;
  const fits=yaw=>{const c=Math.cos(yaw),s=Math.sin(yaw);for(let i=0;i<p.length;i+=3){const x=center+p[i]*c+p[i+2]*s,b=band(y+p[i+1]-1.58);if(x<left[b]+.015||x>right[b]-.015)return false;}return true;};
  if(fits(front))return front;
  if(!fits(side))return side;
  let lo=side,hi=front;for(let i=0;i<14;i++){const mid=(lo+hi)*.5;if(fits(mid))lo=mid;else hi=mid;}return lo;
}
