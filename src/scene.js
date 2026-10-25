import {applyShadowDetail,installShadowDetailPass} from './shadow-detail.js';
import * as THREE from 'three';
import{RoundedBoxGeometry}from'three/addons/geometries/RoundedBoxGeometry.js';
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
import {createClothStepper} from './cloth-stepper.js';
import {createFixedStepLoop} from './fixed-step-loop.js';
import{createFrameDiagnostics}from'./frame-diagnostics.js';
import{renderPixelRatio}from'./render-resolution.js';
import{RenderInterpolation}from'./render-interpolation.js';

const damp = (a,b,rate,dt) => THREE.MathUtils.lerp(a,b,1-Math.exp(-rate*dt));

export function makeRail(scene) {
  const group = new THREE.Group();
  const chrome = new THREE.MeshStandardMaterial({color:'#c0c2bf',metalness:1,roughness:.18,envMapIntensity:1.4});
  const brushed=chrome.clone();brushed.roughness=.26;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(RAIL.radius,RAIL.radius,RAIL.length,28),chrome);
  rod.rotation.z=Math.PI/2;rod.position.y=RAIL.height;rod.castShadow=true;
  group.add(rod);
  for(const x of [-4.58,4.58]) {
    const plate = new THREE.Mesh(new RoundedBoxGeometry(.13,.29,.055,4,.012),brushed);
    plate.position.set(x,1.57,-.34);plate.castShadow=true;group.add(plate);
    const mount=new THREE.Group();mount.position.set(x,RAIL.height,0);group.add(mount);
    // A continuous turned fillet blends the slender support into the rail.
    // Small bevels catch the studio light without a faceted or boxy weld.
    const support=new THREE.Mesh(new THREE.LatheGeometry([[.033,0],[.034,.006],[.031,.014],[.026,.023],[.025,.032],[.025,.252],[.026,.266],[.030,.280],[.036,.291]].map(p=>new THREE.Vector2(...p)),40),chrome);
    support.rotation.x=Math.PI/2;support.position.z=-.315;support.castShadow=true;mount.add(support);
    const cap=new THREE.Mesh(new THREE.LatheGeometry([[.035,-.044],[.038,-.039],[.040,-.030],[.040,.014],[.038,.025],[.031,.032],[0,.034]].map(p=>new THREE.Vector2(...p)),48),chrome);
    cap.rotation.z=x<0?Math.PI/2:-Math.PI/2;cap.position.x=x<0?.022:-.022;cap.castShadow=true;mount.add(cap);
    for(const y of [1.47,1.67]) {
      const screw=new THREE.Mesh(new THREE.SphereGeometry(.012,24,12),chrome);
      screw.scale.z=.3;screw.position.set(x,y,-.305);group.add(screw);
    }
  }
  scene.add(group);
  return group;
}

