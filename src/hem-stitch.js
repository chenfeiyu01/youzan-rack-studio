import {BufferAttribute} from 'three';

const TAU=Math.PI*2,MODEL_METRES=.283,STITCH_PITCH=.0028;
const wrap=a=>(a%TAU+TAU)%TAU;

// Rest-space coordinates on the existing short-shirt hem. The lower edge is
// sampled from the supplied model, so the rows follow its uneven folded edge.
// Dimensions are appearance presets rather than measured garment construction.
export function hemStitchCoordinates(geometry){
  const p=geometry.attributes.position,index=geometry.index,count=p.count;
  const result=new Float32Array(count*3),bins=128,samples=Array.from({length:bins},()=>[]);
  const angle=i=>wrap(Math.atan2((p.getZ(i)-.035)/.145,p.getX(i)/.65));
  // Keep the distance monotone outside the mask as well. A zero coordinate at
  // the next body vertex would interpolate a second, unintended pair of rows.
  for(let i=0;i<count;i++)result[i*3+1]=(p.getY(i)+1.5)*MODEL_METRES;
  for(let i=0;i<count;i++)if(p.getY(i)<-1.46)samples[Math.floor(angle(i)/TAU*bins)].push(i);
  if(!samples.some(list=>list.length))return new BufferAttribute(result,3);
  const curve=samples.map(list=>{
    if(!list.length)return null;
    const low=Math.min(...list.map(i=>p.getY(i))),edge=list.filter(i=>p.getY(i)<low+.002);
    return[0,1,2].map(k=>edge.reduce((sum,i)=>sum+p.array[i*3+k],0)/edge.length);
  });
  for(let i=0;i<bins;i++)if(!curve[i]){
    let a=1,b=1;while(!samples[(i-a+bins)%bins].length)a++;while(!samples[(i+b)%bins].length)b++;
    const left=curve[(i-a+bins)%bins],right=curve[(i+b)%bins];curve[i]=left.map((v,k)=>(v*b+right[k]*a)/(a+b));
  }
  let edge=curve;
  for(let pass=0;pass<2;pass++)edge=edge.map((v,i)=>v.map((x,k)=>(edge[(i-1+bins)%bins][k]+2*x+edge[(i+1)%bins][k])/4));
  const length=[0];for(let i=0;i<bins;i++)length.push(length[i]+Math.hypot(...edge[(i+1)%bins].map((v,k)=>v-edge[i][k])));
  const stitches=Math.max(1,Math.round(length[bins]*MODEL_METRES/STITCH_PITCH));
  const adjacent=Array.from({length:count},()=>[]);
  for(let k=0;k<(index?.count??count);k+=3){const a=index?index.getX(k):k,b=index?index.getX(k+1):k+1,c=index?index.getX(k+2):k+2;adjacent[a].push(b,c);adjacent[b].push(a,c);adjacent[c].push(a,b);}
  const seen=new Uint8Array(count);
  for(let start=0;start<count;start++){
    if(seen[start]||p.getY(start)>=-1.35)continue;
    const ids=[],stack=[start];seen[start]=1;
    while(stack.length){const i=stack.pop();ids.push(i);for(const j of adjacent[i])if(!seen[j]&&p.getY(j)<-1.35){seen[j]=1;stack.push(j);}}
    const anchor=Math.atan2(ids.reduce((s,i)=>s+Math.sin(angle(i)),0),ids.reduce((s,i)=>s+Math.cos(angle(i)),0));
    for(const i of ids){
      const a=angle(i),unwrapped=anchor+Math.atan2(Math.sin(a-anchor),Math.cos(a-anchor)),f=a/TAU*bins,bin=Math.floor(f),fraction=f-bin;
      const y=edge[bin][1]*(1-fraction)+edge[(bin+1)%bins][1]*fraction;
      const along=length[bin]+(length[bin+1]-length[bin])*fraction;
      result[i*3]=(Math.round((unwrapped-a)/TAU)+along/length[bins])*stitches;
      result[i*3+1]=(p.getY(i)-y)*MODEL_METRES;result[i*3+2]=1;
    }
  }
  return new BufferAttribute(result,3);
}

export function applyHemStitch(shader,enabled){
  if(!shader.fragmentShader.includes('#include <lights_physical_fragment>'))return;
  shader.uniforms.uHemStitch=enabled;
  shader.vertexShader='attribute vec3 hemStitch; varying vec3 vHemStitch;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vHemStitch=hemStitch;');
  shader.fragmentShader='uniform float uHemStitch; varying vec3 vHemStitch;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`
    float hemAlongWidth=max(fwidth(vHemStitch.x),1.e-6);
    float hemAcrossWidth=max(fwidth(vHemStitch.y),1.e-8);
    float hemResolved=1.-smoothstep(.20,.50,hemAlongWidth);
    float hemPhase=abs(fract(vHemStitch.x+.5)-.5);
    float hemDash=mix(.75,1.-smoothstep(.375-hemAlongWidth*.5,.375+hemAlongWidth*.5,hemPhase),hemResolved);
    float hemRowA=vHemStitch.y-.016,hemRowB=vHemStitch.y-.020,hemHalfWidth=.00018;
    float hemLineA=clamp((hemHalfWidth-hemRowA)/hemAcrossWidth+.5,0.,1.)-clamp((-hemHalfWidth-hemRowA)/hemAcrossWidth+.5,0.,1.);
    float hemLineB=clamp((hemHalfWidth-hemRowB)/hemAcrossWidth+.5,0.,1.)-clamp((-hemHalfWidth-hemRowB)/hemAcrossWidth+.5,0.,1.);
    float hemMask=vHemStitch.z*clamp(uHemStitch,0.,1.);
    float hemCoverage=clamp(hemLineA+hemLineB,0.,1.)*hemDash*hemMask;
    float hemRow=abs(hemRowA)<abs(hemRowB)?hemRowA:hemRowB;
    float hemRelief=.00006/.283*hemMask*(1.-smoothstep(.00018,.00072,hemAcrossWidth));
    float hemSlope=abs(hemRow)<hemHalfWidth?-2.*hemRow/(hemHalfWidth*hemHalfWidth):0.;
    vec3 hemDx=dFdx(-vViewPosition),hemDy=dFdy(-vViewPosition);
    vec3 hemR1=cross(hemDy,nonPerturbedNormal),hemR2=cross(nonPerturbedNormal,hemDx);
    float hemDet=dot(hemDx,hemR1);
    // Differentiate the smooth thread profile analytically, rather than the
    // screen-filtered coverage. Coverage derivatives create dark pixel steps.
    vec3 hemGradient=(hemR1*dFdx(vHemStitch.y)+hemR2*dFdy(vHemStitch.y))*sign(hemDet)*hemSlope*hemRelief*hemDash;
    if(hemCoverage>0.){
      normal=normalize(normal-hemGradient/max(abs(hemDet),1.e-12));
      diffuseColor.rgb*=1.-.035*hemCoverage;
      roughnessFactor=mix(roughnessFactor,.82,hemCoverage);
    }
    #include <lights_physical_fragment>`);
}
