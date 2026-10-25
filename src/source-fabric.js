import {ShaderChunk}from'three';

// The family albedo and dye gain are calibrated together. Source detail maps
// add the authored folds without replacing that diffuse reflectance texture.
export function applySourceFabricMaps(material,source){
  material.normalMap=source.normalMap;material.normalScale.copy(source.normalScale);
  material.roughnessMap=source.roughnessMap;material.aoMap=source.aoMap;
  material.aoMapIntensity=source.aoMapIntensity;material.userData.sourceFabricMaps=true;
}

// Source normal/ORM contains a baked print. Resample only that UV island
// from the corresponding unprinted knit, preserving the original photo maps.
export function applySourceFabricResponse(shader){
  for(const name of['normal_fragment_maps','roughnessmap_fragment','aomap_fragment'])shader.fragmentShader=shader.fragmentShader.replace('#include <'+name+'>',ShaderChunk[name]);
  shader.fragmentShader=shader.fragmentShader.replace(/texture2D\(\s*(normalMap|roughnessMap|aoMap)\s*,\s*(vNormalMapUv|vRoughnessMapUv|vAoMapUv)\s*\)/g,'sourceClothSample($1,$2)');
  shader.fragmentShader=`float sourcePrintMask(vec2 uv){
    vec2 low=smoothstep(vec2(.65,.485),vec2(.665,.50),uv),high=1.-smoothstep(vec2(.88,.77),vec2(.895,.785),uv);
    return low.x*low.y*high.x*high.y;
  }
  vec4 sourceClothSample(sampler2D source,vec2 uv){
    return mix(texture2D(source,uv),texture2D(source,uv-vec2(.5,0.)),sourcePrintMask(uv));
  }\n`+shader.fragmentShader;
}
