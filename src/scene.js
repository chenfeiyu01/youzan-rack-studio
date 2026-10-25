import {applyShadowDetail,restoreShadowDetail,installShadowDetailPass} from './shadow-detail.js';
import * as THREE from 'three';
import { studioEnvironment } from './studio-environment.js';
import { createGarment, preloadGarments } from './garments.js';
import { makeStudio } from './studio-set.js';
import { GarmentContacts } from './garment-contacts.js';
import { rackClearanceYaw } from './rack-clearance.js';
import { FocusTransition } from './focus-transition.js';
import {createOpaqueDepthPass} from './opaque-depth-pass.js';
import { createStudioShadowFraming } from './studio-shadow.js';
import { garmentRackX,rackCameraX,garmentFocusPose,frameInspectionCamera } from './rack-layout.js';
import { RackPresentation,presentationYaw } from './rack-presentation.js';
import {RAIL} from './hanger-placement.js';
import {MAX_INSPECTION_SCALE} from './rack-layout.js';
import {applyStudioAreaVisibility} from './studio-area-visibility.js';
import {applyStudioAreaLight} from './studio-area-light.js';
import {applyStudioDirectionalVisibility} from './studio-directional-shadow.js';
import {configureStudioDepthPlanes} from './studio-depth-planes.js';
import {requiresFullDetail,applyDrawDetail} from './draw-detail.js';

const damp = (a,b,rate,dt) => THREE.MathUtils.lerp(a,b,1-Math.exp(-rate*dt));

export function makeRail(scene) {
  const group = new THREE.Group();
  const chrome = new THREE.MeshStandardMaterial({color:'#c0c2bf',metalness:1,roughness:.21,envMapIntensity:1.4});
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(RAIL.radius,RAIL.radius,RAIL.length,28),chrome);
  rod.rotation.z=Math.PI/2;rod.position.y=RAIL.height;rod.castShadow=true;
  group.add(rod);
  for(const x of [-4.58,4.58]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(.13,.29,.055),chrome);
    plate.position.set(x,1.57,-.34);plate.castShadow=true;group.add(plate);
    const mount=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.35,12),chrome);
    mount.rotation.x=Math.PI/2;mount.position.set(x,1.57,-.17);group.add(mount);
    for(const y of [1.47,1.67]) {
      const screw=new THREE.Mesh(new THREE.SphereGeometry(.015,8,6),chrome);
      screw.scale.z=.3;screw.position.set(x,y,-.305);group.add(screw);
    }
  }
  scene.add(group);
  return group;
}

