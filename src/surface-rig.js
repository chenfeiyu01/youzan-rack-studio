import {applySourceFabricResponse}from'./source-fabric.js';
import {clothNormalTransport}from'./normal-transport.js';
import * as THREE from 'three';
import { SurfaceCloth } from './surface-physics.js';
import {withSurfaceFlow} from './surface-flow.js';

import {makeSurfaceBinder,surfaceReferenceNormals} from './surface-bindings.js';
import {applyPrintResponse} from './print-response.js';
import {applyClothOcclusion} from './cloth-occlusion.js';
import {applyCollarRib} from './collar-rib.js';
import {applyHemStitch} from './hem-stitch.js';
const bindingCache=new WeakMap();
function bindings(geometry,data,key,flow=false){
 key=(flow?'frames:':'probes:')+key;
 let modelCache=bindingCache.get(data);if(!modelCache){modelCache=new Map();bindingCache.set(data,modelCache);}if(modelCache.has(key))return modelCache.get(key);
 const p=geometry.attributes.position,reference=surfaceReferenceNormals(p.array,geometry.index?.array),records=[],tangent=new Float32Array(p.count*3),bitangent=new Float32Array(p.count*3),index=new Float32Array(p.count*2),ao=new Float32Array(p.count),cavity=geometry.attributes.color,bind=flow?null:makeSurfaceBinder(data);let total=0;
 for(let i=0;i<p.count;i++){
 if(flow){const n=new THREE.Vector3(reference[i*3],reference[i*3+1],reference[i*3+2]).normalize(),u=new THREE.Vector3().crossVectors(Math.abs(n.x)<.8?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0),n).normalize(),v=new THREE.Vector3().crossVectors(n,u);tangent.set(u.toArray(),i*3);bitangent.set(v.toArray(),i*3);ao[i]=cavity?cavity.getX(i):1;}
 else{const b=bind([p.getX(i),p.getY(i),p.getZ(i)],[reference[i*3],reference[i*3+1],reference[i*3+2]]);records.push(b);index[i*2]=total;index[i*2+1]=b.ids.length;total+=b.ids.length;tangent.set(b.u,i*3);bitangent.set(b.v,i*3);ao[i]=cavity?cavity.getX(i):1;}
 }
 const width=flow?1:1024,height=flow?1:Math.ceil(total/width),coefficients=new Float32Array(width*height*4);let offset=0;for(const b of records){coefficients.set(b.coefficients,offset);offset+=b.coefficients.length;}
 const texture=new THREE.DataTexture(coefficients,width,height,THREE.RGBAFormat,THREE.FloatType);texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
 const result={index:flow?null:new THREE.BufferAttribute(index,2),tangent:new THREE.BufferAttribute(tangent,3),bitangent:new THREE.BufferAttribute(bitangent,3),ao:new THREE.BufferAttribute(ao,1),texture,width,height,references:0,release(){if(--this.references===0){texture.dispose();modelCache.delete(key);}}};modelCache.set(key,result);return result;
}
const skinShader=clothNormalTransport+`
uniform sampler2D uSurface;
uniform float uSurfaceWidth;
attribute vec2 clothBinding;
attribute vec3 clothTangent;
attribute vec3 clothBitangent;
uniform sampler2D uBinding;
uniform vec2 uBindingSize;
attribute float clothAO;
varying float vClothAO;
varying vec3 vGarmentRest;
varying float vInkFront;
vec3 clothDisplacement;
mat3 clothNormalRotation;
void sampleCloth(vec3 p){
  vec3 offset=vec3(0.),du=vec3(0.),dv=vec3(0.);
  for(int i=0;i<60;i++){
    if(float(i)>=clothBinding.y)break;
    float pixel=clothBinding.x+float(i);
    vec4 weights=texture2D(uBinding,vec2((mod(pixel,uBindingSize.x)+.5)/uBindingSize.x,(floor(pixel/uBindingSize.x)+.5)/uBindingSize.y));
    vec3 delta=texture2D(uSurface,vec2((weights.w+.5)/uSurfaceWidth,.25)).xyz;
    offset+=delta*weights.x;du+=delta*weights.y;dv+=delta*weights.z;
  }
  float t=clamp((p.y-.30)/.25,0.,1.),freeCloth=1.-t*t*(3.-2.*t),gradient=-6.*t*(1.-t)/.25;
  vec3 u=clothTangent+du*freeCloth+offset*gradient*clothTangent.y;
  vec3 v=clothBitangent+dv*freeCloth+offset*gradient*clothBitangent.y;
  clothDisplacement=offset*freeCloth;
  clothNormalRotation=clothSurfaceNormalMatrix(clothTangent,clothBitangent,u,v);
}
`;
export function createSurfaceRig(data,profile,key,options={}) {
  const ownedBindings=new Set(),solver=new SurfaceCloth(data,profile),count=solver.count,pixels=new Float32Array(count*4*2);
  const texture=new THREE.DataTexture(pixels,count,2,THREE.RGBAFormat,THREE.FloatType);texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  for(let node=0;node<count;node++)for(let k=0;k<3;k++)pixels[count*4+node*4+k]=solver.rest[node*3+k];
  function attach(material,binding){

    material.onBeforeCompile=shader=>{
      shader.uniforms.uBinding={value:binding.texture};shader.uniforms.uBindingSize={value:new THREE.Vector2(binding.width,binding.height)};
      shader.uniforms.uSurface={value:texture};shader.uniforms.uSurfaceWidth={value:count};
      shader.uniforms.uInkMap={value:material.userData.ink??texture};shader.uniforms.uInkSize={value:material.userData.inkSize??new THREE.Vector2(1,1)};shader.uniforms.uInkOffset={value:material.userData.inkOffset??new THREE.Vector2()};shader.uniforms.uInkEnabled={value:material.userData.ink&&!material.userData.inkAbsorptionOnly?1:0};shader.uniforms.uInkAbsorptionEnabled={value:material.userData.ink?1:0};
      shader.vertexShader=((material.userData.sourcePrintRest?'attribute vec3 sourcePrintRest;attribute float sourcePrintFront;\n':'')+skinShader+shader.vertexShader).replace('void main() {','void main() {\n sampleCloth(position);');
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\n vGarmentRest=${material.userData.sourcePrintRest?'sourcePrintRest':'position'};vInkFront=${material.userData.sourcePrintRest?'sourcePrintFront':'smoothstep(-.05,.10,normal.z)'};vClothAO=clothAO;transformed+=clothDisplacement;`);
      shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>\n objectNormal=clothTransportNormal(objectNormal,clothNormalRotation);`);
      if(shader.fragmentShader.includes('#include <map_fragment>')){
        shader.fragmentShader='uniform sampler2D uInkMap;uniform vec2 uInkSize;uniform vec2 uInkOffset;uniform float uInkEnabled;uniform float uInkAbsorptionEnabled;varying vec3 vGarmentRest;varying float vInkFront;varying float vClothAO;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
          vec2 inkUv=(vGarmentRest.xy-uInkOffset)/uInkSize+.5;
          float inkMask=step(0.,inkUv.x)*step(inkUv.x,1.)*step(0.,inkUv.y)*step(inkUv.y,1.);
          vec4 ink=texture2D(uInkMap,inkUv);float inkAlpha=ink.a*inkMask*vInkFront*uInkEnabled;
          diffuseColor.rgb=mix(diffuseColor.rgb,ink.rgb,inkAlpha);
        `);
        applyClothOcclusion(shader);
        applyPrintResponse(shader);
        if(material.userData.collarRib)applyCollarRib(shader,material.userData.collarRib);
        if(material.userData.hemStitch)applyHemStitch(shader,material.userData.hemStitch);
      }
      if(material.userData.sourceFabricMaps)applySourceFabricResponse(shader);
    };material.customProgramCacheKey=()=> 'garment-surface-probe-v4-print-ao1'+(material.userData.collarRib?'-rib':'')+(material.userData.sourcePrintRest?'-source-print':'')+(material.userData.sourceFabricMaps?'-source-maps1':'')+(material.userData.hemStitch?'-hem':'');
  }
  const neighbors=Array.from({length:count},()=>new Set());
  for(const c of solver.contactLinks){neighbors[c.a].add(c.b);neighbors[c.b].add(c.a);}
  const filtered=[new Float32Array(solver.offsets.length),new Float32Array(solver.offsets.length)];
  let syncedVersion=-1;
  const rig={
    solver,texture,
    bind(mesh){const b=bindings(mesh.geometry,data,key+':'+mesh.name,Boolean(options?.flow));if(!ownedBindings.has(b)){ownedBindings.add(b);b.references++;}if(b.index)mesh.geometry.setAttribute('clothBinding',b.index);mesh.geometry.setAttribute('clothTangent',b.tangent);mesh.geometry.setAttribute('clothBitangent',b.bitangent);mesh.geometry.setAttribute('clothAO',b.ao);(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(m=>{m.userData.sourcePrintRest=mesh.geometry.hasAttribute('sourcePrintRest');attach(m,b);});const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});depth.userData.sourcePrintRest=mesh.geometry.hasAttribute('sourcePrintRest');attach(depth,b);mesh.customDepthMaterial=depth;mesh.frustumCulled=false;},
    update(dt,pose,reduced,preciseContacts=true){solver.preciseContacts=preciseContacts;solver.step(dt,pose,reduced);},
    suspend(){solver.initialized=false;solver.asleep=true;},
    sync(){
      if(syncedVersion===solver.version)return;syncedVersion=solver.version;
      filtered[0].set(solver.offsets);
      // Transfer broad cloth motion to the detailed authored folds without
      // exposing high-frequency numerical noise from the coarse solver.
      for(let pass=0;pass<5;pass++){
        const source=filtered[pass%2],target=filtered[(pass+1)%2];
        for(let node=0;node<count;node++){
          const i=node*3;if(!solver.inverseMass[node]){target[i]=target[i+1]=target[i+2]=0;continue;}
          let x=0,y=0,z=0;const adjacent=neighbors[node],size=adjacent.size;
          for(const other of adjacent){const j=other*3;x+=source[j];y+=source[j+1];z+=source[j+2];}
          target[i]=source[i]*.40+(size?x/size:source[i])*.60;
          target[i+1]=source[i+1]*.40+(size?y/size:source[i+1])*.60;
          target[i+2]=source[i+2]*.40+(size?z/size:source[i+2])*.60;
        }
      }
      for(let node=0;node<count;node++)for(let k=0;k<3;k++)pixels[node*4+k]=filtered[1][node*3+k];texture.needsUpdate=true;
    },
    dispose(){texture.dispose();for(const b of ownedBindings)b.release();ownedBindings.clear();},
  };
  return options?.flow?withSurfaceFlow(rig,data):rig;
}

