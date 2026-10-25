import{clothTransmissionField,clothTransmissionPars,clothTransmissionSetup}from'./studio-cloth-transmission.js';
import {ShaderChunk} from 'three';
import{horizonSheen}from'./studio-sheen-horizon.js';

// Stock r180 LTC integrates GGX and diffuse. Add the coat's GGX lobe through
// the same LTC. Charlie sheen retains 4x4 nodes for a fully lit source and
// remaps quadrature to its front-facing portion at the receiver horizon.
// The source emits in local -Z; halfWidth x halfHeight points away from it.
export const studioAreaNodes=Object.freeze([-.8611363115940526,-.3399810435848563,.3399810435848563,.8611363115940526]);
export const studioAreaWeights=Object.freeze([.34785484513745385,.6521451548625461,.6521451548625461,.34785484513745385]);
const sheenSamples=studioAreaNodes.flatMap((y,iy)=>studioAreaNodes.map((x,ix)=>`{
 vec3 delta=light.position+light.halfWidth*${x.toFixed(12)}+light.halfHeight*${y.toFixed(12)}-p;
 float r2=max(dot(delta,delta),1.e-8);vec3 l=delta*inversesqrt(r2);
 vec3 radianceWeight=light.color*(sampleArea*${(studioAreaWeights[ix]*studioAreaWeights[iy]).toFixed(12)}*max(dot(sourceNormal,-l),0.)/r2);
 sheenSpecularDirect+=radianceWeight*max(dot(n,l),0.)*BRDF_Sheen(l,v,n,material.sheenColor,material.sheenRoughness);
}`)).join('\n');
const areaResponse=`
#if NUM_RECT_AREA_LIGHTS > 0
void RE_Direct_RectArea_Studio(const in RectAreaLight light,const in vec3 p,const in vec3 n,const in vec3 v,const in vec3 ccNormal,const in PhysicalMaterial material,inout ReflectedLight reflectedLight){
 RE_Direct_RectArea_Physical(light,p,n,v,ccNormal,material,reflectedLight);
 #ifdef STUDIO_CLOTH_TRANSMISSION
 reflectedLight.directDiffuse+=light.color*studioClothTransmittedColor(material)*studioClothAreaBack;
 #endif
 #ifdef USE_CLEARCOAT
 PhysicalMaterial coat=material;
 coat.diffuseColor=vec3(0.);
 coat.roughness=material.clearcoatRoughness;
 coat.specularColor=vec3(material.clearcoatF0);
 ReflectedLight coatLight=ReflectedLight(vec3(0.),vec3(0.),vec3(0.),vec3(0.));
 RE_Direct_RectArea_Physical(light,p,ccNormal,v,ccNormal,coat,coatLight);
 clearcoatSpecularDirect+=coatLight.directSpecular;
 #endif
 #ifdef USE_SHEEN
 vec3 sourceNormal=-normalize(cross(light.halfWidth,light.halfHeight));
 float sampleArea=length(light.halfWidth)*length(light.halfHeight);
 #if defined(STUDIO_SOURCE_SHEEN_VISIBILITY) && defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
 if(!receiveShadow){
 #endif
 bool clippedSheen=false;
 #if defined(STUDIO_CAST_DEPTH_PLANES) || !defined(USE_SHADOWMAP) || NUM_DIR_LIGHT_SHADOWS == 0
 clippedSheen=studioSheenCrossesHorizon(light,p,n);
 #endif
 if(clippedSheen){
  float sourceVisibility[16];for(int i=0;i<16;i++)sourceVisibility[i]=1.;
  sheenSpecularDirect+=studioHorizonSheen(light,p,n,v,material,sourceVisibility,false);
 }else{${sheenSamples}}
 #if defined(STUDIO_SOURCE_SHEEN_VISIBILITY) && defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
 }
 #endif
 #endif
}
#undef RE_Direct_RectArea
#define RE_Direct_RectArea RE_Direct_RectArea_Studio
#endif
`;

