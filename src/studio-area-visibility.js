import{planeVisibility}from'./studio-depth-planes.js';
import {DirectionalLight,PerspectiveCamera,Vector2,Vector3,Vector4,Matrix4,Frustum} from 'three';
import{studioAreaNodes as nodes,studioAreaWeights as weights}from'./studio-area-light.js';
// Tensor Gauss-Legendre visibility. Unoccluded diffuse/GGX/coat keep their
// existing area integrals and visibility ratios. Sheen clips to the receiver
// horizon and interpolates the same source visibility field over that domain.
const nodeSets={4:{nodes,weights},2:{nodes:[-1/Math.sqrt(3),1/Math.sqrt(3)],weights:[1,1]}};
const ShadowBase=new DirectionalLight().shadow.constructor;
export class AreaAtlasShadow extends ShadowBase {
 constructor(softbox,{sampleSide=4}={}){
  const {nodes}=nodeSets[sampleSide]??nodeSets[4],side=nodes.length,count=side*side;
  super();this.sampleSide=side;this.isAreaAtlasShadow=true;this.camera=new PerspectiveCamera(50,1,.5,24);this.softbox=softbox;this.sources=nodes.flatMap(y=>nodes.map(x=>new Vector3(x*softbox.width*.5,y*softbox.height*.5,0)));
  this.worldSources=this.sources.map(()=>new Vector3());this.matrices=this.sources.map(()=>new Matrix4());this.center=new Vector3();this.focused=true;
  this.extents=new Vector2(side,side);this.tiles=this.sources.map((_,i)=>new Vector4(i%side,Math.floor(i/side),1,1));this.frustum=new Frustum();this.project=new Matrix4();this.point=new Vector3();
  this.mapSize.set(768,768);this.camera.near=.5;this.camera.far=24;
  // WebGLRenderer caches projection uploads by camera identity. Each atlas
  // viewport therefore owns a camera, even though its source is static.
  this.cameras=this.sources.map(()=>this.camera.clone());
  this.bias=-.000006;this.normalBias=0;this.radius=1;
  this.uniforms={uStudioAreaMatrices:{value:this.matrices},uStudioAreaTileSize:{value:this.mapSize},uStudioAreaNormalBias:{value:.003}};
 }
 getViewportCount(){return this.sources.length;}
 getViewport(i){return this.tiles[i];}
 getFrameExtents(){return this.extents;}
 getFrustum(){return this.frustum;}
 frame(center,focused){this.center.copy(center);this.focused=focused;this.softbox.updateWorldMatrix(true,false);for(let i=0;i<this.sources.length;i++)this.worldSources[i].copy(this.sources[i]).applyMatrix4(this.softbox.matrixWorld);}
 updateMatrices(_light,i=0){
  const c=this.camera=this.cameras[i];c.position.copy(this.worldSources[i]);c.lookAt(this.center);c.updateMatrixWorld(true);const bounds=this.focused?[2.7,3.3,2.7]:[6,3.4,3];
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1]){
   const p=this.point.set(this.center.x+x*bounds[0],this.center.y+y*bounds[1],this.center.z+z*bounds[2]).applyMatrix4(c.matrixWorldInverse),depth=Math.max(.6,-p.z);
   minX=Math.min(minX,p.x/depth);maxX=Math.max(maxX,p.x/depth);minY=Math.min(minY,p.y/depth);maxY=Math.max(maxY,p.y/depth);
  }
  const halfX=Math.ceil((maxX-minX)*.5*1.025/.025)*.025,halfY=Math.ceil((maxY-minY)*.5*1.025/.025)*.025;
  const cx=Math.round((minX+maxX)*.5/(2*halfX/this.mapSize.x))*(2*halfX/this.mapSize.x),cy=Math.round((minY+maxY)*.5/(2*halfY/this.mapSize.y))*(2*halfY/this.mapSize.y);
  c.clearViewOffset();c.aspect=halfX/halfY;c.fov=2*Math.atan(halfY)*180/Math.PI;c.updateProjectionMatrix();
  // Off-axis center in the projection; coordinates remain local to this tile.
  c.projectionMatrix.elements[8]=cx/halfX;c.projectionMatrix.elements[9]=cy/halfY;c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
  this.project.multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.project,c.coordinateSystem,c.reversedDepth);
  this.matrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(this.project);this.matrices[i].copy(this.matrix);
 }
}
function float(n){return n.toFixed(12);}
function visibilityCode(side){
const {nodes,weights}=nodeSets[side],count=side*side;
const samples=Array.from({length:count},(_,i)=>`{
 vec3 delta=light.position+light.halfWidth*${float(nodes[i%side])}+light.halfHeight*${float(nodes[Math.floor(i/side)])}-p;
 float r2=max(dot(delta,delta),1.e-8);vec3 l=delta*inversesqrt(r2);
 float weight=sampleArea*${float(weights[i%side]*weights[Math.floor(i/side)])}*max(dot(sourceNormal,-l),0.)/r2;
 vec3 origin=vStudioAreaWorld,biasNormal=worldN;float biasSide=dot(normalize(vNormal),l)>=0.?1.:-1.;
 vec4 gradientProjection=uStudioAreaMatrices[${i}]*vec4(origin+worldN*(uStudioAreaNormalBias*biasSide),1.);
 vec4 thinGradientProjection=uStudioAreaMatrices[${i}]*vec4(origin,1.);bool thinReceiver=false;
 #ifdef STUDIO_CLOTH_TRANSMISSION
 thinReceiver=material.studioClothTransmittance>0.&&dot(n,l)<0.;
 origin=mix(origin,studioClothShadowPoint(l),bvec3(thinReceiver));
 biasNormal=mix(worldN,clothGeometricWorld,bvec3(thinReceiver));
 biasSide=mix(biasSide,dot(clothGeometricView,l)>=0.?1.:-1.,thinReceiver);
 #endif
 vec3 biased=origin+biasNormal*(uStudioAreaNormalBias*biasSide);
 vec4 shadowCoord=uStudioAreaMatrices[${i}]*vec4(biased,1.);
 float visibility=studioAtlasVisibility(directionalShadowMap[0],shadowCoord,vec2(${float(i%side)},${float(Math.floor(i/side))}),gradientProjection,thinGradientProjection,thinReceiver);
 vec3 irradiance=light.color*(weight*max(dot(n,l),0.));
 #ifdef USE_IRIDESCENCE
 vec3 g=irradiance*BRDF_GGX(l,v,n,material);
 #elif defined(STUDIO_ACHROMATIC_SPECULAR)
 float s=weight*max(dot(n,l),0.)*BRDF_GGX(l,v,n,material).r;
 specularWeightFull+=s;specularWeightVisible+=s*visibility;
 #else
 float specularShape=BRDF_GGX(l,v,n,studioUnitSpecular).r;
 float edgeFresnel=F_Schlick(vec3(0.),1.,saturate(dot(v,normalize(l+v)))).r;
 float specularWeight=weight*max(dot(n,l),0.)*specularShape;
 float baseWeight=specularWeight*(1.-edgeFresnel),edgeWeight=specularWeight*edgeFresnel;
 specularBaseFull+=baseWeight;specularBaseVisible+=baseWeight*visibility;
 specularEdgeFull+=edgeWeight;specularEdgeVisible+=edgeWeight*visibility;
 #endif
 #ifdef STUDIO_CLOTH_TRANSMISSION
 float reflectedWeight=weight*max(dot(n,l),0.),transmittedWeight=weight*max(-dot(n,l),0.);
 reflectedFull+=reflectedWeight;reflectedVisible+=reflectedWeight*visibility;
 transmittedFull+=transmittedWeight;transmittedVisible+=transmittedWeight*visibility;
 #else
 vec3 d=irradiance*BRDF_Lambert(material.diffuseColor);
 diffuseFull+=d;diffuseVisible+=d*visibility;
 #endif
 #ifdef USE_IRIDESCENCE
 specularFull+=g;specularVisible+=g*visibility;
 #endif
 #ifdef USE_SHEEN
 sourceVisibility[${i}]=visibility;
 if(!sheenHorizon)sheenWeightVisible+=weight*max(dot(n,l),0.)*BRDF_Sheen(l,v,n,vec3(1.),material.sheenRoughness).r*visibility;
 #endif
 #ifdef USE_CLEARCOAT
 float cc=weight*max(dot(ccNormal,l),0.)*BRDF_GGX_Clearcoat(l,v,ccNormal,material).r;coatFullWeight+=cc;coatVisibleWeight+=cc*visibility;
 #endif
}`).join('\n');
const helpers=`
uniform mat4 uStudioAreaMatrices[${count}];
uniform vec2 uStudioAreaTileSize;
uniform float uStudioAreaNormalBias;
varying vec3 vStudioAreaWorld;
#if NUM_RECT_AREA_LIGHTS > 0 && NUM_DIR_LIGHT_SHADOWS > 0 && defined(USE_SHADOWMAP)
#ifdef STUDIO_CAST_DEPTH_PLANES
uniform sampler2D uStudioAreaPlaneDepth;
${planeVisibility}
#endif
float studioAtlasVisibility(sampler2D depths,vec4 projection,vec2 tile,vec4 originalProjection,vec4 thinProjection,bool thinReceiver){
 vec3 coord=projection.xyz/projection.w;
 #ifdef STUDIO_CAST_DEPTH_PLANES
 if(projection.w<=0.||any(lessThan(coord,vec3(0.)))||any(greaterThan(coord,vec3(1.))))return 1.;
 return studioCasterPlaneVisibility(depths,uStudioAreaPlaneDepth,coord,uStudioAreaTileSize,tile,${float(side)},-.000006);
 #else
 // Both gradients are first derivatives of interpolated positions. Never
 // differentiate the derivative-based geometric normal used for the offset.
 vec3 original=originalProjection.xyz/originalProjection.w,thin=thinProjection.xyz/thinProjection.w;
 vec3 dx=dFdx(original),dy=dFdy(original),thinDx=dFdx(thin),thinDy=dFdy(thin);
 if(thinReceiver){dx=thinDx;dy=thinDy;}
 float det=dx.x*dy.y-dx.y*dy.x;
 vec2 gradient=abs(det)>1.e-12?vec2(dx.z*dy.y-dy.z*dx.y,dy.z*dx.x-dx.z*dy.x)/det:vec2(0.);
 if(projection.w<=0.||any(lessThan(coord,vec3(0.)))||any(greaterThan(coord,vec3(1.))))return 1.;
 vec2 pixel=coord.xy*uStudioAreaTileSize-.5,base=floor(pixel),fraction=fract(pixel);float visible=0.;
 for(int y=0;y<2;y++)for(int x=0;x<2;x++){
  vec2 tap=clamp((base+vec2(float(x),float(y))+.5)/uStudioAreaTileSize,.5/uStudioAreaTileSize,1.-.5/uStudioAreaTileSize);
  float compare=coord.z+dot(gradient,tap-coord.xy)-.000006;
  float weight=(x==0?1.-fraction.x:fraction.x)*(y==0?1.-fraction.y:fraction.y);
  visible+=weight*texture2DCompare(depths,(tap+tile)/${float(side)},compare);
 }
 return visible;
 #endif
}

vec3 studioVisibilityRatio(vec3 visible,vec3 full){return mix(vec3(1.),clamp(visible/max(full,vec3(1.e-12)),vec3(0.),vec3(1.)),step(vec3(1.e-12),full));}
void RE_Direct_RectArea_Visibility(const in RectAreaLight light,const in vec3 p,const in vec3 n,const in vec3 v,const in vec3 ccNormal,const in PhysicalMaterial material,inout ReflectedLight reflectedLight){
 vec3 beforeDiffuse=reflectedLight.directDiffuse,beforeSpecular=reflectedLight.directSpecular;
 #ifdef USE_SHEEN
 vec3 beforeSheen=sheenSpecularDirect;
 #endif
 #ifdef USE_CLEARCOAT
 vec3 beforeCoat=clearcoatSpecularDirect;
 #endif
 RE_Direct_RectArea_Studio(light,p,n,v,ccNormal,material,reflectedLight);
 if(!receiveShadow)return;
 vec3 sourceNormal=-normalize(cross(light.halfWidth,light.halfHeight));float sampleArea=length(light.halfWidth)*length(light.halfHeight);
 #ifdef USE_IRIDESCENCE
 vec3 specularFull=vec3(0.),specularVisible=vec3(0.);
 #elif defined(STUDIO_ACHROMATIC_SPECULAR)
 float specularWeightFull=0.,specularWeightVisible=0.;
 #else
 PhysicalMaterial studioUnitSpecular=material;studioUnitSpecular.specularColor=vec3(1.);studioUnitSpecular.specularF90=1.;
 float specularBaseFull=0.,specularBaseVisible=0.,specularEdgeFull=0.,specularEdgeVisible=0.;
 #endif
 #ifdef STUDIO_CLOTH_TRANSMISSION
 float reflectedFull=0.,reflectedVisible=0.,transmittedFull=0.,transmittedVisible=0.;
 #else
 vec3 diffuseFull=vec3(0.),diffuseVisible=vec3(0.);
 #endif
 #ifdef USE_SHEEN
 float sheenWeightVisible=0.;float sourceVisibility[16];bool sheenHorizon=false;
 #ifdef STUDIO_CAST_DEPTH_PLANES
 sheenHorizon=studioSheenCrossesHorizon(light,p,n);
 #endif
 #endif
 #ifdef USE_CLEARCOAT
 float coatFullWeight=0.,coatVisibleWeight=0.;
 #endif
 vec3 worldN=inverseTransformDirection(normalize(vNormal),viewMatrix);
 #ifdef STUDIO_CLOTH_TRANSMISSION
 vec3 clothGeometricView=studioClothGeometricView,clothGeometricWorld=studioClothGeometricWorld,clothTransmittedColor=studioClothTransmittedColor(material);
 #endif
 ${samples}
 #ifdef STUDIO_CLOTH_TRANSMISSION
 vec3 reflectedColor=light.color*BRDF_Lambert(material.diffuseColor),transmittedColor=light.color*BRDF_Lambert(clothTransmittedColor);
 vec3 diffuseFull=reflectedColor*reflectedFull+transmittedColor*transmittedFull;
 vec3 diffuseVisible=reflectedColor*reflectedVisible+transmittedColor*transmittedVisible;
 #endif
 #if defined(STUDIO_ACHROMATIC_SPECULAR) && !defined(USE_IRIDESCENCE)
 vec3 specularFull=light.color*specularWeightFull,specularVisible=light.color*specularWeightVisible;
 #elif !defined(USE_IRIDESCENCE)
 vec3 specularFull=light.color*(material.specularColor*specularBaseFull+vec3(material.specularF90*specularEdgeFull));
 vec3 specularVisible=light.color*(material.specularColor*specularBaseVisible+vec3(material.specularF90*specularEdgeVisible));
 #endif
 reflectedLight.directDiffuse=beforeDiffuse+(reflectedLight.directDiffuse-beforeDiffuse)*studioVisibilityRatio(diffuseVisible,diffuseFull);
 reflectedLight.directSpecular=beforeSpecular+(reflectedLight.directSpecular-beforeSpecular)*studioVisibilityRatio(specularVisible,specularFull);
 #ifdef USE_SHEEN
 vec3 sheenVisible=light.color*material.sheenColor*sheenWeightVisible;
 if(sheenHorizon)sheenVisible=studioHorizonSheen(light,p,n,v,material,sourceVisibility,true);
 sheenSpecularDirect=beforeSheen+sheenVisible;
 #endif
 #ifdef USE_CLEARCOAT
 vec3 coatFull=light.color*coatFullWeight,coatVisible=light.color*coatVisibleWeight;
 clearcoatSpecularDirect=beforeCoat+(clearcoatSpecularDirect-beforeCoat)*studioVisibilityRatio(coatVisible,coatFull);
 #endif
}
#undef RE_Direct_RectArea
#define RE_Direct_RectArea RE_Direct_RectArea_Visibility
#endif
`;
return helpers;
}
const shaderCodes=new Map();
export function applyStudioAreaVisibility(material,shadow){
 if(material.userData.studioAreaVisibility)return;material.userData.studioAreaVisibility=true;
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey(),side=shadow.sampleSide??4;
 if(!shaderCodes.has(side))shaderCodes.set(side,visibilityCode(side));
 const helpers=shaderCodes.get(side);
 // The known cloth/ink pipeline keeps dielectric F0 achromatic. Do not use
 // the one-scalar path for coloured F0, maps, metal or iridescence.
 const achromatic=()=>{const c=material.specularColor;return Boolean(material.userData.clothTransmittance)&&material.metalness===0&&!material.metalnessMap&&!material.specularColorMap&&!material.iridescence&&Boolean(c)&&c.r===c.g&&c.g===c.b;};
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);if(side!==4)shader.fragmentShader='#define STUDIO_AREA_SAMPLE_SIDE '+side+'\n'+shader.fragmentShader;if(achromatic())shader.fragmentShader='#define STUDIO_ACHROMATIC_SPECULAR\n'+shader.fragmentShader;if(!shader.fragmentShader.includes('RE_Direct_RectArea_Studio'))return;
  Object.assign(shader.uniforms,shadow.uniforms);if(shadow.depthPlanes)shader.fragmentShader='#define STUDIO_CAST_DEPTH_PLANES\n'+shader.fragmentShader;
  const clothWorld=shader.fragmentShader.includes('#define STUDIO_CLOTH_TRANSMISSION');
  if(!clothWorld){shader.vertexShader='varying vec3 vStudioAreaWorld;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\n vStudioAreaWorld=(modelMatrix*vec4(transformed,1.)).xyz;');}
  shader.fragmentShader='#define STUDIO_SOURCE_SHEEN_VISIBILITY\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('void main() {',(clothWorld?helpers.replace('varying vec3 vStudioAreaWorld;','').replaceAll('vStudioAreaWorld','vStudioClothWorld'):helpers)+'\nvoid main() {');
  // Replace the old centre attenuation. Diffuse/GGX/coat retain their area
  // integrals; sheen is accumulated once from the visible source samples.
  shader.fragmentShader=shader.fragmentShader.replace('rectAreaLight.color*=getShadow(directionalShadowMap[0],shadow.shadowMapSize,shadow.shadowIntensity,shadow.shadowBias,shadow.shadowRadius,vDirectionalShadowCoord[0]);','/* area visibility follows the unoccluded integral */');
 };
 material.customProgramCacheKey=()=>key+'-studio-area-visibility-v14-samples'+side+'-achromatic'+(shadow.depthPlanes?'-planes':'-packed')+(achromatic()?'-achromatic':'-colour');material.needsUpdate=true;
}
