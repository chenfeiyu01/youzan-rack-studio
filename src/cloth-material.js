import * as THREE from 'three';
import { ClothCage, CLOTH_COUNT } from './physics.js';
import { fabricTextures } from './fabric-textures.js';
import {applyPrintResponse} from './print-response.js';
import {fabricColorGain,fabricPreset} from './fabric-presets.js';

const declarations=`
uniform vec3 uCloth[${CLOTH_COUNT}];
uniform float uFoldAmount;
varying vec3 vGarmentRest;
varying float vInkFront;
vec3 cageLayer(vec2 g, int layer) {
  ivec2 cell=ivec2(floor(g));
  vec2 f=fract(g);
  int base=layer*45+cell.y*5+cell.x;
  vec3 a=mix(uCloth[base],uCloth[base+1],f.x);
  vec3 b=mix(uCloth[base+5],uCloth[base+6],f.x);
  return mix(a,b,f.y);
}
vec3 clothOffset(vec3 p) {
  vec2 g=clamp(vec2((p.x+1.45)/2.90*4.0,(.98-p.y)/2.58*8.0),vec2(0.0),vec2(3.9999,7.9999));
  float layer=clamp((.14-p.z)/.28,0.0,1.0);
  vec3 offset=mix(cageLayer(g,0),cageLayer(g,1),layer);
  float freeCloth=1.0-smoothstep(-.35,.80,p.y);
  float folds=sin(p.x*18.0+p.y*.8)+.35*sin(p.x*33.0-p.y*1.7);
  offset.z+=folds*uFoldAmount*freeCloth*sign(p.z);
  // The collar and shoulder sit on a rigid hanger. Let motion grow below it.
  return offset*(1.0-smoothstep(.20,.55,p.y));
}
`;

let emptyInk;
function emptyInkMap() {
  if(!emptyInk){emptyInk=new THREE.DataTexture(new Uint8Array([0,0,0,0]),1,1,THREE.RGBAFormat);emptyInk.needsUpdate=true;}
  return emptyInk;
}

export function cottonMaterial(color,profile={},repeat=3.5,family='cotton') {
  const preset=fabricPreset(family),maps=fabricTextures(repeat,family);
  // Separate fiber grazing reflectance from the body dye (Filament cloth model).
  const dye=new THREE.Color(color),fiber=new THREE.Color(Math.sqrt(dye.r),Math.sqrt(dye.g),Math.sqrt(dye.b));
  const body=dye.clone().multiplyScalar(fabricColorGain(family,dye.toArray()));
  const material=new THREE.MeshPhysicalMaterial({
    color:body,map:maps.albedo,roughness:Math.min(1,.95+(profile.mass??1)*.025),roughnessMap:maps.roughness,metalness:0,sheen:preset.sheen,sheenColor:fiber,sheenRoughness:preset.sheenRoughness,ior:1.45,
    normalMap:maps.normal,normalScale:new THREE.Vector2(.70,.70),side:THREE.DoubleSide,
  });
  material.userData.clothTransmittance={value:preset.diffuseTransmissionGain};
  return material;
}

export function createClothRig(longSleeve,profile) {
  const cage=new ClothCage(longSleeve,profile);
  const nodes=Array.from({length:CLOTH_COUNT},()=>new THREE.Vector3());
  const uniforms={uCloth:{value:nodes},uFoldAmount:{value:longSleeve?.003:.012}};
  const attach=material=>{
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,uniforms);
      shader.uniforms.uInkMap={value:material.userData.ink??emptyInkMap()};
      shader.uniforms.uInkSize={value:material.userData.inkSize??new THREE.Vector2(1,1)};
      shader.uniforms.uInkOffset={value:material.userData.inkOffset??new THREE.Vector2()};
      shader.uniforms.uInkEnabled={value:material.userData.ink&&!material.userData.inkAbsorptionOnly?1:0};shader.uniforms.uInkAbsorptionEnabled={value:material.userData.ink?1:0};
      shader.vertexShader=declarations+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\n vGarmentRest=position; vInkFront=smoothstep(-.05,.10,normal.z); transformed+=clothOffset(position);`);
      shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        vec3 d0=clothOffset(position);
        vec3 jx=vec3(1.,0.,0.)+(clothOffset(position+vec3(.008,0.,0.))-d0)/.008;
        vec3 jy=vec3(0.,1.,0.)+(clothOffset(position+vec3(0.,.008,0.))-d0)/.008;
        vec3 jz=vec3(0.,0.,1.)+(clothOffset(position+vec3(0.,0.,.008))-d0)/.008;
        objectNormal=normalize(cross(jy,jz)*objectNormal.x+cross(jz,jx)*objectNormal.y+cross(jx,jy)*objectNormal.z);
      `);
      if(shader.fragmentShader.includes('#include <map_fragment>')) {
        shader.fragmentShader=`uniform sampler2D uInkMap; uniform vec2 uInkSize; uniform vec2 uInkOffset; uniform float uInkEnabled;uniform float uInkAbsorptionEnabled; varying vec3 vGarmentRest; varying float vInkFront;\n`+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
          vec2 inkUv=(vGarmentRest.xy-uInkOffset)/uInkSize+.5;
          float inkMask=step(0.,inkUv.x)*step(inkUv.x,1.)*step(0.,inkUv.y)*step(inkUv.y,1.);
          vec4 inkColor=texture2D(uInkMap,inkUv);
          float inkAlpha=inkColor.a*inkMask*vInkFront*uInkEnabled;
          diffuseColor.rgb=mix(diffuseColor.rgb,inkColor.rgb,inkAlpha);
        `);
        applyPrintResponse(shader);
      }
    };
    material.customProgramCacheKey=()=> 'rack-world-cloth-v4-print';
  };
  return {
    cage,
    bind(mesh) {
      (Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(attach);
      const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
      attach(depth);mesh.customDepthMaterial=depth;
      // Deformation can briefly extend past the static asset bounds.
      mesh.frustumCulled=false;
    },
    update(dt,pose,reduced) {
      cage.step(dt,pose,reduced);
    },
    sync() {for(let i=0;i<CLOTH_COUNT;i++)nodes[i].set(cage.offsets[i*3],cage.offsets[i*3+1],cage.offsets[i*3+2]);},
  };
}
