import {ShaderChunk} from 'three';

// A matte print partially fills the knit and covers its exposed fibers.
// Keep the garment's geometric folds, while changing only the inked surface.
export function applyPrintResponse(shader,coverage='inkAlpha'){
  if(!shader.fragmentShader.includes('#include <lights_physical_fragment>'))return;
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    roughnessFactor=mix(roughnessFactor,.72,${coverage});`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;',`mapN.xy *= normalScale*mix(1.,.25,${coverage});`));
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`#include <lights_physical_fragment>
    material.specularColor=mix(material.specularColor,vec3(.04),${coverage});
    #ifdef STUDIO_CLOTH_TRANSMISSION
      float transmissionInk=${coverage};
      #ifdef STUDIO_CLOTH_EXIT
        vec2 otherInkUv=(vStudioClothOtherRest.xy-uInkOffset)/uInkSize+.5;
        float otherInkMask=step(0.,otherInkUv.x)*step(otherInkUv.x,1.)*step(0.,otherInkUv.y)*step(otherInkUv.y,1.);
        transmissionInk=max(transmissionInk,texture2D(uInkMap,otherInkUv).a*otherInkMask*clamp(vStudioClothOtherRest.z,0.,1.)*uInkAbsorptionEnabled);
      #endif
      material.studioClothTransmittance*=mix(1.,.10,transmissionInk);
    #endif
    #ifdef USE_SHEEN
      material.sheenColor*=mix(1.,.25,${coverage});
    #endif`);
}
