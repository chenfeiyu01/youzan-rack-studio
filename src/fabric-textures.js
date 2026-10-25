import * as THREE from 'three';
import{MODEL_METRES}from'./model-config.js';
import {fabricPresets,fabricPreset} from './fabric-presets.js';
const maps=new Map(),loading=new Map();
// Source dimensions are 263.6 × 263.8 mm, not the rounded 0.3 m label.
const PATCH_METRES=.2638;
function prepare(texture,color=false){texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=16;if(color)texture.colorSpace=THREE.SRGBColorSpace;return texture;}
export async function preloadFabricTextures(families=Object.keys(fabricPresets)){
  await Promise.all([...new Set(['cotton',...families])].map(name=>{
    const preset=fabricPreset(name);if(maps.has(name))return;
    if(!loading.has(name)){
      const loader=new THREE.TextureLoader(),base=(import.meta.env?.BASE_URL??'/')+'textures/'+preset.folder+'/';
      const pending=Promise.all(['normal','roughness','albedo'].map(key=>loader.loadAsync(base+key+'-'+preset.resolution+'.jpg')))
        .then(([normal,roughness,albedo])=>{maps.set(name,{normal:prepare(normal),roughness:prepare(roughness),albedo:prepare(albedo,true)});})
        .finally(()=>loading.delete(name));
      loading.set(name,pending);
    }
    return loading.get(name);
  }));
}
export function fabricTextures(repeat=3.5,family='cotton'){
  const preset=fabricPreset(family),set=maps.get(family);if(!set)throw new Error('布料材质尚未加载：'+family);
  return Object.fromEntries(Object.entries(set).map(([key,value])=>{const texture=value.clone();texture.repeat.set(repeat*preset.repeatAspect[0],repeat*preset.repeatAspect[1]);texture.needsUpdate=true;return[key,texture];}));
}
const repeatCache=new WeakMap();

// Fit the dominant cloth area, not total UV area: a tiny distorted UV island
// must not shrink the weave over the whole garment. The median is weighted by
// rest-surface area and is invariant to UV mirroring and uniform subdivision.
export function fabricRepeat(geometry,patchMetres=PATCH_METRES){
 if(!(patchMetres>0&&Number.isFinite(patchMetres)))throw new RangeError('布料扫描尺寸必须为有限正值');
 const p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),index=geometry.index;
 const ratio=PATCH_METRES/patchMetres;
 if(!p||!uv)return 3.5*ratio;
 const previous=repeatCache.get(geometry);
 if(previous&&previous.p===p&&previous.uv===uv&&previous.index===index&&previous.pVersion===p.version&&previous.uvVersion===uv.version&&previous.indexVersion===index?.version)return previous.repeat*ratio;
 const count=index?index.count:p.count,patches=[];let totalArea=0;
 for(let k=0;k+2<count;k+=3){
  const a=index?index.getX(k):k,b=index?index.getX(k+1):k+1,c=index?index.getX(k+2):k+2;
  const ax=p.getX(b)-p.getX(a),ay=p.getY(b)-p.getY(a),az=p.getZ(b)-p.getZ(a),bx=p.getX(c)-p.getX(a),by=p.getY(c)-p.getY(a),bz=p.getZ(c)-p.getZ(a);
  const area=Math.hypot(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx)*.5;
  const uvArea=Math.abs((uv.getX(b)-uv.getX(a))*(uv.getY(c)-uv.getY(a))-(uv.getY(b)-uv.getY(a))*(uv.getX(c)-uv.getX(a)))*.5;
  const scale=Math.sqrt(area/uvArea);
  if(!(area>0&&uvArea>0&&scale>0&&Number.isFinite(area)&&Number.isFinite(scale)))continue;
  patches.push({area,scale});totalArea+=area;
 }
 let repeat=3.5;
 if(patches.length){
  patches.sort((a,b)=>a.scale-b.scale);let area=0;
  for(const patch of patches){area+=patch.area;if(area>=totalArea*.5){repeat=patch.scale*MODEL_METRES/PATCH_METRES;break;}}
 }
 // Authored trim UVs may span hundreds of tiles: a fixed .5 lower clamp would
 // make the scan hundreds of times too dense. Only invalid data falls back.
 repeatCache.set(geometry,{p,uv,index,pVersion:p.version,uvVersion:uv.version,indexVersion:index?.version,repeat});
 return repeat*ratio;
}
