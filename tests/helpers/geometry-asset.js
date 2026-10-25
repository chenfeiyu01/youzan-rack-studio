import{readFileSync}from'node:fs';
import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';

// Node geometry tests do not decode JPEGs. Geometry/accessor bytes and
// transforms stay identical; remove only texture references before parsing.
export async function loadGeometryAsset(url){
 const source=readFileSync(url),length=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+length));
 for(const material of json.materials??[]){
  for(const key of ['normalTexture','occlusionTexture','emissiveTexture'])delete material[key];
  for(const key of ['baseColorTexture','metallicRoughnessTexture'])if(material.pbrMetallicRoughness)delete material.pbrMetallicRoughness[key];
 }
 const text=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);
 const binary=source.subarray(20+length),out=Buffer.alloc(20+padded.length+binary.length);source.copy(out,0,0,12);out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded.length,12);out.writeUInt32LE(0x4e4f534a,16);padded.copy(out,20);binary.copy(out,20+padded.length);
 return new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),'');
}
