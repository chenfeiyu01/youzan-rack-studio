// Thin-sheet Lambert diffuse transmission, inspired by thin-surface BSDFs:
// https://mitsuba.readthedocs.io/en/stable/src/generated/plugins_bsdfs.html
// This is a local lobe with opaque shadow visibility, not multiple scattering
// through several cloth layers. Gains are appearance presets, not measurements.
export const clothTransmissionField=`
#ifdef STUDIO_CLOTH_TRANSMISSION
 float studioClothTransmittance;
#endif
`;
export const clothTransmissionSetup=`
#ifdef STUDIO_CLOTH_TRANSMISSION
 #ifdef STUDIO_CLOTH_EXIT
 studioClothPeerDirectionView=mat3(viewMatrix)*(vStudioClothExitWorld-vStudioClothWorld);
 #endif
 studioClothGeometricView=studioClothGeometricNormalView(normal);
 studioClothGeometricWorld=inverseTransformDirection(studioClothGeometricView,viewMatrix);
 material.studioClothTransmittance=clamp(uStudioClothTransmittance,0.,1.);
 #ifdef STUDIO_CLOTH_EXIT
 material.studioClothTransmittance*=smoothstep(-.5,0.,vStudioClothOtherRest.z);
 #endif
#endif
`;
export const clothTransmissionPars=`
#ifdef STUDIO_CLOTH_TRANSMISSION
uniform float uStudioClothTransmittance;
varying vec3 vStudioClothWorld;
#ifdef STUDIO_CLOTH_EXIT
varying vec3 vStudioClothExitWorld;
varying vec3 vStudioClothOtherRest;
vec3 studioClothPeerDirectionView;
#endif
vec3 studioClothShadowPoint(vec3 lightDirectionView){
 #ifdef STUDIO_CLOTH_EXIT
 return mix(vStudioClothWorld,vStudioClothExitWorld,bvec3(dot(studioClothPeerDirectionView,lightDirectionView)>0.));
 #endif
 return vStudioClothWorld;
}
vec3 studioClothGeometricView,studioClothGeometricWorld;
vec3 studioClothGeometricNormalView(vec3 fallback){
 vec3 g=cross(dFdx(vViewPosition),dFdy(vViewPosition));float l2=dot(g,g);
 return l2>1.e-20?g*inversesqrt(l2):fallback;
}
vec3 studioClothTransmittedColor(const in PhysicalMaterial material){
 return min(material.diffuseColor*material.studioClothTransmittance,max(vec3(0.),vec3(1.)-material.diffuseColor));
}
void RE_Direct_StudioCloth(const in IncidentLight light,const in vec3 p,const in vec3 n,const in vec3 v,const in vec3 ccNormal,const in PhysicalMaterial material,inout ReflectedLight reflectedLight){
 RE_Direct_Physical(light,p,n,v,ccNormal,material,reflectedLight);
 reflectedLight.directDiffuse+=light.color*max(-dot(n,light.direction),0.)*BRDF_Lambert(studioClothTransmittedColor(material));
}
#undef RE_Direct
#define RE_Direct RE_Direct_StudioCloth
#endif
`;
