import{DirectionalLight,Vector3,Matrix4,Frustum,ShaderChunk,Vector2}from'three';
// Keep the established vertical envelope; the all-yaw horizontal model bound
// plus the existing .8 world allowance fits in 2.25, including scale1.28.
const FOCUS_HALF_WIDTH=2.25;
// A taller target matches the focused window. Keep search/filter reach in
// the previous1024-grid world units while changing its sampling density.
const ShadowBase=new DirectionalLight().shadow.constructor;
// An infinite directional source must include casters behind its display
// position too. Place only its orthographic shadow camera away from the set.
export class StudioDirectionalShadow extends ShadowBase{
 constructor(){super();this.isStudioDirectionalShadow=true;this.center=new Vector3();this.focused=false;this.point=new Vector3();this.axis=new Vector3();this.project=new Matrix4();this.frustum=new Frustum();this.angularRadius=.06;this.softnessScale=new Vector2();this.sampleRadius=new Vector2();this.mapSize.set(1024,1536);this.camera.near=.1;this.camera.far=48;this.bias=-.00001;this.normalBias=.003;}
 frame(center,focused){this.center.copy(center);this.focused=focused;const angle=this.angularRadius,depth=this.camera.far-this.camera.near;this.softnessScale.set(angle*depth/(focused?2*FOCUS_HALF_WIDTH:14),angle*depth/(focused?6.5:12));this.sampleRadius.set(8/1024*(focused?3/FOCUS_HALF_WIDTH:1),8/1024);}
 getFrustum(){return this.frustum;}
 updateMatrices(light){
  const camera=this.camera;light.updateWorldMatrix(true,false);light.target.updateWorldMatrix(true,false);light.getWorldPosition(this.axis);light.target.getWorldPosition(this.point);this.axis.sub(this.point).normalize();
  camera.position.copy(this.axis).multiplyScalar(24);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  this.point.copy(this.center).applyMatrix4(camera.matrixWorldInverse);const hx=this.focused?FOCUS_HALF_WIDTH:7,hy=this.focused?3.25:6,tx=2*hx/this.mapSize.x,ty=2*hy/this.mapSize.y,x=Math.round(this.point.x/tx)*tx,y=Math.round(this.point.y/ty)*ty;
  camera.left=x-hx;camera.right=x+hx;camera.bottom=y-hy;camera.top=y+hy;camera.updateProjectionMatrix();
  this.project.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.project,camera.coordinateSystem,camera.reversedDepth);
  this.matrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(this.project);
 }
}
// Secondary sources use a small angular disk (.06 radians) for distance-growing
// penumbrae. Eight blocker samples and a bounded filter are an approximation;
// direct illumination still uses the source centre. Caster slopes keep a thin
// sheet from shading itself when neighbouring texels are filtered.
// Native normal bias uses the authored outward normal. On the back of a thin
// two-sided sheet this offsets the receiver behind itself. Each orthographic
// depth matrix tells which normal direction points toward its own source.
const facingShadowVertex=ShaderChunk.shadowmap_vertex.replace(
 'shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias',
 'shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias * ( (directionalShadowMatrix[ i ]*vec4(shadowWorldNormal,0.)).z<=0. ? 1. : -1. )'
);
const nativeDirectionalSample='getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
const directionalVisibility=`
#if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
#if defined(STUDIO_CLOTH_TRANSMISSION) && defined(STUDIO_CLOTH_GEOMETRIC_SHADOW)
uniform mat4 uStudioClothShadowMatrices[2];
#endif
// Derive both gradients before the per-fragment hemisphere choice. The packed
// fallback never differentiates a normal that was itself made with derivatives.
vec4 studioDirectionalThinProjection(vec4 projection,int source,float normalBias,vec3 n,vec3 lightDirection,out vec3 dx,out vec3 dy){
 #ifndef STUDIO_DIRECTIONAL_SOFT
 vec3 original=projection.xyz/projection.w;dx=dFdx(original);dy=dFdy(original);
 #else
 dx=vec3(0.);dy=vec3(0.);
 #endif
 #if defined(STUDIO_CLOTH_TRANSMISSION) && defined(STUDIO_CLOTH_GEOMETRIC_SHADOW)
 if(source==1||source==2){
  mat4 matrix=source==1?uStudioClothShadowMatrices[0]:uStudioClothShadowMatrices[1];
  #ifndef STUDIO_DIRECTIONAL_SOFT
  vec4 raw=matrix*vec4(vStudioClothWorld,1.);vec3 rawCoord=raw.xyz/raw.w;
  vec3 rawDx=dFdx(rawCoord),rawDy=dFdy(rawCoord);
  #endif
  if(uStudioClothTransmittance>0.&&dot(n,lightDirection)<0.){
   vec3 worldN=studioClothGeometricWorld;float side=(matrix*vec4(worldN,0.)).z<=0.?1.:-1.;
   #ifndef STUDIO_DIRECTIONAL_SOFT
   dx=rawDx;dy=rawDy;
   #endif
   return matrix*vec4(studioClothShadowPoint(lightDirection)+worldN*(normalBias*side),1.);
  }
 }
 #endif
 return projection;
}
float studioDirectionalBasic(sampler2D depths,vec2 size,float intensity,float bias,vec4 projection,vec3 dx,vec3 dy){
 vec3 coord=projection.xyz/projection.w;
 float det=dx.x*dy.y-dx.y*dy.x;
 vec2 gradient=abs(det)>1.e-12?vec2(dx.z*dy.y-dy.z*dx.y,dy.z*dx.x-dx.z*dy.x)/det:vec2(0.);
 if(projection.w<=0.||any(lessThan(coord,vec3(0.)))||any(greaterThan(coord,vec3(1.))))return 1.;
 vec2 pixel=coord.xy*size-.5,base=floor(pixel),fraction=fract(pixel);float visibility=0.;
 for(int y=0;y<2;y++)for(int x=0;x<2;x++){
  vec2 tap=clamp((base+vec2(float(x),float(y))+.5)/size,.5/size,1.-.5/size);
  float compare=coord.z+dot(gradient,tap-coord.xy)+bias;
  float weight=(x==0?1.-fraction.x:fraction.x)*(y==0?1.-fraction.y:fraction.y);
  visibility+=weight*texture2DCompare(depths,tap,compare);
 }
 return mix(1.,visibility,intensity);
}
#ifdef STUDIO_DIRECTIONAL_SOFT
uniform vec2 uStudioDirectionalSoftness[2];
uniform vec2 uStudioDirectionalSampleRadius[2];
uniform sampler2D uStudioDirectionalPlaneDepth[2];
vec2 studioShadowDisk(int i){
 if(i==0)return vec2(.9239,.3827);if(i==1)return vec2(-.9239,-.3827);
 if(i==2)return vec2(-.3827,.9239);if(i==3)return vec2(.3827,-.9239);
 if(i==4)return vec2(.45,.18);if(i==5)return vec2(-.45,-.18);
 if(i==6)return vec2(-.18,.45);return vec2(.18,-.45);
}
float studioDirectionalPlanePCF(sampler2D slopes,sampler2D depths,vec3 coord,vec2 sampleUV,vec2 size,float bias){
 vec2 pixel=sampleUV*size-.5,base=floor(pixel),fraction=fract(pixel);float visible=0.;
 for(int y=0;y<2;y++)for(int x=0;x<2;x++){
  vec2 tap=clamp((base+vec2(float(x),float(y))+.5)/size,.5/size,1.-.5/size);
  float depth=texture2D(depths,tap).r,atReceiver=depth+dot(texture2D(slopes,tap).rg,(coord.xy-tap)*size);
  float weight=(x==0?1.-fraction.x:fraction.x)*(y==0?1.-fraction.y:fraction.y);
  visible+=weight*(depth>=1.?1.:step(coord.z+bias,atReceiver));
 }
 return visible;
}
float studioDirectionalSoft(sampler2D slopes,sampler2D depths,vec2 softness,vec2 sampleRadius,vec2 size,float intensity,float bias,vec4 projection){
 vec3 coord=projection.xyz/projection.w;
 if(projection.w<=0.||any(lessThan(coord,vec3(0.)))||any(greaterThan(coord,vec3(1.))))return 1.;
 float gap=0.,blockers=0.;
 for(int i=0;i<8;i++){
  vec2 tap=clamp(coord.xy+studioShadowDisk(i)*sampleRadius,.5/size,1.-.5/size);
  float raw=texture2D(depths,tap).r,depth=raw+dot(texture2D(slopes,tap).rg,(coord.xy-tap)*size);
  if(raw<1.&&depth<coord.z+bias){gap+=coord.z+bias-depth;blockers+=1.;}
 }
 float visible;
 if(blockers==0.)visible=studioDirectionalPlanePCF(slopes,depths,coord,coord.xy,size,bias);
 else{
  vec2 radius=min(softness*(gap/blockers),sampleRadius);
  float pixelRadius=max(radius.x*size.x,radius.y*size.y);
  float hard=studioDirectionalPlanePCF(slopes,depths,coord,coord.xy,size,bias);
  if(pixelRadius<=.5)visible=hard;
  else{visible=0.;for(int i=0;i<8;i++)visible+=studioDirectionalPlanePCF(slopes,depths,coord,coord.xy+studioShadowDisk(i)*radius,size,bias);visible=mix(hard,visible/8.,smoothstep(.5,1.5,pixelRadius));}
 }
 return mix(1.,visible,intensity);
}
float studioDirectionalVisibility(sampler2D slopes,vec2 size,float intensity,float bias,float normalBias,vec4 projection,int source,vec3 n,vec3 lightDirection){
 vec3 dx,dy;projection=studioDirectionalThinProjection(projection,source,normalBias,n,lightDirection,dx,dy);
 if(source==1)return studioDirectionalSoft(slopes,uStudioDirectionalPlaneDepth[0],uStudioDirectionalSoftness[0],uStudioDirectionalSampleRadius[0],size,intensity,bias,projection);
 if(source==2)return studioDirectionalSoft(slopes,uStudioDirectionalPlaneDepth[1],uStudioDirectionalSoftness[1],uStudioDirectionalSampleRadius[1],size,intensity,bias,projection);
 return studioDirectionalBasic(slopes,size,intensity,bias,projection,dx,dy);
}
#else
float studioDirectionalVisibility(sampler2D depths,vec2 size,float intensity,float bias,float normalBias,vec4 projection,int source,vec3 n,vec3 lightDirection){vec3 dx,dy;projection=studioDirectionalThinProjection(projection,source,normalBias,n,lightDirection,dx,dy);return studioDirectionalBasic(depths,size,intensity,bias,projection,dx,dy);}
#endif
#endif
`;
export function applyStudioDirectionalVisibility(material,lights=[]){
 if(material.userData.studioDirectionalVisibility)return;material.userData.studioDirectionalVisibility=true;
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey();const soft=lights.length===2&&lights.every(l=>l.shadow.depthPlanes),thin=lights.length===2&&Boolean(material.userData.clothTransmittance);
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);if(thin){shader.uniforms.uStudioClothShadowMatrices={value:lights.map(l=>l.shadow.matrix)};shader.fragmentShader='#define STUDIO_CLOTH_GEOMETRIC_SHADOW\n'+shader.fragmentShader;}if(soft){shader.uniforms.uStudioDirectionalSampleRadius={value:lights.map(l=>l.shadow.sampleRadius)};shader.uniforms.uStudioDirectionalSoftness={value:lights.map(l=>l.shadow.softnessScale)};shader.uniforms.uStudioDirectionalPlaneDepth={value:lights.map(l=>l.shadow.map.depthTexture)};shader.fragmentShader='#define STUDIO_DIRECTIONAL_SOFT\n'+shader.fragmentShader;}shader.vertexShader=shader.vertexShader.replace('#include <shadowmap_vertex>',facingShadowVertex);
  const fragment=shader.fragmentShader.replace('#include <lights_fragment_begin>',ShaderChunk.lights_fragment_begin);
  if(!fragment.includes(nativeDirectionalSample))return;
  shader.fragmentShader=fragment.replace(nativeDirectionalSample,'studioDirectionalVisibility(directionalShadowMap[ i ],directionalLightShadow.shadowMapSize,directionalLightShadow.shadowIntensity,directionalLightShadow.shadowBias,directionalLightShadow.shadowNormalBias,vDirectionalShadowCoord[ i ],UNROLLED_LOOP_INDEX,geometryNormal,directionalLight.direction)').replace('void main() {',directionalVisibility+'\nvoid main() {');
 };
 material.customProgramCacheKey=()=>key+'-studio-directional-soft-v7-shared-cloth-geometry'+(soft?'-soft':'-hard');material.needsUpdate=true;
}