export async function createRackScene(canvas, items, callbacks) {
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=.90;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.BasicShadowMap;
  const scene=new THREE.Scene();
  const camera=new THREE.OrthographicCamera(-6,6,3.25,-3.25,.1,30);
  camera.position.set(0,.05,12);camera.lookAt(0,.05,0);
  const env=studioEnvironment(renderer);
  scene.environment=env.texture;
  const studio=makeStudio(scene);
  const rail=makeRail(scene);
  await preloadGarments(callbacks.onWarning,items);
  const geometryCache=new WeakMap();
  const garments=items.map((item,i)=>{
    const mesh=createGarment(item,geometryCache);
    mesh.position.set(garmentRackX(i,items.length),mesh.userData.hangerPlacement.restY,0);
    mesh.rotation.y=-1.43;
    mesh.userData.inspectionZoom=1;
    mesh.userData.motion.x.snap(mesh.position.x);
    scene.add(mesh);
    return mesh;
  });
  const garmentContacts=new GarmentContacts();
  const depthPlanes=configureStudioDepthPlanes(studio,scene,renderer,{secondary:true});
  const disposeShadowDetailPass=installShadowDetailPass(renderer,garments);
  canvas.dataset.shadowEncoding=depthPlanes?'caster-depth-planes':'packed-depth';
  scene.traverse(object=>{if(object.isMesh)for(const material of(Array.isArray(object.material)?object.material:[object.material])){applyStudioAreaLight(material);applyStudioAreaVisibility(material,studio.key.shadow);applyStudioDirectionalVisibility(material,studio.secondaryLights);}});
  const motions=garments.map(g=>g.userData.motion);
  const depthPass=createOpaqueDepthPass(renderer);
  const transition=new FocusTransition(renderer,(scene,camera)=>depthPass.render(scene,camera));
  let state={active:6,hovered:null,mode:'rack',turned:false};
  const presentation=new RackPresentation(state.active);
  // This hook runs before each shadow pass, after FocusTransition has chosen
  // the capture's visibility. The rack capture must retain the entire rack.
  scene.onBeforeRender=createStudioShadowFraming(studio.key,rail,()=>garments[presentation.owner],studio.secondaryLights);
  let focus=0,width=1,height=1,mobile=false,frame=0,disposed=false,lastTime=performance.now(),paused=false,accumulator=0,panX=0;
  let lastInteraction=performance.now();
  let touchX=0,down=null,dragging=false,hover=-1;
  const pointer=new THREE.Vector2();
  const raycaster=new THREE.Raycaster();
  const plane=new THREE.Plane(new THREE.Vector3(0,0,1),0);
  const point=new THREE.Vector3();
  const projected=new THREE.Vector3();
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  function wake() {
    if(disposed)return;
    canvas.dataset.sleeping='false';
    lastInteraction=performance.now();
    if(!frame&&!paused){lastTime=lastInteraction;accumulator=0;frame=requestAnimationFrame(render);}
  }
  function resize() {
    const box=canvas.getBoundingClientRect();width=box.width;height=box.height;
    mobile=width<700;
    const viewHeight=mobile?7.2:6.65;
    camera.left=-viewHeight*width/height/2;camera.right=-camera.left;
    camera.top=viewHeight/2;camera.bottom=-viewHeight/2;camera.updateProjectionMatrix();
    panX=rackCameraX(garments[presentation.viewIndex(state.active,focus)].position.x,focus,mobile);
    frameInspectionCamera(camera,garments[presentation.owner],panX,garments[presentation.owner].userData.inspectionZoom);
    renderer.setSize(width,height,false);
    wake();
  }
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);
  resize();

  function hit(event) {
    const rect=canvas.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    if(!raycaster.ray.intersectPlane(plane,point)||point.y>1.6||point.y< -1.7) return -1;
    const hits=garments.map((g,i)=>({index:i,distance:Math.abs(point.x-g.position.x),range:state.hovered===i?1.34:.43})).filter(v=>v.distance<v.range);
    hits.sort((a,b)=>a.distance-b.distance);
    return hits[0]?.index??-1;
  }
  function pointermove(event) {
    if(down&&event.pointerType!=='mouse') {
      touchX=event.clientX-down.x;
      if(Math.abs(touchX)>9) dragging=true;
      return;
    }
    if(state.mode==='focus') {canvas.style.cursor='grab';return;}
    const index=hit(event);
    canvas.style.cursor=index<0?'default':'pointer';
    if(index!==hover) {hover=index;callbacks.onHover(index<0?null:index);}
  }
  function pointerdown(event) {
    wake();
    down={x:event.clientX,y:event.clientY,index:hit(event)};touchX=0;dragging=false;
    if(event.pointerType!=='mouse')canvas.setPointerCapture(event.pointerId);
    if(state.mode==='focus')canvas.style.cursor='grabbing';
  }
  function pointerup(event) {
    if(!down)return;
    wake();
    const dx=event.clientX-down.x;
    if(state.mode==='focus') {
      if(Math.abs(dx)>40)callbacks.onStep(dx>0?-1:1);
    } else if(dragging&&Math.abs(dx)>30) {
      callbacks.onStep(dx>0?-1:1);
    } else if(down.index>=0&&Math.abs(dx)<12&&Math.abs(event.clientY-down.y)<12) {
      callbacks.onOpen(down.index);
    }
    down=null;dragging=false;
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  }
  function pointerleave() {
    if(!down) {hover=-1;callbacks.onHover(null);canvas.style.cursor='default';}
  }
  function pointercancel(){down=null;dragging=false;hover=-1;callbacks.onHover(null);}
  function visibility(){paused=document.hidden;lastTime=performance.now();if(!paused)wake();}
  canvas.addEventListener('pointermove',pointermove);
  canvas.addEventListener('pointerdown',pointerdown);
  canvas.addEventListener('pointerup',pointerup);
  canvas.addEventListener('pointerleave',pointerleave);
  canvas.addEventListener('pointercancel',pointercancel);
  document.addEventListener('visibilitychange',visibility);

  function render(now) {
    frame=0;
    if(disposed)return;
    if(paused)return;
    // Rendering and cloth simulation sleep after the motion has settled.
    // UI interaction, resizing, or returning to the tab wakes the rig.
    const stillMoving=presentation.returning||garments.some(g=>{
      if(g.userData.hangerPlacement.moving)return true;
      if(!g.visible)return false;
      const m=g.userData.motion,solver=g.userData.rig.solver;
      return (solver&&!solver.asleep)||['x','y','z','yaw','roll','pitch'].some(key=>Math.abs(m[key].velocity)>.0001);
    });
    const settled=now-lastInteraction>1800&&!stillMoving;
    if(settled&&!restoreShadowDetail(garments)){canvas.dataset.sleeping='true';return;}
    const elapsed=(now-lastTime)/1000;const dt=Math.min(.05,elapsed);lastTime=now;
    canvas.dataset.frameMs=(elapsed*1000).toFixed(1);const simulationStarted=performance.now();
    const rate=reduced.matches?60:9;
    const posePlan=presentation.plan(state,focus,mobile,motions);
    focus=damp(focus,posePlan.focusTarget,rate,dt);
    const chosen=posePlan.chosen,opening=posePlan.opening;
    accumulator=Math.min(accumulator+dt,.05);
    const steps=Math.floor(accumulator/(1/60));
    accumulator-=steps/60;
    const plans=garments.map((g,i)=>{
      const selected=i===presentation.owner;
      const rackX=garmentRackX(i,items.length,chosen);
      const targetX=rackX;
      const {y:targetY,z:targetZ,scale}=garmentFocusPose(selected,chosen===i,focus,mobile?1.23:MAX_INSPECTION_SCALE,g.userData.hangerPlacement.restY);
      const motion=g.userData.motion,rig=g.userData.rig,opacity=THREE.MathUtils.lerp(1,selected?1:0,focus);
      const rotation=presentationYaw(opening===i?-.03:-1.43,selected?(presentation.turned?Math.PI:0):-1.43,focus,motion.yaw.value);
      const placement=g.userData.hangerPlacement,wanted=state.mode==='focus'?selected:opening===i;
      const scaleTarget=placement.scaleTarget(wanted?scale:1,motion);
      g.userData.inspectionZoom=damp(g.userData.inspectionZoom,scaleTarget,rate,dt);
      return{g,index:i,motion,rig,placement,wanted,solver:rig.solver,opacity,targetX,targetY,targetZ,rotation,preciseContacts:state.mode==='focus'?selected:chosen===i};
    });
    const rackPhysics=state.mode==='rack'&&focus<.05&&!reduced.matches;
    const participating=plans.filter(p=>p.opacity>.8);
    let contactTime=0,contactCount=0,clearanceYaw=opening==null?-1.43:-.03;
    for(let step=0;step<steps;step++){
      if(rackPhysics&&opening!=null)clearanceYaw=rackClearanceYaw(plans[opening],participating);
      // Advance every garment to the same fixed instant before coupling contact.
      for(const p of plans){
        const{motion,rig}=p;
        const yaw=rackPhysics&&p.index===opening?presentationYaw(clearanceYaw,clearanceYaw,0,motion.yaw.value):p.rotation;
        const control=p.placement.plan(motion,{wanted:p.wanted,y:p.targetY,z:p.targetZ,yaw},p.g.userData.inspectionZoom,reduced.matches);
        if(control.pin)p.g.userData.inspectionZoom=1;
        motion.step(p.targetX,control.z,control.yaw,1/60,reduced.matches,control.y);
        p.placement.finish(motion,control);
        if(p.opacity>.015)rig.update(1/60,{x:motion.x.value,y:motion.y.value,z:motion.z.value,yaw:motion.yaw.value,roll:motion.roll.value,pitch:motion.pitch.value,scale:1},reduced.matches,p.preciseContacts);
      }
      if(rackPhysics){const start=performance.now();contactCount+=garmentContacts.step(participating.map(p=>p.solver));contactTime+=performance.now()-start;}
    }
    canvas.dataset.contactMs=contactTime.toFixed(2);canvas.dataset.garmentContacts=String(contactCount);canvas.dataset.clearanceYaw=clearanceYaw.toFixed(3);
    canvas.dataset.hangerPhase=garments[presentation.owner].userData.hangerPlacement.phase;
    canvas.dataset.hangerPhases=garments.map(g=>g.userData.hangerPlacement.phase).join(',');
    canvas.dataset.focusOwner=String(presentation.owner);canvas.dataset.layoutChoice=String(chosen??'');canvas.dataset.openingChoice=String(opening??'');
    canvas.dataset.preparingReturn=String(presentation.returning);
    for(const{g,motion,rig,opacity}of plans){
      if(opacity>.015)rig.sync();else rig.suspend?.();
      g.position.set(motion.x.value,motion.y.value,motion.z.value);
      g.rotation.y=motion.yaw.value;g.rotation.z=motion.roll.value;g.rotation.x=motion.pitch.value;
      g.visible=opacity>1/1024;
    }
    // Inspect the garment by moving the camera, keeping its hanger in its slot.
    // Centering the garment itself made it cross neighbors on return to the rack.
    const cameraX=rackCameraX(garments[presentation.viewIndex(state.active,focus)].position.x,focus,mobile);
    panX=damp(panX,cameraX,rate,dt);
    frameInspectionCamera(camera,garments[presentation.owner],panX,garments[presentation.owner].userData.inspectionZoom);
    canvas.dataset.inspectionZoom=camera.zoom.toFixed(4);canvas.dataset.garmentScale=garments[presentation.owner].scale.x.toFixed(4);
    rail.visible=focus<1-1/1024;
    if(chosen!=null&&state.mode==='rack') {
      projected.set(garments[chosen].position.x,mobile?-1.70:-1.88,.1).project(camera);
      callbacks.onLabelPosition?.((projected.x*.5+.5)*width,(-projected.y*.5+.5)*height);
    }
    canvas.dataset.simulationMs=(performance.now()-simulationStarted).toFixed(1);
    const renderStarted=performance.now();
    const projectedHeight=2.48*camera.zoom*height/(camera.top-camera.bottom);
    let lowCount=0,shadowLowCount=0;
    for(const p of plans){
      const full=requiresFullDetail({index:p.index,active:state.active,owner:presentation.owner,chosen,opening,hovered:state.hovered,projectedHeight});
      if(applyDrawDetail(p.g,full))lowCount++;
      if(applyShadowDetail(p.g,settled||full))shadowLowCount++;
    }
    canvas.dataset.lowDetailCount=String(lowCount);canvas.dataset.shadowLowDetailCount=String(shadowLowCount);
    for(const g of garments)if(g.visible)g.userData.rig.prepare?.(renderer);
    transition.render(scene,camera,[...garments.filter((_,i)=>i!==presentation.owner),rail],focus);
    canvas.dataset.renderMs=(performance.now()-renderStarted).toFixed(1);
    frame=requestAnimationFrame(render);
  }
  for(const g of garments)g.userData.rig.prepare?.(renderer);
  transition.prepare(scene,camera,[...garments.filter((_,i)=>i!==presentation.owner),rail]);
  wake();
  callbacks.onReady({imported:garments.filter(g=>g.userData.imported).length});
  return {
    setState(next){state={...state,...next};presentation.setState(state);wake();},
    dispose(){
      disposed=true;disposeShadowDetailPass();cancelAnimationFrame(frame);resizeObserver.disconnect();
      canvas.removeEventListener('pointermove',pointermove);canvas.removeEventListener('pointerdown',pointerdown);
      canvas.removeEventListener('pointerup',pointerup);canvas.removeEventListener('pointerleave',pointerleave);
      canvas.removeEventListener('pointercancel',pointercancel);document.removeEventListener('visibilitychange',visibility);
      garments.forEach(g=>g.userData.rig.dispose?.());
      const geometries=new Set(),materials=new Set(),textures=new Set();
      scene.traverse(o=>{
        if(o.geometry)geometries.add(o.geometry);
        if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));
        if(o.customDepthMaterial)materials.add(o.customDepthMaterial);
      });
      materials.forEach(m=>{for(const v of Object.values(m))if(v?.isTexture)textures.add(v);if(m.userData.ink)textures.add(m.userData.ink);m.dispose();});
      for(const garment of garments)for(const detail of garment.userData.shadowDetail?.meshes??[])geometries.add(detail.low);
      for(const garment of garments)for(const detail of garment.userData.drawDetails??[]){geometries.add(detail.full);geometries.add(detail.low);}
      textures.forEach(t=>t.dispose());geometries.forEach(g=>g.dispose());scene.traverse(o=>o.shadow?.dispose());transition.dispose();depthPass.dispose();env.dispose();renderer.dispose();
    },
  };
}
