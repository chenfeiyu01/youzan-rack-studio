import{readFileSync,writeFileSync}from'node:fs';
import*as THREE from'three';
import{repairClothShading}from'../src/cloth-shading.js';

// The previous asset retained its pre-collapse garment coordinates. Recover
// that actual cut surface, not the crumpled frame baked by its old simulation.
const root=new URL('../public/models/',import.meta.url),source=readFileSync(new URL('short-sleeve-gravity.glb',root)),jsonLength=source.readUInt32LE(12),gltf=JSON.parse(source.subarray(20,20+jsonLength)),binary=source.subarray(28+jsonLength);
const types={5126:Float32Array,5125:Uint32Array,5123:Uint16Array},sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function accessor(index){const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView],Type=types[a.componentType],start=binary.byteOffset+(v.byteOffset??0)+(a.byteOffset??0);if(v.byteStride)throw new Error('Interleaved source is not supported');return new Type(binary.buffer,start,a.count*sizes[a.type]);}
const primitive=gltf.meshes[0].primitives[0],old=accessor(primitive.attributes.POSITION),clean=accessor(primitive.attributes._CLOTH_PRINT_REST),uv=accessor(primitive.attributes.TEXCOORD_0),indices=accessor(primitive.indices);
if(!clean||clean.length!==old.length)throw new Error('Missing original garment surface');
const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(clean.slice(),3));geometry.setAttribute('uv',new THREE.BufferAttribute(uv.slice(),2));geometry.setIndex(new THREE.BufferAttribute(indices.slice(),1));geometry.computeVertexNormals();repairClothShading(geometry);

// Pull the complete existing simulation mesh back through the same surface.
// Closest triangle barycentrics retain smooth positions instead of snapping
// several proxy particles to one display vertex. Orientation keeps opposite
// cloth walls separate in the old collapsed surface.
const data=JSON.parse(readFileSync(new URL('short-sleeve-gravity-simulation.json',root))),p=data.positions,t=data.triangles,normal=new Float64Array(p.length);
for(let f=0;f<t.length;f+=3){const a=t[f]*3,b=t[f+1]*3,c=t[f+2]*3,ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2],n=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];for(const id of[a,b,c])for(let k=0;k<3;k++)normal[id+k]+=n[k];}
for(let i=0;i<normal.length;i+=3){const l=Math.hypot(normal[i],normal[i+1],normal[i+2])||1;for(let k=0;k<3;k++)normal[i+k]/=l;}
const cell=.06,buckets=new Map(),key=(x,y,z)=>x+','+y+','+z;
for(let f=0;f<indices.length;f+=3){const a=indices[f]*3,b=indices[f+1]*3,c=indices[f+2]*3,lo=[],hi=[];for(let k=0;k<3;k++){lo[k]=Math.floor(Math.min(old[a+k],old[b+k],old[c+k])/cell);hi[k]=Math.floor(Math.max(old[a+k],old[b+k],old[c+k])/cell);}for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++){const k=key(x,y,z);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(f);}}
const tri=new THREE.Triangle(),q=new THREE.Vector3(),closest=new THREE.Vector3(),bary=new THREE.Vector3(),n=new THREE.Vector3(),positions=[],matches=[];
for(let node=0;node<p.length/3;node++){
 const i=node*3;q.fromArray(p,i);const base=[Math.floor(q.x/cell),Math.floor(q.y/cell),Math.floor(q.z/cell)],seen=new Set();let best=Infinity,bestFace=-1,bestBary=null;
 for(let z=-1;z<=1;z++)for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)for(const f of buckets.get(key(base[0]+x,base[1]+y,base[2]+z))??[]){
  if(seen.has(f))continue;seen.add(f);tri.a.fromArray(old,indices[f]*3);tri.b.fromArray(old,indices[f+1]*3);tri.c.fromArray(old,indices[f+2]*3);tri.getNormal(n);const alignment=n.x*normal[i]+n.y*normal[i+1]+n.z*normal[i+2];if(alignment<.05)continue;
  tri.closestPointToPoint(q,closest);const distance=q.distanceToSquared(closest),score=distance*(1+.15*(1-alignment));if(score>=best)continue;tri.getBarycoord(closest,bary);best=score;bestFace=f;bestBary=bary.toArray();
 }
 if(bestFace<0||best>.0064)throw new Error('Unable to recover proxy node '+node);
 const out=[0,0,0];for(let j=0;j<3;j++)for(let k=0;k<3;k++)out[k]+=clean[indices[bestFace+j]*3+k]*bestBary[j];positions.push(...out);matches.push(Math.sqrt(best));
}
// Re-evaluate warp directions on the recovered panels; neither particle count
// nor triangle topology nor the full XPBD constraint passes are reduced.
const grain=[];
for(let f=0;f<t.length;f+=3){const a=t[f]*3,b=t[f+1]*3,c=t[f+2]*3;tri.a.fromArray(positions,a);tri.b.fromArray(positions,b);tri.c.fromArray(positions,c);tri.getNormal(n);q.set(0,1,0).addScaledVector(n,-n.y);if(q.lengthSq()<1e-8)q.set(1,0,0).addScaledVector(n,-n.x);q.normalize();grain.push(q.x,q.y,q.z,1);}
writeFileSync(new URL('short-sleeve-clean-simulation.json',root),JSON.stringify({...data,positions,grain,restSurface:'clean-pattern'}));

const chunks=[],views=[],accessors=[];let offset=0;
function add(array,type,componentType){const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength),view=views.length;views.push({buffer:0,byteOffset:offset,byteLength:bytes.length});chunks.push(bytes);offset+=bytes.length;const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}const a={bufferView:view,componentType,count:array.length/sizes[type],type};if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<array.length;i++)a.min[i%3]=Math.min(a.min[i%3],array[i]),a.max[i%3]=Math.max(a.max[i%3],array[i]);}accessors.push(a);return accessors.length-1;}
const attributes={POSITION:add(geometry.attributes.position.array,'VEC3',5126),NORMAL:add(geometry.attributes.normal.array,'VEC3',5126),TEXCOORD_0:add(geometry.attributes.uv.array,'VEC2',5126)},index=add(indices,'SCALAR',indices instanceof Uint32Array?5125:5123);
const output={asset:{version:'2.0',generator:'Rack Studio recovered clean garment surface'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'Fabric',mesh:0,extras:{rackCoordinates:'normalized',deformationCage:gltf.nodes.find(n=>n.mesh===0)?.extras?.deformationCage}}],meshes:[{name:'Fabric',primitives:[{attributes,indices:index,material:0}]}],materials:[{name:'Fabric',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:.95},doubleSided:true}],buffers:[{byteLength:offset}],bufferViews:views,accessors};
const text=Buffer.from(JSON.stringify(output)),json=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(json);const body=Buffer.concat(chunks),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+body.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(body.length,0);binHeader.writeUInt32LE(0x004e4942,4);writeFileSync(new URL('short-sleeve-clean.glb',root),Buffer.concat([header,json,binHeader,body]));
console.log(JSON.stringify({vertices:clean.length/3,triangles:indices.length/3,physicsParticles:positions.length/3,physicsTriangles:t.length/3,maxRecoveryDistance:Math.max(...matches),assetBytes:28+json.length+body.length}));
