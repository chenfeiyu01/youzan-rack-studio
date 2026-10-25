import {BufferAttribute,BufferGeometry} from 'three';

// LOD is a draw choice only. Every garment keeps the same solver, GPU field
// and full vertex attributes. This cap is based on the sampled rack comparisons,
// not a proof for arbitrary deformation or a measured textile tolerance.
export const MAX_BACKGROUND_HEIGHT=420;
const cache=new WeakMap();
export function requiresFullDetail({index,active,owner,chosen,opening,hovered,projectedHeight}){
  return [active,owner,chosen,opening,hovered].includes(index)
    ||!Number.isFinite(projectedHeight)||projectedHeight<=0||projectedHeight>MAX_BACKGROUND_HEIGHT;
}
export function backgroundGeometry(full,indices){
  if(!indices||full.attributes.position.count!==93534||full.index?.count!==400680)return full;
  let low=cache.get(full);
  if(!low){
    low=new BufferGeometry();
    for(const[name,attribute]of Object.entries(full.attributes))low.setAttribute(name,attribute);
    low.setIndex(indices);low.boundingBox=full.boundingBox;low.boundingSphere=full.boundingSphere;
    cache.set(full,low);
  }
  return low;
}
export function applyDrawDetail(garment,fullDetail){
  let low=false;
  for(const detail of garment.userData.drawDetails??[]){
    detail.mesh.geometry=fullDetail?detail.full:detail.low;
    low||=detail.mesh.geometry!==detail.full;
  }
  return low;
}
export function detailIndex(array){
  if(!(array instanceof Uint32Array)||array.length%3!==0||!array.length)throw new Error('Invalid garment detail index');
  for(const id of array)if(id>=93534)throw new Error('Garment detail vertex out of range');
  return new BufferAttribute(array,1);
}
