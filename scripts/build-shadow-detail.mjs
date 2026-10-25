import{readFileSync,writeFileSync,mkdirSync}from'node:fs';
import{createHash}from'node:crypto';
import{loadGeometryAsset}from'../tests/helpers/geometry-asset.js';
import{placeGarmentModel}from'../src/model-space.js';
import{modelConfig}from'../src/model-config.js';
import{MeshoptSimplifier}from'./vendor/meshopt_simplifier.mjs';
await MeshoptSimplifier.ready;
const hash=b=>createHash('sha256').update(b).digest('hex'),root=new URL('../',import.meta.url),out=new URL('public/models/shadow-detail/',root);mkdirSync(out,{recursive:true});const manifest={version:1,models:{}};
for(const[type,config]of Object.entries(modelConfig)){
 const url=new URL('public'+config.url,root),asset=await loadGeometryAsset(url);placeGarmentModel(asset.scene,config);
 const model={sha256:hash(readFileSync(url)),meshes:{}};
 for(const name of ['Fabric','Fabric_Inner']){
  const mesh=asset.scene.getObjectByName(name);if(!mesh)continue;
  const g=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),P=g.attributes.position.array,N=g.attributes.normal.array,U=g.attributes.uv.array,C=g.attributes.color,n=g.attributes.position.count,input=Uint32Array.from(g.index.array),A=new Float32Array(n*6),locks=new Uint8Array(n),keys=Array.from({length:n},(_,i)=>[P[i*3],P[i*3+1],P[i*3+2]].join(':')),edges=new Map();
  for(let j=0;j<input.length;j+=3)for(let k=0;k<3;k++){const a=keys[input[j+k]],b=keys[input[j+(k+1)%3]];if(a===b)continue;const key=a<b?a+'|'+b:b+'|'+a;const v=edges.get(key)??[0,0];v[0]++;v[1]+=a<b?1:-1;edges.set(key,v);}
  const protectedPoints=new Set();for(const[key,[count,orientation]]of edges)if(count!==2||orientation!==0)for(const p of key.split('|'))protectedPoints.add(p);
  const neighbors=new Map();for(let j=0;j<input.length;j+=3)for(let k=0;k<3;k++){const a=keys[input[j+k]],b=keys[input[j+(k+1)%3]];if(!neighbors.has(a))neighbors.set(a,new Set());neighbors.get(a).add(b);}
  for(let ring=0;ring<2;ring++)for(const key of [...protectedPoints])for(const other of neighbors.get(key)??[])protectedPoints.add(other);
  let locked=0;for(let i=0;i<n;i++){
   const p=Array.from(P.subarray(i*3,i*3+3)),q=p.map((v,k)=>(v-[-1.35,-2,-.65][k])/([2.7/15,2.55/23,1.3/7][k]));
   // Cell interfaces, real material boundaries and load-bearing top are exact.
   const plane=[q[0],q[1],q[2],q[0]-q[1],q[0]-q[2],q[1]-q[2]].some(v=>Math.abs(v-Math.round(v))<2e-5);
   locks[i]=p[1]>=.55||protectedPoints.has(keys[i])?1:0;locked+=locks[i];
   A.set([N[i*3],N[i*3+1],N[i*3+2],U[i*2],U[i*2+1],C?.getX(i)??1],i*6);
  }
  function edgeMap(ids){const out=new Map();for(let j=0;j<ids.length;j+=3)for(let k=0;k<3;k++){const a=keys[ids[j+k]],b=keys[ids[j+(k+1)%3]];if(a===b)continue;const key=a<b?a+'|'+b:b+'|'+a,v=out.get(key)??[0,0];v[0]++;v[1]+=a<b?1:-1;out.set(key,v);}return out;}
  const abnormal=m=>new Map([...m].filter(([,v])=>v[0]!==2||v[1]!==0)),expected=abnormal(edges),passes=[];
  let index,error;
  for(;;){
   [index,error]=MeshoptSimplifier.simplifyWithAttributes(input,P,3,A,6,[.002,.002,.002,0,0,0],locks,Math.floor(input.length*.2/3)*3,.0008,['LockBorder','ErrorAbsolute','Sparse']);
   const actual=abnormal(edgeMap(index)),bad=new Set();
   for(const key of new Set([...expected.keys(),...actual.keys()]))if(JSON.stringify(expected.get(key))!==JSON.stringify(actual.get(key)))key.split('|').forEach(k=>bad.add(k));
   passes.push({faces:index.length/3,badPoints:bad.size});if(!bad.size)break;
   for(let ring=0;ring<2;ring++)for(const key of [...bad])for(const other of neighbors.get(key)??[])bad.add(other);
   let added=0;for(let i=0;i<n;i++)if(bad.has(keys[i])&&!locks[i]){locks[i]=1;added++;}
   passes.at(-1).addedLocks=added;
   if(!added){index=input;error=0;passes.at(-1).fallback='full source indices';break;}
  }

  const file=type+'-'+name.toLowerCase()+'-lod.bin';writeFileSync(new URL(file,out),Buffer.from(index.buffer,index.byteOffset,index.byteLength));
  model.meshes[name]={file,vertexCount:n,fullIndexCount:input.length,indexCount:index.length,sha256:hash(Buffer.from(index.buffer,index.byteOffset,index.byteLength)),error,locked,passes};console.log(type,name,model.meshes[name]);
 }
 manifest.models[type]=model;
}
writeFileSync(new URL('manifest.json',out),JSON.stringify(manifest,null,2));
