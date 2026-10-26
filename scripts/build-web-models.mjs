import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {MeshoptSimplifier} from './vendor/meshopt_simplifier.mjs';
await MeshoptSimplifier.ready;
const root=new URL('../public/models/',import.meta.url),types={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},ctors={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array};
const hash=b=>createHash('sha256').update(b).digest('hex');
function read(name){
 const bytes=readFileSync(new URL(name,root)),size=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+size)),bin=bytes.subarray(28+size);
 const arrays=json.accessors.map(a=>{const v=json.bufferViews[a.bufferView],Ctor=ctors[a.componentType],width=types[a.type];if(!Ctor||!width||a.sparse||v.byteStride)throw Error('Unsupported accessor');const start=(v.byteOffset??0)+(a.byteOffset??0);return new Ctor(bin.buffer.slice(bin.byteOffset+start,bin.byteOffset+start+a.count*width*Ctor.BYTES_PER_ELEMENT));});
 return {json,arrays,bytes};
}
function edges(indices,keys){const map=new Map();for(let i=0;i<indices.length;i+=3)for(let j=0;j<3;j++){const a=keys[indices[i+j]],b=keys[indices[i+(j+1)%3]];if(a===b)continue;const k=a<b?a+'|'+b:b+'|'+a,v=map.get(k)??[0,0];v[0]++;v[1]+=a<b?1:-1;map.set(k,v);}return new Map([...map].filter(([,v])=>v[0]!==2||v[1]!==0));}
const report={version:1,models:{}};
for(const [input,output]of[['short-sleeve-clean.glb','short-sleeve-web.glb'],['hanging-long-sleeve.glb','hanging-long-sleeve-web.glb']]){
 const {json:g,arrays,bytes}=read(input),accessors=g.accessors,gout=structuredClone(g),chunks=[],views=[],outAccessors=[];let offset=0;
 const model={source:input,sourceSha256:hash(bytes),meshes:[]};
 function add(array,old,indices=false){
  const data=Buffer.from(array.buffer,array.byteOffset,array.byteLength),view=views.length;views.push({buffer:0,byteOffset:offset,byteLength:data.length,target:indices?34963:34962});chunks.push(data);offset+=data.length;const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
  const a={bufferView:view,componentType:array instanceof Uint16Array?5123:array instanceof Uint32Array?5125:old.componentType,count:array.length/types[old.type],type:old.type};if(old.normalized)a.normalized=true;
  if(old.min||old.max){const width=types[old.type];a.min=Array(width).fill(Infinity);a.max=Array(width).fill(-Infinity);for(let i=0;i<array.length;i++){const k=i%width;a.min[k]=Math.min(a.min[k],array[i]);a.max[k]=Math.max(a.max[k],array[i]);}}
  return outAccessors.push(a)-1;
 }
 for(let mi=0;mi<g.meshes.length;mi++)for(let pi=0;pi<g.meshes[mi].primitives.length;pi++){
  const mesh=g.meshes[mi],p=mesh.primitives[pi],q=gout.meshes[mi].primitives[pi],P=arrays[p.attributes.POSITION],N=arrays[p.attributes.NORMAL],UV=arrays[p.attributes.TEXCOORD_0],inputIndices=Uint32Array.from(arrays[p.indices]),count=P.length/3;
  let result=inputIndices,error=0,locked=0,passes=0;
  if(['Fabric','Fabric_Inner'].includes(mesh.name)){
   const keys=Array.from({length:count},(_,i)=>`${P[i*3]}:${P[i*3+1]}:${P[i*3+2]}`),expected=edges(inputIndices,keys),protectedKeys=new Set([...expected.keys()].flatMap(k=>k.split('|'))),neighbors=new Map();
   for(let i=0;i<inputIndices.length;i+=3)for(let j=0;j<3;j++){const a=keys[inputIndices[i+j]],b=keys[inputIndices[i+(j+1)%3]];if(!neighbors.has(a))neighbors.set(a,new Set());neighbors.get(a).add(b);}
   // Keep the matching inner/outer chest patch intact: independently reduced
   // skins can cross during deformation and hide the material-printed logo.
   // Bounds include both current left-chest prints and their form variation.
   if(input.startsWith('hanging'))for(let i=0;i<count;i++){
    const x=P[i*3],y=P[i*3+1];
    if(x>=.08&&x<=.56&&y>=.04&&y<=.52)protectedKeys.add(keys[i]);
   }
   for(const k of [...protectedKeys])for(const other of neighbors.get(k)??[])protectedKeys.add(other);
   const locks=new Uint8Array(count),attr=new Float32Array(count*5);
   for(let i=0;i<count;i++){locks[i]=P[i*3+1]>=.55||protectedKeys.has(keys[i])?1:0;attr.set([N[i*3],N[i*3+1],N[i*3+2],UV[i*2],UV[i*2+1]],i*5);}
   const target=mesh.name==='Fabric_Inner'?18000:input.startsWith('short')?22000:30000;
   for(;;){
    [result,error]=MeshoptSimplifier.simplifyWithAttributes(inputIndices,P,3,attr,5,[.01,.01,.01,.003,.003],locks,target*3,.003,['LockBorder','ErrorAbsolute','Sparse']);passes++;
    const actual=edges(result,keys),bad=new Set();for(const k of new Set([...expected.keys(),...actual.keys()]))if(JSON.stringify(expected.get(k))!==JSON.stringify(actual.get(k)))k.split('|').forEach(v=>bad.add(v));
    if(!bad.size)break;
    for(const k of [...bad])for(const other of neighbors.get(k)??[])bad.add(other);
    let added=0;for(let i=0;i<count;i++)if(bad.has(keys[i])&&!locks[i]){locks[i]=1;added++;}
    if(!added)throw Error('Cannot preserve garment topology: '+mesh.name);
   }
   locked=locks.reduce((a,b)=>a+b,0);
  }
  // Compact every attribute with the same remap, including cloth thickness and
  // authored shading/UV data. The physical surface solver is a separate asset.
  const ids=[...new Set(result)],remap=new Map(ids.map((id,i)=>[id,i]));
  for(const[key,id]of Object.entries(p.attributes)){const old=accessors[id],source=arrays[id],width=types[old.type],out=new source.constructor(ids.length*width);ids.forEach((v,i)=>out.set(source.subarray(v*width,(v+1)*width),i*width));q.attributes[key]=add(out,old);}
  const compact=ids.length<=65535?Uint16Array.from(result,id=>remap.get(id)):Uint32Array.from(result,id=>remap.get(id));q.indices=add(compact,accessors[p.indices],true);
  model.meshes.push({name:mesh.name,sourceVertices:count,vertices:ids.length,sourceTriangles:inputIndices.length/3,triangles:result.length/3,error,locked,passes});
 }
 const bin=Buffer.concat(chunks);gout.accessors=outAccessors;gout.bufferViews=views;gout.buffers=[{byteLength:bin.length}];
 const text=Buffer.from(JSON.stringify(gout)),json=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(json);const out=Buffer.alloc(28+json.length+bin.length);out.writeUInt32LE(0x46546c67);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(json.length,12);out.writeUInt32LE(0x4e4f534a,16);json.copy(out,20);out.writeUInt32LE(bin.length,20+json.length);out.writeUInt32LE(0x004e4942,24+json.length);bin.copy(out,28+json.length);
 writeFileSync(new URL(output,root),out);Object.assign(model,{bytes:out.length,gzipBytes:gzipSync(out,{level:9}).length,sha256:hash(out)});report.models[output]=model;console.log(output,JSON.stringify(model));
}
writeFileSync(new URL('web-models-manifest.json',root),JSON.stringify(report,null,2)+'\n');
