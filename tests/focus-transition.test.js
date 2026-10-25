import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FocusTransition} from '../src/focus-transition.js';

test('failed capture restores scene visibility, clear color and render destination',()=>{
  const background=new THREE.Color('#252627'),clear=new THREE.Color('#123456'),destination={name:'original target'};
  const renderer={
    capabilities:{maxSamples:4},target:destination,color:clear.clone(),alpha:.7,calls:0,
    getDrawingBufferSize(size){return size.set(640,480);},getRenderTarget(){return this.target;},setRenderTarget(target){this.target=target;},
    getClearAlpha(){return this.alpha;},getClearColor(color){return color.copy(this.color);},setClearColor(color,alpha){this.color.set(color);this.alpha=alpha;},
    render(){if(++this.calls===2)throw new Error('capture interrupted');},
  };
  const scene=new THREE.Scene();scene.background=background;
  const visible=new THREE.Group(),hidden=new THREE.Group();hidden.visible=false;
  const transition=new FocusTransition(renderer);
  try {
    assert.throws(()=>transition.render(scene,new THREE.Camera(),[visible,hidden],.5),/capture interrupted/);
    assert.equal(visible.visible,true);assert.equal(hidden.visible,false);
    assert.equal(scene.background,background);assert.equal(renderer.target,destination);
    assert.ok(renderer.color.equals(clear));assert.equal(renderer.alpha,.7);
  } finally {transition.dispose();}
});

test('the selected piece stays sharp and the settled background is reused until camera or owner changes',()=>{
 const destination={name:'screen'},scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),neighbor=new THREE.Group(),subject=new THREE.Group(),sweep=new THREE.Group(),draws=[],composites=[];scene.add(neighbor,subject,sweep);scene.background=new THREE.Color('#e9e8e4');
 const renderer={capabilities:{maxSamples:4},target:destination,color:new THREE.Color(),alpha:1,getDrawingBufferSize(v){return v.set(128,64);},getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},getClearAlpha(){return this.alpha;},getClearColor(c){return c.copy(this.color);},setClearColor(c,a){this.color.set(c);this.alpha=a;},render(s,c){composites.push({scene:s,camera:c,target:this.target});}};
 const transition=new FocusTransition(renderer,(s,c)=>draws.push({scene:s,camera:c,target:renderer.target,neighbor:neighbor.visible,subject:subject.visible,sweep:sweep.visible}),[sweep]);
 try{
  transition.render(scene,camera,[neighbor],.5,subject);
  assert.deepEqual(draws.map(d=>[d.neighbor,d.subject,d.sweep]),[[true,false,true],[false,true,false]]);assert.deepEqual(draws.map(d=>d.target),[transition.rack,transition.piece]);assert.equal(composites[0].target,destination);assert.ok(neighbor.visible&&subject.visible&&sweep.visible);
  transition.render(scene,camera,[neighbor],1,subject);assert.equal(draws.length,4);
  transition.render(scene,camera,[neighbor],1,subject);assert.equal(draws.length,5);assert.equal(draws.at(-1).target,transition.piece,'only the sharp foreground redraws');
  camera.position.x=.1;transition.render(scene,camera,[neighbor],1,subject);assert.equal(draws.length,7,'moving camera refreshes background');
  transition.render(scene,camera,[subject],1,neighbor);assert.equal(draws.length,9,'new selected piece refreshes background');
  transition.render(scene,camera,[neighbor],0,subject);assert.equal(draws.length,10);assert.equal(draws.at(-1).target,destination);
 }finally{transition.dispose();}
});
