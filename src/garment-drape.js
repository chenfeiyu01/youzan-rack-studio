// Shallow hanging folds for the recovered short-sleeve panels. This is a
// rest-surface map shared by the render mesh, simulation and grain directions;
// subsequent folding and recovery come from the complete surface solver.
// Translating both walls in depth keeps their thickness and seam correspondence.
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const slope=t=>t>0&&t<1?6*t*(1-t):0;
const cache=new WeakMap();
export function hangingDrape(form){
 if(cache.has(form))return cache.get(form);
 const phase=form.phase??0,amount=(form.drape??.024)/.024;
 const folds=[
  {x:-.40+.025*Math.sin(phase),bend:-.085,curve:-.018,width:.10+.012*Math.cos(phase),depth:.044*amount,y:-.65},
  {x:.44+.028*Math.cos(phase*1.3),bend:.005,curve:-.027,width:.115+.012*Math.sin(phase),depth:.037*amount,y:-.35},
  {x:-.06+.055*Math.sin(phase+.8),bend:.025,curve:0,width:.17,depth:-.017*amount,y:-1.2},
 ];
 const sample=(x,y,z,out)=>{
  const t=(.38-y)/.9,free=smooth(t),fy=-slope(t)/.9;
  let value=0,dx=0,dy=0;
  for(let i=0;i<folds.length;i++){
   const f=folds[i],v=.2-y,center=f.x+f.bend*v+f.curve*v*v,cy=-f.bend-2*f.curve*v;
   const width=f.width+.02*free,wy=.02*fy,u=(x-center)/width,u2=u*u,e=Math.exp(-u2);
   // One broad ridge with soft neighbouring valleys, not a repeated wave.
   const ridge=(1-2*u2)*e,derivative=2*u*(2*u2-3)*e;
   const v2=(y-f.y)/.8,falloff=Math.exp(-v2*v2);
   const lower=i===2?smooth((-.35-y)/.95):.4+.6*falloff;
   const ly=i===2?-slope((-.35-y)/.95)/.95:-1.2*v2*falloff/.8;
   const a=f.depth*free*lower;
   value+=a*ridge;dx+=a*derivative/width;
   dy+=f.depth*(fy*lower+free*ly)*ridge+a*derivative*(-cy-u*wy)/width;
  }
  if(out){out[0]=value;out[1]=dx;out[2]=dy;out[3]=0;}
  return value;
 };
 cache.set(form,sample);return sample;
}
