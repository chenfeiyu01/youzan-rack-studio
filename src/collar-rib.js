import {BufferAttribute} from 'three';

const TAU=Math.PI*2,MODEL_METRES=.283,RIB_PITCH_METRES=.0018;
const wrap=a=>(a%TAU+TAU)%TAU;

// The supplied short-sleeve model has separate pattern pieces for its neckband.
// Select whole pieces, rather than painting an approximate oval across the body.
export function collarRibCoordinates(geometry){
  const p=geometry.attributes.position,index=geometry.index,count=p.count;
  const adjacent=Array.from({length:count},()=>[]);
  for(let k=0;k<(index?.count??count);k+=3){
    const a=index?index.getX(k):k,b=index?index.getX(k+1):k+1,c=index?index.getX(k+2):k+2;
    adjacent[a].push(b,c);adjacent[b].push(a,c);adjacent[c].push(a,b);
  }
  const seen=new Uint8Array(count),pieces=[];
  for(let start=0;start<count;start++){
    if(seen[start])continue;
    const ids=[],stack=[start];seen[start]=1;let low=Infinity,wide=0;
    while(stack.length){const i=stack.pop();ids.push(i);low=Math.min(low,p.getY(i));wide=Math.max(wide,Math.abs(p.getX(i)));for(const j of adjacent[i])if(!seen[j]){seen[j]=1;stack.push(j);}}
    if(low>.68&&wide<.35)pieces.push(ids);
  }
  const coordinates=new Float32Array(count*2),ids=pieces.flat();
  if(!ids.length)return new BufferAttribute(coordinates,2);
  const angle=i=>wrap(Math.atan2((p.getZ(i)+.005)/.14,(p.getX(i)-.009)/.31));
  // Estimate the closed centre line from the existing band, including the
  // deeper front neckline. Arc length keeps the ribs at a fabric-sized pitch.
  const bins=64,points=Array.from({length:bins},()=>[]),unique=new Set();
  for(const i of ids){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(':');if(unique.has(key))continue;unique.add(key);points[Math.floor(angle(i)/TAU*bins)].push(i);}
  let curve=points.map(list=>list.length?[0,1,2].map(k=>list.reduce((sum,i)=>sum+p.array[i*3+k],0)/list.length):null);
  for(let i=0;i<bins;i++)if(!curve[i]){
    let a=1,b=1;while(!points[(i-a+bins)%bins].length)a++;while(!points[(i+b)%bins].length)b++;
    const left=curve[(i-a+bins)%bins],right=curve[(i+b)%bins];curve[i]=left.map((v,k)=>(v*b+right[k]*a)/(a+b));
  }
  for(let pass=0;pass<4;pass++)curve=curve.map((v,i)=>v.map((x,k)=>(curve[(i-1+bins)%bins][k]+2*x+curve[(i+1)%bins][k])/4));
  const length=[0];for(let i=0;i<bins;i++)length.push(length[i]+Math.hypot(...curve[(i+1)%bins].map((v,k)=>v-curve[i][k])));
  const circumference=length[bins],ribs=Math.max(1,Math.round(circumference*MODEL_METRES/RIB_PITCH_METRES));
  const phase=a=>{const turns=Math.floor(a/TAU),f=wrap(a)/TAU*bins,i=Math.floor(f);return(turns+(length[i]+(length[i+1]-length[i])*(f-i))/circumference)*ribs;};
  for(const piece of pieces){
    const anchor=Math.atan2(piece.reduce((s,i)=>s+Math.sin(angle(i)),0),piece.reduce((s,i)=>s+Math.cos(angle(i)),0));
    for(const i of piece){const a=angle(i),unwrapped=anchor+Math.atan2(Math.sin(a-anchor),Math.cos(a-anchor));coordinates[i*2]=phase(unwrapped);coordinates[i*2+1]=1;}
  }
  return new BufferAttribute(coordinates,2);
}

export function applyCollarRib(shader,enabled){
  if(!shader.fragmentShader.includes('#include <lights_physical_fragment>'))return;
  shader.uniforms.uCollarRib=enabled;
  shader.vertexShader='attribute vec2 collarRib; varying vec2 vCollarRib;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vCollarRib=collarRib;');
  shader.fragmentShader='uniform float uCollarRib; varying vec2 vCollarRib;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`
    float ribMask=vCollarRib.y*clamp(uCollarRib,0.,1.);
    float ribFootprint=fwidth(vCollarRib.x);
    float ribResolved=1.-smoothstep(.20,.50,ribFootprint);
    vec3 ribDx=dFdx(-vViewPosition),ribDy=dFdy(-vViewPosition);
    vec3 ribR1=cross(ribDy,nonPerturbedNormal),ribR2=cross(nonPerturbedNormal,ribDx);
    float ribDet=dot(ribDx,ribR1);
    vec3 ribGradient=(ribR1*dFdx(vCollarRib.x)+ribR2*dFdy(vCollarRib.x))*sign(ribDet);
    vec3 ribDirection=ribGradient*inversesqrt(max(dot(ribGradient,ribGradient),1.e-20));
    float ribWave=sin(vCollarRib.x*6.28318530718);
    if(ribMask>0.){
      vec3 knitNormal=normalize(mix(nonPerturbedNormal,normal,.45)-ribDirection*ribWave*.26*ribResolved);
      normal=normalize(mix(normal,knitNormal,ribMask));
      diffuseColor.rgb*=mix(1.,.985+.015*cos(vCollarRib.x*6.28318530718)*ribResolved,ribMask);
    }
    #include <lights_physical_fragment>`);
}
