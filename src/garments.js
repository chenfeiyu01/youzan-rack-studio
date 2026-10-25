import {createShadowDetail,loadShadowDetails} from './shadow-detail.js';
import * as THREE from 'three';
import {placeGarmentModel}from'./model-space.js';
import{repairClothShading}from'./cloth-shading.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makePrint } from './prints.js';
import { modelConfig } from './model-config.js';
import { cottonMaterial, createClothRig } from './cloth-material.js';
import { HangingMotion } from './physics.js';
import { preloadBrandAssets } from './brand-assets.js';
import { createSurfaceRig } from './surface-rig.js';
import { hangerWood,hangerMetal } from './hanger-materials.js';
import { preloadFabricTextures,fabricRepeat } from './fabric-textures.js';
import {collarRibCoordinates} from './collar-rib.js';
import {hemStitchCoordinates} from './hem-stitch.js';
import {HangerPlacement} from './hanger-placement.js';
import{createHangerSwivel}from'./hanger-swivel.js';
import {RACK_YAW} from './rack-layout.js';
import {fabricPreset} from './fabric-presets.js';
import {backgroundGeometry} from './draw-detail.js';
import {applyGarmentForm,garmentSimulation}from'./garment-form.js';
import{prepareFabricPattern}from'./fabric-pattern.js';

