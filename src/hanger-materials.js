import * as THREE from 'three';
export function hangerWood(){
  const material=new THREE.MeshPhysicalMaterial({color:'#966c4d',roughness:.42,metalness:0,clearcoat:.18,clearcoatRoughness:.4});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vWoodLocal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vWoodLocal=position;');
    shader.fragmentShader='varying vec3 vWoodLocal;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n float grain=.5+.5*sin(vWoodLocal.y*260.+sin(vWoodLocal.x*3.5)*4.+vWoodLocal.z*90.);\n float pores=.5+.5*sin(vWoodLocal.y*870.+sin(vWoodLocal.x*11.)*3.);\n diffuseColor.rgb*=.94+.045*grain+.015*pores;`);
  };material.customProgramCacheKey=()=> 'beech-hanger-v1';return material;
}
export const hangerMetal=()=>new THREE.MeshStandardMaterial({color:'#bfc1bf',metalness:1,roughness:.23,envMapIntensity:1.4});
