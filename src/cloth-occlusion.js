// Reuse the renderer's roughness/view-dependent specular occlusion.
// Fiber sheen is a separate lobe and must receive the same cavity visibility.
export function applyClothOcclusion(shader){
 shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
   float clothAmbientOcclusion=mix(1.0,clamp(vClothAO,0.0,1.0),.88);
   reflectedLight.indirectDiffuse*=clothAmbientOcclusion;
   #ifdef USE_SHEEN
     sheenSpecularIndirect*=clothAmbientOcclusion;
   #endif
   #ifdef USE_CLEARCOAT
     clearcoatSpecularIndirect*=clothAmbientOcclusion;
   #endif
   #if defined(USE_ENVMAP) && defined(STANDARD)
     float clothDotNV=saturate(dot(geometryNormal,geometryViewDir));
     reflectedLight.indirectSpecular*=computeSpecularOcclusion(clothDotNV,clothAmbientOcclusion,material.roughness);
   #endif`);
}