const templates = new Map(),simulations=new Map(),shadowDetails=new Map();
const collarCache=new WeakMap();
const hemCache=new WeakMap();
export async function preloadGarments(onWarning,items) {
  const loader = new GLTFLoader();
  await Promise.all([preloadBrandAssets(),preloadFabricTextures(items?.map(item=>item.fabric??'cotton')),...Object.entries(modelConfig).map(async ([type, config]) => {
    if (!config.url) return;
    try {
      const modelResponse=await fetch(import.meta.env.BASE_URL+config.url.replace(/^\//,''));
      if(!modelResponse.ok)throw new Error('服装模型加载失败');
      const modelBytes=await modelResponse.arrayBuffer(),asset=await loader.parseAsync(modelBytes,'');
      shadowDetails.set(type,await loadShadowDetails(type,modelBytes,onWarning));
      const response=await fetch(import.meta.env.BASE_URL+config.simulation.replace(/^\//,''));
      if(!response.ok)throw new Error('布料模拟数据加载失败');
      simulations.set(type,await response.json());
      templates.set(type, asset.scene);
    } catch (error) {
      onWarning?.(`${type}: ${error.message}`);
    }
  })]);
}

function tube(points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 32, radius, 7, false), material);
}

export function makeHanger() {
  const group = new THREE.Group();
  const wood = hangerWood();
  const metal = hangerMetal();
  group.add(tube([[-.65,.64,-.035],[-.39,.79,-.035],[0,.955,-.035],[.39,.79,-.035],[.65,.64,-.035]], .024, wood));
  group.add(tube([[-.65,.64,-.035],[-.47,.585,-.035],[.47,.585,-.035],[.65,.64,-.035]], .016, wood));
  group.add(tube([[0,.955,-.035],[0,1.33,-.035],[.08,1.40,-.035],[.10,1.51,-.035],[.05,1.57,-.035],[-.035,1.57,-.035],[-.09,1.52,-.035],[-.09,1.46,-.035]], .009, metal));
  group.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return group;
}

function makeProxy(item) {
  const long = item.type === 'longSleeve';
  const shape = new THREE.Shape();
  shape.moveTo(-.2,.98);
  shape.lineTo(-.5,.9);
  if (long) {
    shape.lineTo(-.74,.65); shape.lineTo(-.94,-1.43); shape.lineTo(-.7,-1.48); shape.lineTo(-.54,-.03);
  } else {
    shape.lineTo(-.97,.56); shape.lineTo(-.81,.17); shape.lineTo(-.56,.29);
  }
  shape.lineTo(-.58,-1.46); shape.quadraticCurveTo(0,-1.52,.58,-1.46);
  shape.lineTo(.56,long ? -.03 : .29);
  if (long) {
    shape.lineTo(.7,-1.48); shape.lineTo(.94,-1.43); shape.lineTo(.74,.65);
  } else {
    shape.lineTo(.81,.17); shape.lineTo(.97,.56);
  }
  shape.lineTo(.5,.9); shape.lineTo(.2,.98);
  shape.bezierCurveTo(.14,.79,-.14,.79,-.2,.98);
  const base = new THREE.ShapeGeometry(shape, 14).toNonIndexed();
  const verts = [];
  const uv = [];
  const a = base.getAttribute('position');
  function z(x,y,side) {
    const locked = THREE.MathUtils.smoothstep(.87-y,0,.65);
    const folds = Math.sin(x*17+y*.8)*.019 + Math.sin(x*31-y*1.8)*.009;
    return side * (.077 + .065*Math.max(0,1-(x/.65)**2) + folds*locked);
  }
  function push(p, side) {
    verts.push(p[0],p[1],z(p[0],p[1],side));
    uv.push((p[0]+1.2)/2.4,(p[1]+1.65)/2.85);
  }
  function split(p,q,r,side,level=0) {
    const dist=(v,w)=>Math.hypot(v[0]-w[0],v[1]-w[1]);
    if (level<6 && Math.max(dist(p,q),dist(q,r),dist(r,p))>.17) {
      const mid=(v,w)=>[(v[0]+w[0])/2,(v[1]+w[1])/2];
      const pq=mid(p,q),qr=mid(q,r),rp=mid(r,p);
      split(p,pq,rp,side,level+1); split(pq,q,qr,side,level+1);
      split(rp,qr,r,side,level+1); split(pq,qr,rp,side,level+1);
    } else {
      push(p,side); push(side===1?q:r,side); push(side===1?r:q,side);
    }
  }
  const group=new THREE.Group();
  for (const side of [1,-1]) {
    verts.length=0;uv.length=0;
    for(let i=0;i<a.count;i+=3) split([a.getX(i),a.getY(i)],[a.getX(i+1),a.getY(i+1)],[a.getX(i+2),a.getY(i+2)],side);
    let geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    const oldGeo=geo; geo=mergeVertices(geo,.0001); oldGeo.dispose();
    geo.computeVertexNormals();
    const mat=cottonMaterial('#ffffff');mat.map=makePrint(item,side<0);mat.side=THREE.FrontSide;
    const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;
    group.add(mesh);
  }
  const outline=shape.getPoints(48);
  const edge=[];
  for(let i=0;i<outline.length-1;i++) {
    const p=outline[i],q=outline[i+1];
    edge.push(p.x,p.y,z(p.x,p.y,1),q.x,q.y,z(q.x,q.y,1),q.x,q.y,z(q.x,q.y,-1),p.x,p.y,z(p.x,p.y,1),q.x,q.y,z(q.x,q.y,-1),p.x,p.y,z(p.x,p.y,-1));
  }
  const edgeGeo=new THREE.BufferGeometry();edgeGeo.setAttribute('position',new THREE.Float32BufferAttribute(edge,3));edgeGeo.computeVertexNormals();
  group.add(new THREE.Mesh(edgeGeo,new THREE.MeshStandardMaterial({color:item.color,roughness:.95,side:THREE.DoubleSide})));
  base.dispose();
  return group;
}

function makeImported(item, template, geometryCache) {
  const config=modelConfig[item.type];
  const model=clone(template);
  const outer=new THREE.Group();
  placeGarmentModel(model,config);
  let fabric=null;
  model.updateMatrixWorld(true);
  model.traverse(o=>{
    if(!o.isMesh) return;
    // Bake into one garment coordinate system so cloth and ink deform together.
    let prepared=geometryCache?.get(o.geometry);
    const geometryKey=item.id+':'+o.name+':'+o.matrixWorld.elements.join(',');
    let geometry=prepared?.get(geometryKey);
    if(!geometry){
      geometry=o.geometry.clone().applyMatrix4(o.matrixWorld);
      if(o.userData.sourcePrintRest){
        const rest=geometry.getAttribute('_cloth_print_rest'),front=geometry.getAttribute('_cloth_print_front');
        if(!rest||!front)throw new Error('缺少原布面印花坐标');
        geometry.setAttribute('sourcePrintRest',rest);geometry.setAttribute('sourcePrintFront',front);
        geometry.deleteAttribute('_cloth_print_rest');geometry.deleteAttribute('_cloth_print_front');
      }
      const delta=geometry.getAttribute('_cloth_delta');
      if(delta){const linear=new THREE.Matrix3().setFromMatrix4(o.matrixWorld),v=new THREE.Vector3();for(let i=0;i<delta.count;i++){v.fromBufferAttribute(delta,i).applyMatrix3(linear);delta.setXYZ(i,v.x,v.y,v.z);}geometry.deleteAttribute('_cloth_delta');geometry.setAttribute('clothDelta',delta);}
      if(item.type==='shortSleeve'&&o.name==='Fabric'&&!o.userData.sourceFabricMaps)repairClothShading(geometry);
    if(item.type==='shortSleeve'&&o.name==='Fabric'&&!o.userData.sourceFabricMaps){
      let coordinates=collarCache.get(o.geometry);
      if(!coordinates){coordinates=collarRibCoordinates(geometry);collarCache.set(o.geometry,coordinates);}
      geometry.setAttribute('collarRib',coordinates);
      let hem=hemCache.get(o.geometry);
      if(!hem){hem=hemStitchCoordinates(geometry);hemCache.set(o.geometry,hem);}
      geometry.setAttribute('hemStitch',hem);
    }
      if(config.colorMaterials.includes(o.name))applyGarmentForm(geometry,item.form,simulations.get(item.type));
      if(geometryCache){
        if(!prepared){prepared=new Map();geometryCache.set(o.geometry,prepared);}
        prepared.set(geometryKey,geometry);
      }
    }
    const original=Array.isArray(o.material)?o.material:[o.material];
    const materials=original.map(m=>{
      const isFabric=config.colorMaterials.includes(m.name);
      const family=item.fabric??'cotton';
      const mat=isFabric?cottonMaterial(item.color,item.motion,fabricRepeat(geometry,fabricPreset(family).patchMetres),family):m.name==='Hanger_Wood'?hangerWood():m.name==='Hanger_Metal'?hangerMetal():m.clone();
      mat.name=m.name;
      if(isFabric)prepareFabricPattern(mat,item.pattern);
      // Use the chosen scanned knit consistently. The imported photo normal
      // and AO contain crumpled folds and an old print baked into the fabric.
      if(isFabric&&geometry.hasAttribute('clothDelta'))mat.userData.clothExit=true;
      // Folded trim is several layers, not a single thin sheet.
      if(isFabric&&['Fabric_Trim','Hem_Stitching'].includes(o.name))delete mat.userData.clothTransmittance;
      if(isFabric&&geometry.hasAttribute('collarRib'))mat.userData.collarRib={value:1};
      if(isFabric&&geometry.hasAttribute('hemStitch'))mat.userData.hemStitch={value:1};
      return mat;
    });
    const mesh=new THREE.Mesh(geometry,Array.isArray(o.material)?materials:materials[0]);
    mesh.name=o.name;
    Object.assign(mesh.userData,o.userData);
    mesh.userData.castDetailShadow=o.name!=='Hem_Stitching';
    mesh.userData.cloth=original.some(m=>config.colorMaterials.includes(m.name));
    if(original.some(m=>m.name==='Fabric'))fabric=mesh;
    mesh.castShadow=mesh.userData.castDetailShadow;mesh.receiveShadow=o.name!=='Hem_Stitching';
    outer.add(mesh);
  });
  outer.updateMatrixWorld(true);
  if(fabric&&item.print) {
    const texture=makePrint(item,false,true);
    const width=item.printWidth??.94;
    const height=Math.min(1.3,width*texture.image.height/texture.image.width);
    const materials=Array.isArray(fabric.material)?fabric.material:[fabric.material];
    for(const material of materials){material.userData.ink=texture;material.userData.inkSize=new THREE.Vector2(width,height);material.userData.inkOffset=new THREE.Vector2(...(item.printOffset??[0,0]));}
    const inner=outer.getObjectByName('Fabric_Inner');
    if(inner){for(const material of(Array.isArray(inner.material)?inner.material:[inner.material])){material.userData.ink=texture;material.userData.inkSize=new THREE.Vector2(width,height);material.userData.inkOffset=new THREE.Vector2(...(item.printOffset??[0,0]));material.userData.inkAbsorptionOnly=true;}}
  }
  return outer;
}

export function createGarment(item, geometryCache) {
  const pivot=new THREE.Group();
  const content=new THREE.Group();
  const template=templates.get(item.type);
  const body=template?makeImported(item,template,geometryCache):makeProxy(item);
  if(!template)body.traverse(o=>{if(o.isMesh)o.userData.cloth=true;});
  const rig=simulations.has(item.type)?createSurfaceRig(garmentSimulation(simulations.get(item.type),item),item.motion,item.id,{flow:Boolean(template?.getObjectByName('Fabric')?.userData.deformationCage)}):createClothRig(item.type==='longSleeve',item.motion);
  const drawDetails=[];
  body.traverse(o=>{
    if(!o.isMesh||!o.userData.cloth)return;
    rig.bind(o);
    if(shadowDetails.get(item.type)?.has(o.name)){
      const full=o.geometry,low=backgroundGeometry(full,shadowDetails.get(item.type).get(o.name));
      if(low!==full)drawDetails.push({mesh:o,full,low});
    }
  });
  pivot.userData.drawDetails=drawDetails;
  pivot.userData.shadowDetail=createShadowDetail(body,shadowDetails.get(item.type));
  content.add(body);
  if(!template||!modelConfig[item.type].hasHanger)content.add(makeHanger());
  content.position.y=-1.58;
  pivot.add(content);
  pivot.userData.imported=Boolean(template);
  pivot.userData.rig=rig;
  pivot.userData.hangerPlacement=HangerPlacement.fromObject(pivot);
  pivot.userData.motion=new HangingMotion(0,RACK_YAW,item.type==='longSleeve',item.motion);
  pivot.userData.motion.y.snap(pivot.userData.hangerPlacement.restY);
  pivot.userData.swivel=createHangerSwivel(pivot,pivot.userData.motion);
  pivot.rotation.order='ZYX';
  pivot.userData.materials=[];
  pivot.traverse(o=>{
    if(o.isMesh) {
      const materials=Array.isArray(o.material)?o.material:[o.material];
      materials.forEach(m=>{pivot.userData.materials.push(m);});
    }
  });
  return pivot;
}
