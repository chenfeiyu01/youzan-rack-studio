import{patches}from'./helpers/shirt-revision.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createSurfaceRig} from '../src/surface-rig.js';
import {createFlowReference} from '../src/surface-flow-grid.js';
import {HangingMotion} from '../src/physics.js';
import {catalog} from '../src/catalog.js';

function intersect(a,b){
  const ray=new THREE.Ray(),direction=new THREE.Vector3(),hit=new THREE.Vector3();
  for(const [triangle,other] of [[a,b],[b,a]])for(let i=0;i<3;i++){
    direction.subVectors(other[(i+1)%3],other[i]);const length=direction.length();
    if(length<1e-8)continue;
    ray.set(other[i],direction.divideScalar(length));
    if(ray.intersectTriangle(...triangle,false,hit)){
      const distance=hit.distanceTo(other[i]);
      if(distance>1e-6&&distance<length-1e-6)return true;
    }
  }
  return false;
}

test('rendered sleeve walls remain separate at the known interrupted-turn regression',async()=>{
  const bytes=readFileSync(new URL('../public/models/short-sleeve.glb',import.meta.url));
  const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  asset.scene.updateMatrixWorld(true);let mesh;
  asset.scene.traverse(o=>{if(o.isMesh&&o.name==='Fabric')mesh=o;});
  const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  const box=new THREE.Box3().setFromObject(asset.scene),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),scale=2.48/size.y;
  geometry.scale(scale,scale,scale);geometry.translate(-center.x*scale,.98-box.max.y*scale,-center.z*scale);
  const positions=geometry.attributes.position,index=geometry.index;
  // Original corner records remain, but each source face is now split along
  // deformation cells. Exercise the actual rendered fragments, with an area
  // coverage check so deleting the source patch cannot make this test pass.
  const cases=[
    {name:'right sleeve',frame:15,vertices:[[5332,5235,5236],[17229,17230,17325]],region:p=>p.x>.7&&p.x<.82&&p.y>-.16&&p.y<-.05},
    {name:'rebuilt left underarm seam',frame:35,rebuilt:true,vertices:[[2504,2198,2273],[2057,2084,2454]],region:p=>p.x>-.7&&p.x<-.6&&p.y>.08&&p.y<.11},
  ];
  const faces=Array.from({length:index.count/3},(_,f)=>[0,1,2].map(k=>index.getX(f*3+k)));
  for(const sample of cases){
    const source=sample.vertices.map(ids=>ids.map(i=>new THREE.Vector3().fromBufferAttribute(positions,i)));
    for(const triangle of source)for(const point of triangle)assert.ok(sample.region(point),sample.name);
    if(sample.rebuilt){
      // This junction is intentionally rebuilt. Exercise its actual inner/outer
      // loft, with original-region coverage witnesses instead of requiring the
      // deleted overlapping source triangles to remain on their old planes.
      const bounds=new THREE.Box3().setFromPoints(source.flat()).expandByScalar(.02);
      sample.rest=[1,-1].map(kind=>faces.flatMap((ids,f)=>{
        if(patches[f]!==kind)return[];
        const P=ids.map(i=>new THREE.Vector3().fromBufferAttribute(positions,i));
        return bounds.intersectsBox(new THREE.Box3().setFromPoints(P))?[P]:[];
      }));
      for(const wall of sample.rest){
        assert.ok(wall.length>10,'both rebuilt sleeve walls must cover the regression region');
        assert.ok(wall.reduce((sum,P)=>sum+new THREE.Triangle(...P).getArea(),0)>.0001,'replacement coverage cannot be made empty');
        for(const triangle of source)for(let a=1;a<=3;a++)for(let b=1;b<=3-a;b++){
          const p=triangle[0].clone().multiplyScalar(a/4).addScaledVector(triangle[1],b/4).addScaledVector(triangle[2],1-(a+b)/4);
          const distance=Math.min(...wall.map(P=>new THREE.Triangle(...P).closestPointToPoint(p,new THREE.Vector3()).distanceTo(p)));
          assert.ok(distance<.012,'both actual replacement skins stay near the original physical witness');
        }
      }
    }else sample.rest=source.map(points=>{
      const triangle=new THREE.Triangle(...points),plane=triangle.getPlane(new THREE.Plane()),bary=new THREE.Vector3();
      const contains=p=>{triangle.getBarycoord(p,bary);return Math.abs(plane.distanceToPoint(p))<2e-7&&Math.min(bary.x,bary.y,bary.z)>-2e-5;};
      const fragments=faces.map(ids=>ids.map(i=>new THREE.Vector3().fromBufferAttribute(positions,i))).filter(t=>t.every(contains));
      const area=fragments.reduce((s,t)=>s+new THREE.Triangle(...t).getArea(),0);
      assert.ok(fragments.length>0,'the known source patch must still exist');
      assert.ok(Math.abs(area-triangle.getArea())<Math.max(2e-8,triangle.getArea()*.0001),'subdivision must cover the complete source patch');
      return fragments;
    });
    for(const a of sample.rest[0])for(const b of sample.rest[1])assert.equal(intersect(a,b),false,'the source patches must start separated');
  }
  const data=JSON.parse(readFileSync(new URL('../public/models/short-sleeve-simulation.json',import.meta.url)));
  const flow=createFlowReference(data);
  for(const preset of [6,7])for(const sample of cases){
    const item=catalog[preset],rig=createSurfaceRig(data,item.motion,'sleeve-regression',{flow:true}),motion=new HangingMotion(0,0,false,item.motion);
    for(let frame=0;frame<=sample.frame;frame++){
      motion.step(0,.35,frame>=10?Math.PI:0,1/60,false,1.94);
      rig.update(1/60,{x:motion.x.value,y:motion.y.value,z:motion.z.value,yaw:motion.yaw.value,roll:motion.roll.value,pitch:motion.pitch.value},false);rig.sync();
    }
    flow.update(rig.texture.image.data);
    const rendered=sample.rest.map(fragments=>fragments.map(triangle=>triangle.map(point=>point.clone().add(new THREE.Vector3(...flow.sample(point.x,point.y,point.z))))));
    rig.dispose();
    for(const a of rendered[0])for(const b of rendered[1])assert.equal(intersect(a,b),false,`${item.id} ${sample.name}: actual rendered fragments must preserve this clearance`);
  }
  geometry.dispose();
});
