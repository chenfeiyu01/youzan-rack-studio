import{ShaderChunk,Vector2,Matrix3,Matrix4}from'three';

// Distance-dependent soft shadows on the existing variance shadow map.
// Preserve close contacts; soften separated casts with a stable area footprint.
// Source slope and lengths are appearance presets, not physical calibration.
export const studioShadowUniforms={
 uStudioSoftEnabled:{value:1},
 uStudioShadowExtent:{value:new Vector2(6,6.5)},
 uStudioViewToLight:{value:new Matrix3()},
 uStudioShadowDepth:{value:23.8},
 uStudioShadowSlope:{value:.18},
 uStudioShadowSearchGap:{value:3.2},
};
const viewToLight=new Matrix4();
export function updateStudioSoftShadow(light,camera){
 const c=light.shadow.camera;
 studioShadowUniforms.uStudioShadowExtent.value.set(c.right-c.left,c.top-c.bottom);
 studioShadowUniforms.uStudioShadowDepth.value=c.far-c.near;
 if(camera){camera.updateWorldMatrix(true,false);studioShadowUniforms.uStudioViewToLight.value.setFromMatrix4(viewToLight.multiplyMatrices(c.matrixWorldInverse,camera.matrixWorld));}
}
const disk=(name,count,centre=false)=>{
 const points=Array.from({length:count},(_,i)=>{const r=Math.sqrt((i+.5)/count),a=i*2.399963229728653;return`vec2(${(r*Math.cos(a)).toFixed(9)},${(r*Math.sin(a)).toFixed(9)})`;});
 if(centre)points.push('vec2(0.)');
 return`const vec2 ${name}[${points.length}]=vec2[${points.length}](\n${points.join(',\n')}\n);`;
};
const helpers=`
uniform float uStudioSoftEnabled;
uniform vec2 uStudioShadowExtent;
uniform mat3 uStudioViewToLight;
uniform float uStudioShadowDepth;
uniform float uStudioShadowSlope;
uniform float uStudioShadowSearchGap;
${disk('studioSearchDisk',16,true)}
${disk('studioFilterDisk',64)}
vec2 studioReceiverGradient(vec3 coord){
 #ifndef FLAT_SHADED
 vec3 lightNormal=uStudioViewToLight*normalize(vNormal);
 if(abs(lightNormal.z)>.08)return lightNormal.xy/lightNormal.z*uStudioShadowExtent/uStudioShadowDepth;
 #endif
 vec3 dx=dFdx(coord),dy=dFdy(coord);float determinant=dx.x*dy.y-dx.y*dy.x;
 if(abs(determinant)<1.e-12)return vec2(0.);
 return vec2(dx.z*dy.y-dy.z*dx.y,dy.z*dx.x-dx.z*dy.x)/determinant;
}
float studioVisibility(vec2 distribution,float compare){
 float hard=step(compare,distribution.x);
 if(hard>.5)return 1.;
 float gap=compare-distribution.x,variance=distribution.y*distribution.y;
 float probability=variance/max(variance+gap*gap,1.e-20);
 return clamp((probability-.3)/.65,0.,1.);
}
float studioSoftShadow(sampler2D depths,vec2 mapSize,vec3 coord){
 vec2 centerDistribution=texture2DDistribution(depths,coord.xy);
 float base=studioVisibility(centerDistribution,coord.z);
 float centerGap=max(0.,coord.z-centerDistribution.x)*uStudioShadowDepth;
 vec2 gradient=studioReceiverGradient(coord);
 vec2 searchRadius=uStudioShadowSearchGap*uStudioShadowSlope/uStudioShadowExtent;
 float gaps=0.,blockers=0.;
 for(int i=0;i<17;i++){
  vec2 offset=studioSearchDisk[i]*searchRadius;
  vec2 tap=(floor((coord.xy+offset)*mapSize)+.5)/mapSize;
  vec2 distribution=texture2DDistribution(depths,tap);
  float compare=coord.z+dot(gradient,tap-coord.xy);
  if(compare>0.&&compare<1.&&all(greaterThanEqual(tap,vec2(0.)))&&all(lessThanEqual(tap,vec2(1.)))){
   float weight=1.-studioVisibility(distribution,compare);
   gaps+=max(0.,compare-distribution.x)*weight;blockers+=weight;
  }
 }
 if(blockers<.01)return base;
 float gap=min(gaps/blockers*uStudioShadowDepth,uStudioShadowSearchGap);
 float centerTrusted=1.-smoothstep(.05,.65,base);
 gap=mix(gap,min(gap,centerGap),centerTrusted);
 float resolved=smoothstep(.025,.12,gap);
 if(resolved<.001)return base;
 vec2 radius=gap*uStudioShadowSlope/uStudioShadowExtent;
 float visibility=0.;
 for(int i=0;i<64;i++){
  vec2 offset=studioFilterDisk[i]*radius;
  vec2 tap=(floor((coord.xy+offset)*mapSize)+.5)/mapSize;
  if(any(lessThan(tap,vec2(0.)))||any(greaterThan(tap,vec2(1.)))){visibility+=1.;continue;}
  vec2 distribution=texture2DDistribution(depths,tap);
  visibility+=studioVisibility(distribution,coord.z+dot(gradient,tap-coord.xy));
 }
 return mix(base,visibility/64.,resolved);
}
`;
const shadowChunk=ShaderChunk.shadowmap_pars_fragment
 .replace('float getShadow(',helpers+'\nfloat getShadow(')
 .replace('shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );','shadow = uStudioSoftEnabled>.5?studioSoftShadow(shadowMap,shadowMapSize,shadowCoord.xyz):VSMShadow(shadowMap,shadowCoord.xy,shadowCoord.z);');
export function applyStudioSoftShadow(material){
 if(material.userData.studioSoftShadow)return;
 material.userData.studioSoftShadow=true;
 const before=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=(shader,renderer)=>{before.call(material,shader,renderer);Object.assign(shader.uniforms,studioShadowUniforms);shader.fragmentShader=shader.fragmentShader.replace('#include <shadowmap_pars_fragment>',shadowChunk);};
 material.customProgramCacheKey=()=>key+'-studio-soft-shadow-v2';
 material.needsUpdate=true;
}
