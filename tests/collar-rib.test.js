import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import * as T from 'three';
import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';
import{collarRibCoordinates}from'../src/collar-rib.js';
import{modelConfig}from'../src/model-config.js';

async function shirt(){
  const bytes=readFileSync(new URL('../public/models/short-sleeve.glb',import.meta.url));
  const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  asset.scene.updateMatrixWorld(true);const box=new T.Box3().setFromObject(asset.scene),center=box.getCenter(new T.Vector3()),scale=modelConfig.shortSleeve.height/box.getSize(new T.Vector3()).y;
  let g;asset.scene.traverse(o=>{if(o.isMesh&&o.name==='Fabric')g=o.geometry.clone().applyMatrix4(o.matrixWorld);});
  g.scale(scale,scale,scale);g.translate(-center.x*scale,modelConfig.shortSleeve.top-box.max.y*scale,-center.z*scale);return g;
}
test('neckband coordinates cover the collar, leaving body, sleeve and source geometry intact',async()=>{
  const g=await shirt(),before=Object.fromEntries(Object.entries(g.attributes).map(([name,a])=>[name,a.array.slice()])),index=g.index.array.slice(),rib=collarRibCoordinates(g),p=g.attributes.position;
  const nearest=point=>{let best=Infinity,id=-1;for(let i=0;i<p.count;i++){const d=Math.hypot(p.getX(i)-point[0],p.getY(i)-point[1],p.getZ(i)-point[2]);if(d<best){best=d;id=i;}}return id;};
  for(const point of[[0,.735,.163],[0,.96,-.10]])assert.equal(rib.getY(nearest(point)),1,'collar '+point);
  for(const point of[[0,.5,.21],[.5,.85,.04],[0,-1.45,.17],[.9,.06,.02]])assert.equal(rib.getY(nearest(point)),0,'body '+point);
  assert.ok(Array.from(rib.array).every(Number.isFinite));
  for(const[name,values]of Object.entries(before))assert.deepEqual(g.attributes[name].array,values,name);
  assert.deepEqual(g.index.array,index);g.dispose();
});
test('duplicate neckband vertices retain the same rib phase across shading and UV seams',async()=>{
  const g=await shirt(),rib=collarRibCoordinates(g),p=g.attributes.position,groups=new Map();let checked=0;
  for(let i=0;i<p.count;i++){
    if(!rib.getY(i))continue;const key=[p.getX(i),p.getY(i),p.getZ(i)].join(':');
    if(groups.has(key)){const a=groups.get(key)*Math.PI*2,b=rib.getX(i)*Math.PI*2;assert.ok(Math.abs(Math.sin(a)-Math.sin(b))<.0002);assert.ok(Math.abs(Math.cos(a)-Math.cos(b))<.0002);checked++;}else groups.set(key,rib.getX(i));
  }
  assert.ok(checked>100,'actual neckband seam duplicates were exercised');g.dispose();
});
