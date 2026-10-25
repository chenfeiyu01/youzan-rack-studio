import{loadGeometryAsset}from'./helpers/geometry-asset.js';
import{placeGarmentModel}from'../src/model-space.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import * as T from 'three';
import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';
import{frameStudioShadow,createStudioShadowFraming}from'../src/studio-shadow.js';
import{FocusTransition}from'../src/focus-transition.js';
import{modelConfig}from'../src/model-config.js';

function key(){const light=new T.DirectionalLight();light.position.set(-4,5,6);light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{near:.2,far:24});return light;}
test('both garment assets retain complete shadow coverage at left, middle and right slots while turning',async()=>{
  const light=key();
  for(const c of Object.values(modelConfig)){
    const asset=await loadGeometryAsset(new URL('../public'+c.url,import.meta.url));placeGarmentModel(asset.scene,c);
    asset.scene.updateMatrixWorld(true);const box=new T.Box3().setFromObject(asset.scene),centre=box.getCenter(new T.Vector3()),scale=1;
    const points=[];asset.scene.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.clone().applyMatrix4(o.matrixWorld);g.scale(scale,scale,scale);const p=g.attributes.position;for(let i=0;i<p.count;i++)points.push(new T.Vector3().fromBufferAttribute(p,i));g.dispose();});
    // Include the separately constructed wooden hanger for the short sleeve.
    if(!c.hasHanger)for(const x of[-.68,.68])for(const y of[.55,1.59])for(const z of[-.06,0])points.push(new T.Vector3(x,y,z));
    for(const x of[-3.285,0,3.285])for(const yaw of[0,Math.PI/2,Math.PI]){
      const carrier=new T.Matrix4().compose(new T.Vector3(x,1.94,.35),new T.Quaternion().setFromEuler(new T.Euler(.008,yaw,.012,'ZYX')),new T.Vector3(1.28,1.28,1.28)),pose=carrier.clone().multiply(new T.Matrix4().makeTranslation(0,-1.58,0));
      frameStudioShadow(light,new T.Vector3(0,-1.58,0).applyMatrix4(carrier),true);
      for(const point of points){const v=point.clone().applyMatrix4(pose).project(light.shadow.camera);assert.ok(Math.max(Math.abs(v.x),Math.abs(v.y),Math.abs(v.z))<.99,c.url+' x='+x+' yaw='+yaw);}
    }
  }
});
test('the shadow window snaps to texels without changing key light direction or intensity',()=>{
  const light=key(),position=light.position.clone(),target=light.target.position.clone(),intensity=light.intensity;
  frameStudioShadow(light,new T.Vector3(),true);const c=light.shadow.camera,before=[c.left,c.right,c.top,c.bottom],rotation=c.quaternion.clone(),texel=6/2048;
  const point=new T.Vector3(.2*texel,.2*texel,-10).applyMatrix4(c.matrixWorld);
  frameStudioShadow(light,point,true);assert.deepEqual([c.left,c.right,c.top,c.bottom],before);
  point.set(1.2*texel,.2*texel,-10).applyMatrix4(c.matrixWorld);frameStudioShadow(light,point,true);
  assert.ok(Math.abs(c.left-before[0]-texel)<1e-12);assert.ok(c.quaternion.angleTo(rotation)<1e-7);
  assert.deepEqual(light.position,position);assert.deepEqual(light.target.position,target);assert.equal(light.intensity,intensity);
});
test('opaque rack and piece captures each frame the shadows of their own visible scene',()=>{
  const light=key(),rail=new T.Group(),piece=new T.Group(),other=new T.Group(),scene=new T.Scene();piece.position.set(3.285,1.94,.35);piece.scale.setScalar(1.28);rail.position.x=-1;
  scene.add(light,rail,piece,other);scene.onBeforeRender=createStudioShadowFraming(light,rail,()=>piece);const captures=[];
  const renderer={capabilities:{maxSamples:4},target:null,color:new T.Color(),alpha:1,getDrawingBufferSize(v){return v.set(64,64);},getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},getClearAlpha(){return this.alpha;},getClearColor(c){return c.copy(this.color);},setClearColor(c,a){this.color.set(c);this.alpha=a;},render(s){if(s===scene){s.onBeforeRender();const c=light.shadow.camera;captures.push({rack:rail.visible,width:c.right-c.left,height:c.top-c.bottom,centre:(c.left+c.right)/2});}}};
  const transition=new FocusTransition(renderer);
  try{transition.render(scene,new T.Camera(),[other,rail],.5);assert.equal(captures.length,2);assert.deepEqual(captures.map(c=>[c.rack,c.width,c.height]),[[true,14,9],[false,6,6.5]]);assert.ok(captures[1].centre>2);assert.equal(rail.visible,true);assert.equal(other.visible,true);}finally{transition.dispose();}
});
