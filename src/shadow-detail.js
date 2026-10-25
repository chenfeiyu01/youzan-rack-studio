import {BufferGeometry,BufferAttribute} from 'three';
const cache=new WeakMap(),base=()=>import.meta.env.BASE_URL+'models/shadow-detail/';
let manifestPromise;
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
export async function loadShadowDetails(type,source,onWarning){
 try{
  manifestPromise??=fetch(base()+'manifest.json').then(r=>{if(!r.ok)throw Error('阴影细节索引加载失败');return r.json();});
  const model=(await manifestPromise).models?.[type];
  if(!model||await digest(source)!==model.sha256)return new Map();
  return new Map(await Promise.all(Object.entries(model.meshes).map(async([name,record])=>{
   if(!/^[a-zA-Z0-9_-]+\.bin$/.test(record.file))throw Error('无效阴影索引文件');
   const response=await fetch(base()+record.file);if(!response.ok)throw Error('阴影细节加载失败');const bytes=await response.arrayBuffer();
   if(bytes.byteLength!==record.indexCount*4||await digest(bytes)!==record.sha256)throw Error('阴影细节校验失败');
   const index=new Uint32Array(bytes);if(index.some(i=>i>=record.vertexCount))throw Error('阴影索引超出顶点范围');
   return [name,{...record,index:new BufferAttribute(index,1)}];
  })));
 }catch(error){onWarning?.(error.message);return new Map();}
}
// Only shadow indices change. The visible mesh, all attributes, materials,
// deformation uniforms, cloth solver and rigid hanger retain their full data.
export function createShadowDetail(body,records){
 const meshes=[];body.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.userData.cloth||!mesh.castShadow)return;
  const record=records?.get(mesh.name),full=mesh.geometry;
  if(!record||full.attributes.position.count!==record.vertexCount||full.index?.count!==record.fullIndexCount)return;
  let low=cache.get(full);if(!low){low=new BufferGeometry();for(const[name,attribute]of Object.entries(full.attributes))low.setAttribute(name,attribute);low.setIndex(record.index);low.boundingBox=full.boundingBox;low.boundingSphere=full.boundingSphere;cache.set(full,low);}
  meshes.push({mesh,full,low});
 });return meshes.length?{meshes,low:false}:null;
}
export function applyShadowDetail(garment,full){const d=garment.userData.shadowDetail;if(!d)return false;d.low=!full;return d.low;}
export function restoreShadowDetail(garments){let changed=false;for(const g of garments){changed||=Boolean(g.userData.shadowDetail?.low);applyShadowDetail(g,true);}return changed;}
export function installShadowDetailPass(renderer,garments){
 const before=renderer.shadowMap.render,details=garments.map(g=>g.userData.shadowDetail).filter(Boolean);
 renderer.shadowMap.render=function(...args){
  const originals=[];
  try{for(const d of details)if(d.low)for(const m of d.meshes){originals.push([m.mesh,m.mesh.geometry]);m.mesh.geometry=m.low;}return before.apply(this,args);}
  finally{for(const[mesh,geometry]of originals)mesh.geometry=geometry;}
 };
 return()=>{renderer.shadowMap.render=before;};
}