export async function createRackScene(canvas, items, callbacks) {
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(1);
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
  const studio=makeStudio(scene,{areaSampleSide:2});
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
  const clothStepper=await createClothStepper(garments.map(g=>g.userData.rig),{onWarning:message=>callbacks.onWarning?.('Parallel cloth: '+message)});
  canvas.dataset.physicsWorkers=String(clothStepper.workerCount);
  canvas.dataset.contactKernel=clothStepper.contactKernel;
  const depthPlanes=configureStudioDepthPlanes(studio,scene,renderer,{secondary:true});
  const disposeShadowDetailPass=installShadowDetailPass(renderer,garments);
  canvas.dataset.shadowEncoding=depthPlanes?'caster-depth-planes':'packed-depth';
  scene.traverse(object=>{if(object.isMesh)for(const material of(Array.isArray(object.material)?object.material:[object.material])){applyStudioAreaLight(material);applyStudioAreaVisibility(material,studio.key.shadow);applyStudioDirectionalVisibility(material,studio.secondaryLights);}});
  const motions=garments.map(g=>g.userData.motion);
  const initialAnchors=motions.map(m=>({x:m.x.value,y:m.y.value,z:m.z.value,yaw:m.yaw.value,roll:m.roll.value,pitch:m.pitch.value,scale:1}));
  const displayMotion=new RenderInterpolation(initialAnchors),displayAnchor={};
  const depthPass=createOpaqueDepthPass(renderer);
  const transition=new FocusTransition(renderer,(scene,camera)=>depthPass.render(scene,camera),[studio.sweep]);
  let state={active:6,hovered:null,mode:'rack',turned:false};
  const presentation=new RackPresentation(state.active);
  // This hook runs before each shadow pass, after FocusTransition has chosen
  // the capture's visibility. The rack capture must retain the entire rack.
  scene.onBeforeRender=createStudioShadowFraming(studio.key,rail,()=>garments[presentation.owner],studio.secondaryLights);
  let focus=0,width=1,height=1,mobile=false,frame=0,disposed=false,paused=false,panX=0,appliedState=null;
  let readyForFrames=false,physicsLoop=null,sleeping=false,finalDraw=false,forceDraw=true,lastDraw=0,lastPhysicsCommit=0;
  let view={version:0,active:6,owner:6,hovered:null,mode:'rack',focus:0,chosen:null,opening:null,zoom:1,anchors:initialAnchors,committedAt:0,hoverProgress:1};
  let lastInteraction=performance.now();
  let touchX=0,down=null,dragging=false,hover=-1;
  const diagnostics=createFrameDiagnostics(canvas.dataset),diagnosticValues=diagnostics.values;
  let hoverStarted=0,hoverTimedChoice=null,hoverMeasured=false;
  let frameNumber=0,physicsNumber=0;const frameMetrics=[],physicsMetrics=[];
  const hoverMetrics={frames:[],physics:[],solve:[],workers:[],contacts:[],render:[],jobs:[]};
  const pointer=new THREE.Vector2();
  const raycaster=new THREE.Raycaster();
  const plane=new THREE.Plane(new THREE.Vector3(0,0,1),0);
  const point=new THREE.Vector3();
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  function wake() {
    if(disposed)return;
    diagnosticValues.sleeping='false';diagnostics.publish(true);
    lastInteraction=performance.now();
    if(!readyForFrames||paused)return;
    if(!physicsLoop.active){lastDraw=lastPhysicsCommit=0;frameMetrics.length=physicsMetrics.length=0;displayMotion.restart(performance.now());}
    setRenderResolution(false);sleeping=false;physicsLoop.start();ensureDraw();
  }
  function ensureDraw(){if(readyForFrames&&!frame&&!paused&&!disposed)frame=requestAnimationFrame(render);}
  function setRenderResolution(settled,resize=false){
    const ratio=renderPixelRatio(width,height,window.devicePixelRatio,settled);
    if(resize||Math.abs(renderer.getPixelRatio()-ratio)>1e-6){renderer.setPixelRatio(ratio);renderer.setSize(width,height,false);canvas.dataset.pixelRatio=ratio.toFixed(3);}
    const quality=settled?'settled':'motion';if(canvas.dataset.renderQuality!==quality)canvas.dataset.renderQuality=quality;
  }
  function resize() {
    const box=canvas.getBoundingClientRect();if(!(box.width>0&&box.height>0))return;width=box.width;height=box.height;
    mobile=width<700;
    const viewHeight=mobile?7.2:6.65;
    camera.left=-viewHeight*width/height/2;camera.right=-camera.left;
    camera.top=viewHeight/2;camera.bottom=-viewHeight/2;camera.updateProjectionMatrix();
    panX=rackCameraX(garments[view.focus>1/1024?view.owner:view.active].position.x,view.focus,mobile);
    frameInspectionCamera(camera,garments[view.owner],panX,view.zoom);
    setRenderResolution(false,true);forceDraw=true;
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
  function visibility(){paused=document.hidden;if(paused){physicsLoop?.stop();cancelAnimationFrame(frame);frame=0;}else wake();}
  canvas.addEventListener('pointermove',pointermove);
  canvas.addEventListener('pointerdown',pointerdown);
  canvas.addEventListener('pointerup',pointerup);
  canvas.addEventListener('pointerleave',pointerleave);
  canvas.addEventListener('pointercancel',pointercancel);
  document.addEventListener('visibilitychange',visibility);

  function recordMetric(values,value){
    values.push(value);if(values.length>120)values.shift();
  }
  function summarize(values){
    const sorted=[...values].sort((a,b)=>a-b);
    return{frames:sorted.length,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],averageMs:sorted.reduce((a,b)=>a+b,0)/sorted.length};
  }
  async function advancePhysics(dt){
    if(disposed||paused)return false;
    const started=performance.now(),frameState=state;
    if(appliedState!==frameState){presentation.setState(frameState);appliedState=frameState;}
    const stillMoving=presentation.returning||garments.some(g=>{
      if(g.userData.hangerPlacement.moving)return true;
      if(!g.visible)return false;
      const m=g.userData.motion,solver=g.userData.rig.solver;
      return(solver&&!solver.asleep)||['x','y','z','yaw','roll','pitch'].some(key=>Math.abs(m[key].velocity)>.0001);
    });
    if(started-lastInteraction>1800&&!stillMoving){sleeping=true;finalDraw=true;diagnosticValues.sleeping='true';diagnostics.publish(true);ensureDraw();return false;}
    const rate=reduced.matches?60:9,posePlan=presentation.plan(frameState,focus,mobile,motions,garments.map(g=>g.userData.hangerPlacement),dt,reduced.matches);
    focus=damp(focus,posePlan.focusTarget,rate,dt);
    const chosen=posePlan.chosen,opening=posePlan.opening;
    const plans=garments.map((g,i)=>{
      const selected=i===presentation.owner,targetX=posePlan.positions[i];
      const {y:targetY,z:targetZ,scale}=garmentFocusPose(selected,chosen===i,focus,mobile?1.23:MAX_INSPECTION_SCALE,g.userData.hangerPlacement.restY);
      const motion=g.userData.motion,rig=g.userData.rig,opacity=THREE.MathUtils.lerp(1,selected?1:0,focus);
      const rotation=presentationYaw(opening===i?-.03:-1.43,selected?(presentation.turned?Math.PI:0):-1.43,focus,motion.yaw.value);
      const placement=g.userData.hangerPlacement,wanted=frameState.mode==='focus'?selected:opening===i;
      const scaleTarget=placement.scaleTarget(wanted?scale:1,motion);
      g.userData.inspectionZoom=damp(g.userData.inspectionZoom,scaleTarget,rate,dt);
      return{g,index:i,motion,rig,placement,wanted,swivel:g.userData.swivel,substeps:posePlan.substeps??1,solver:rig.solver,opacity,targetX,targetY,targetZ,rotation,preciseContacts:frameState.mode==='focus'?selected:chosen===i||posePlan.outgoing.includes(i)||placement.phase!=='seated'};
    });
    const rackPhysics=frameState.mode==='rack'&&focus<.05&&!reduced.matches,participating=plans.filter(p=>p.opacity>.8);
    const clearanceYaw=posePlan.hover&&opening!=null?posePlan.yaws[opening]:rackPhysics&&opening!=null?rackClearanceYaw(plans[opening],participating,posePlan.openingYaw):opening==null?-1.43:-.03;
    for(const p of plans){
      const {motion,swivel}=p,previousX=motion.x.value,yaw=posePlan.hover?(p.index===opening?clearanceYaw:posePlan.yaws[p.index]):p.rotation;
      const control=p.placement.plan(swivel.hookMotion,{wanted:frameState.mode==='focus'&&p.index===presentation.owner,y:p.targetY,z:p.targetZ,yaw:-1.43},p.g.userData.inspectionZoom,reduced.matches);
      if(control.pin)p.g.userData.inspectionZoom=1;
      motion.step(p.targetX,control.z,yaw,dt,reduced.matches,control.y,posePlan.hover,posePlan.drive);p.placement.finish(swivel.hookMotion,control);
      p.anchor={x:motion.x.value,y:motion.y.value,z:motion.z.value,yaw:motion.yaw.value,roll:motion.roll.value,pitch:motion.pitch.value,scale:1};
      p.pose=swivel.bodyPose(p.anchor);p.layoutOffset=posePlan.hover?motion.x.value-previousX:0;
    }
    await clothStepper.step(plans,dt,reduced.matches);
    diagnosticValues.clothJobsSent=String(clothStepper.lastSent);diagnosticValues.sleepingClothSkipped=String(clothStepper.lastSleeping);
    if(disposed)return false;
    const contactStarted=performance.now(),contactCount=rackPhysics?garmentContacts.step(participating.map(p=>p.solver)):0;
    diagnosticValues.contactMs=(performance.now()-contactStarted).toFixed(2);diagnosticValues.garmentContacts=String(contactCount);
    for(const {g,motion,rig,opacity,pose,anchor,swivel} of plans){
      if(opacity<=.015)rig.suspend?.();
      g.position.set(pose.x,pose.y,pose.z);
      g.rotation.y=motion.yaw.value;g.rotation.z=motion.roll.value;g.rotation.x=motion.pitch.value;swivel.sync(anchor);g.visible=opacity>1/1024;
    }
    view={version:view.version+1,active:frameState.active,owner:presentation.owner,hovered:frameState.hovered,mode:frameState.mode,focus,chosen,opening,outgoing:posePlan.outgoing,hoverProgress:posePlan.progress,zoom:garments[presentation.owner].userData.inspectionZoom,anchors:plans.map(p=>p.anchor),committedAt:performance.now()};
    diagnosticValues.hangerPhase=garments[view.owner].userData.hangerPlacement.phase;
    diagnosticValues.hangerPhases=garments.map(g=>g.userData.hangerPlacement.phase).join(',');
    diagnosticValues.focusOwner=String(view.owner);diagnosticValues.layoutChoice=String(chosen??'');diagnosticValues.openingChoice=String(opening??'');
    diagnosticValues.outgoingChoices=posePlan.outgoing.join(',');diagnosticValues.hoverProgress=String(posePlan.progress??0);diagnosticValues.hoverYaw=opening==null?'':motions[opening].yaw.value.toFixed(5);
    diagnosticValues.preparingReturn=String(presentation.returning);diagnosticValues.clearanceYaw=clearanceYaw.toFixed(3);
    diagnosticValues.simulationMs=(performance.now()-started).toFixed(1);diagnosticValues.workerMs=clothStepper.workerMs.toFixed(1);
    const committed=performance.now();
    if(hoverStarted&&!hoverMeasured&&frameState.hovered===hoverTimedChoice){
      recordMetric(hoverMetrics.solve,committed-started);recordMetric(hoverMetrics.workers,clothStepper.workerMs);recordMetric(hoverMetrics.jobs,clothStepper.lastSent);recordMetric(hoverMetrics.contacts,Number(diagnosticValues.contactMs));
      if(lastPhysicsCommit)recordMetric(hoverMetrics.physics,committed-lastPhysicsCommit);
    }
    if(lastPhysicsCommit)recordMetric(physicsMetrics,committed-lastPhysicsCommit);lastPhysicsCommit=committed;
    diagnosticValues.physicsNumber=String(++physicsNumber);
    if(physicsNumber%15===0&&physicsMetrics.length)diagnosticValues.physicsPerformance=JSON.stringify(summarize(physicsMetrics));
    diagnostics.publish();ensureDraw();return true;
  }
  function render(now){
    frame=0;if(disposed||paused)return;
    // A 240 Hz monitor must not submit four expensive copies of a 60 Hz state.
    // Physics runs while the GPU draws the previous committed state.
    if(!forceDraw&&!finalDraw&&now-lastDraw<1000/60-.5){if(!sleeping)ensureDraw();return;}
    const renderStarted=performance.now(),snapshot=view;setRenderResolution(sleeping&&finalDraw);
    displayMotion.commit(snapshot.version,snapshot.committedAt,snapshot.anchors,snapshot.hoverProgress);
    const alpha=displayMotion.alpha(now,reduced.matches||sleeping);
    for(let i=0;i<garments.length;i++){
      const g=garments[i],swivel=g.userData.swivel,anchor=displayMotion.anchor(i,g.userData.rig.flow?alpha:1,displayAnchor),pose=swivel.bodyPose(anchor);
      g.position.set(pose.x,pose.y,pose.z);g.rotation.set(anchor.pitch,anchor.yaw,anchor.roll);swivel.sync(anchor);
    }
    diagnosticValues.renderInterpolation=alpha.toFixed(3);
    const cameraX=rackCameraX(garments[snapshot.focus>1/1024?snapshot.owner:snapshot.active].position.x,snapshot.focus,mobile);
    panX=damp(panX,cameraX,reduced.matches?60:9,lastDraw?Math.min(.05,(now-lastDraw)/1000):1/60);
    frameInspectionCamera(camera,garments[snapshot.owner],panX,snapshot.zoom);
    diagnosticValues.inspectionZoom=camera.zoom.toFixed(4);diagnosticValues.garmentScale=garments[snapshot.owner].scale.x.toFixed(4);
    rail.visible=snapshot.focus<1-1/1024;
    const projectedHeight=2.48*camera.zoom*height/(camera.top-camera.bottom);
    let lowCount=0,shadowLowCount=0;
    for(let index=0;index<garments.length;index++){
      const full=finalDraw||sleeping||snapshot.outgoing?.includes(index)||requiresFullDetail({index,active:snapshot.active,owner:snapshot.owner,chosen:snapshot.chosen,opening:snapshot.opening,hovered:snapshot.hovered,projectedHeight});
      if(applyDrawDetail(garments[index],full))lowCount++;
      if(applyShadowDetail(garments[index],finalDraw||full))shadowLowCount++;
    }
    diagnosticValues.lowDetailCount=String(lowCount);diagnosticValues.shadowLowDetailCount=String(shadowLowCount);
    for(const g of garments)if(g.visible){g.userData.rig.sync();g.userData.rig.prepare?.(renderer,alpha,snapshot.version);}
    transition.render(scene,camera,[...garments.filter((_,i)=>i!==snapshot.owner),rail],snapshot.focus,garments[snapshot.owner]);
    diagnosticValues.renderMs=(performance.now()-renderStarted).toFixed(1);diagnosticValues.frameNumber=String(++frameNumber);
    if(lastDraw){recordMetric(frameMetrics,now-lastDraw);diagnosticValues.frameMs=(now-lastDraw).toFixed(1);}
    if(frameNumber%15===0&&frameMetrics.length)diagnosticValues.performance=JSON.stringify(summarize(frameMetrics));
    if(hoverStarted&&!hoverMeasured&&snapshot.chosen===hoverTimedChoice){recordMetric(hoverMetrics.render,performance.now()-renderStarted);if(lastDraw)recordMetric(hoverMetrics.frames,now-lastDraw);}
    if(!hoverMeasured&&hoverStarted&&snapshot.mode==='rack'&&snapshot.chosen===hoverTimedChoice&&snapshot.hoverProgress===1&&(reduced.matches||displayMotion.arrived)){diagnosticValues.hoverCompleteMs=(performance.now()-hoverStarted).toFixed(1);hoverMeasured=true;diagnosticValues.hoverPerformance=JSON.stringify(Object.fromEntries(Object.entries(hoverMetrics).map(([key,values])=>[key,values.length?summarize(values):null])));diagnostics.publish(true);}
    diagnostics.publish(finalDraw);
    lastDraw=now;forceDraw=finalDraw=false;
    if(!sleeping)ensureDraw();
  }
  physicsLoop=createFixedStepLoop(advancePhysics,{onError:error=>console.error('Cloth simulation failed:',error)});
  for(const g of garments)g.userData.rig.prepare?.(renderer);
  transition.prepare(scene,camera,[...garments.filter((_,i)=>i!==presentation.owner),rail],garments[presentation.owner]);
  readyForFrames=true;wake();
  callbacks.onReady({imported:garments.filter(g=>g.userData.imported).length});
  return {
    setState(next){if(next.mode!=='focus'&&next.hovered!=null&&next.hovered!==state.hovered){hoverStarted=performance.now();hoverTimedChoice=next.hovered;hoverMeasured=false;for(const values of Object.values(hoverMetrics))values.length=0;diagnosticValues.hoverCompleteMs='';diagnosticValues.hoverPerformance='';}state={...state,...next};wake();},
    dispose(){
      disposed=true;physicsLoop.stop();clothStepper.dispose();disposeShadowDetailPass();cancelAnimationFrame(frame);resizeObserver.disconnect();
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
      materials.forEach(m=>{for(const v of Object.values(m))if(v?.isTexture)textures.add(v);if(m.userData.ink)textures.add(m.userData.ink);if(m.userData.fabricPatternMap)textures.add(m.userData.fabricPatternMap);m.dispose();});
      for(const garment of garments)for(const detail of garment.userData.shadowDetail?.meshes??[])geometries.add(detail.low);
      for(const garment of garments)for(const detail of garment.userData.drawDetails??[]){geometries.add(detail.full);geometries.add(detail.low);}
      textures.forEach(t=>t.dispose());geometries.forEach(g=>g.dispose());scene.traverse(o=>o.shadow?.dispose());transition.dispose();depthPass.dispose();env.dispose();renderer.dispose();
    },
  };
}