const directBlock=ShaderChunk.lights_fragment_begin;
// r180's normalize(V-N*dot(V,N)) is undefined when view and normal coincide,
// including an exactly front-facing calibration card. Isotropic LTC permits
// any stable tangent in this case; keep the native basis everywhere else.
// Lambert irradiance has a polygon edge integral. Clip at the receiver horizon
// rather than using r180's clipped-sphere fit, which can add light on the dark
// side of folds. The GGX lobe continues to use the native fitted LTC tables.
const diffuseArea=`
#ifdef STUDIO_CLOTH_TRANSMISSION
float studioClothAreaBack;
#endif
float studioDiffuseArea(const in RectAreaLight light,const in vec3 p,const in vec3 n){
 #ifdef STUDIO_CLOTH_TRANSMISSION
 studioClothAreaBack=0.;
 #endif
 vec3 w=light.halfWidth,h=light.halfHeight,c=light.position-p;
 if(dot(-cross(w,h),-c)<=0.)return 0.;
 vec3 corners[4];
 corners[0]=c+w-h;corners[1]=c-w-h;corners[2]=c-w+h;corners[3]=c+w+h;
 #ifdef STUDIO_CLOTH_TRANSMISSION
 // The signed, unclipped irradiance is front minus back. Derive both
 // hemispheres from one clip; avoid a second rectangle integration.
 vec3 unitCorners[4];float minimum=1.e30,maximum=-1.e30;
 for(int i=0;i<4;i++){unitCorners[i]=normalize(corners[i]);float d=dot(n,corners[i]);minimum=min(minimum,d);maximum=max(maximum,d);}
 vec3 whole=vec3(0.);for(int i=0;i<4;i++)whole+=LTC_EdgeVectorFormFactor(unitCorners[i],unitCorners[i==3?0:i+1]);
 float signedArea=-dot(n,whole);
 if(minimum>=0.||maximum<=0.){studioClothAreaBack=max(-signedArea,0.);return max(signedArea,0.);}
 #endif
 vec3 polygon[5];int count=0;
 for(int i=0;i<4;i++){
  vec3 a=corners[i],b=corners[i==3?0:i+1];
  float da=dot(n,a),db=dot(n,b);
  if(da>=0.){polygon[count]=a;count++;}
  if((da>=0.)!=(db>=0.)){polygon[count]=mix(a,b,da/(da-db));count++;}
 }
 if(count<3)return 0.;
 vec3 integral=vec3(0.);
 for(int i=0;i<5;i++){
  if(i>=count)break;
  integral+=LTC_EdgeVectorFormFactor(normalize(polygon[i]),normalize(polygon[i+1<count?i+1:0]));
 }
 float frontArea=max(-dot(n,integral),0.);
 #ifdef STUDIO_CLOTH_TRANSMISSION
 studioClothAreaBack=max(frontArea-signedArea,0.);
 #endif
 return frontArea;
}
`;
const physical=ShaderChunk.lights_physical_pars_fragment
 .replace('struct PhysicalMaterial {','struct PhysicalMaterial {'+clothTransmissionField)
 .replace('T1 = normalize( V - N * dot( V, N ) );',`vec3 projectedView=V-N*dot(V,N);
 T1=dot(projectedView,projectedView)>1.e-8?normalize(projectedView):normalize(cross(abs(N.z)<.999?vec3(0.,0.,1.):vec3(0.,1.,0.),N));`)
 .replace('void RE_Direct_RectArea_Physical(',diffuseArea+'\nvoid RE_Direct_RectArea_Physical(')
 .replace('lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords )','lightColor * material.diffuseColor * studioDiffuseArea(rectAreaLight,position,normal)');
const directionalStart='\t\tdirectionalLight = directionalLights[ i ];';
const directionalEnd='\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
// Only the first directional shadow light is the studio key proxy. Other
// directional lights retain their native BRDF and are never shadowed by it.
const start=directBlock.indexOf(directionalStart),end=directBlock.indexOf(directionalEnd,start)+directionalEnd.length;
const begin=directBlock.slice(0,start)+`
 #if !(NUM_RECT_AREA_LIGHTS > 0 && NUM_DIR_LIGHT_SHADOWS > 0 && UNROLLED_LOOP_INDEX == 0)
`+directBlock.slice(start,end)+`
 #endif
`+directBlock.slice(end);
const lighting=begin.replace('\t\trectAreaLight = rectAreaLights[ i ];',`
  rectAreaLight = rectAreaLights[ i ];
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0 && UNROLLED_LOOP_INDEX == 0
  if(receiveShadow){
   DirectionalLightShadow shadow=directionalLightShadows[0];
   rectAreaLight.color*=getShadow(directionalShadowMap[0],shadow.shadowMapSize,shadow.shadowIntensity,shadow.shadowBias,shadow.shadowRadius,vDirectionalShadowCoord[0]);
  }
  #endif
`);

export function applyStudioAreaLight(material){
 if(material.userData.studioAreaLight)return;
 material.userData.studioAreaLight=true;
 const before=material.onBeforeCompile,key=material.customProgramCacheKey(),transmission=material.userData.clothTransmittance;
 material.onBeforeCompile=function(shader,renderer){
  before.call(this,shader,renderer);
  if(!shader.fragmentShader.includes('#include <lights_physical_pars_fragment>'))return;
  if(transmission&&(renderer?.capabilities?.maxVaryings??32)>=20){
   const exit=material.userData.clothExit&&shader.vertexShader.includes('vec3 flowMap(');
   shader.uniforms.uStudioClothTransmittance=transmission;
   shader.fragmentShader='#define STUDIO_CLOTH_TRANSMISSION\n'+(exit?'#define STUDIO_CLOTH_EXIT\n':'')+shader.fragmentShader;
   shader.vertexShader='varying vec3 vStudioClothWorld;\n'+(exit?'attribute vec4 clothDelta;uniform float uStudioClothTransmittance;varying vec3 vStudioClothExitWorld;varying vec3 vStudioClothOtherRest;\n':'')+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
    vStudioClothWorld=(modelMatrix*vec4(transformed,1.)).xyz;
    ${exit?`vec3 otherRest=position+clothDelta.xyz;
    vStudioClothOtherRest=vec3(otherRest.xy,clothDelta.w);
    vStudioClothExitWorld=uStudioClothTransmittance>0.?(modelMatrix*vec4(flowMap(otherRest),1.)).xyz:vStudioClothWorld;`:''}`);
  }
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',physical+'\n'+clothTransmissionPars+'\n'+horizonSheen+'\n'+areaResponse).replace('#include <lights_physical_fragment>','#include <lights_physical_fragment>'+clothTransmissionSetup).replace('#include <lights_fragment_begin>',lighting);
 };
 material.customProgramCacheKey=()=>key+'-studio-area-v9-paired-exit-hoisted'+(transmission?'-thin':'-opaque')+(material.userData.clothExit?'-exit':'-single');
 material.needsUpdate=true;
}
