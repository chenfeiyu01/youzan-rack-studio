import test from'node:test';import assert from'node:assert/strict';import{RenderInterpolation}from'../src/render-interpolation.js';
const pose=x=>({x,y:1.65,z:0,yaw:-1.43,roll:0,pitch:0,scale:1});
test('30 Hz physical endpoints produce intermediate display frames without changing their input poses',()=>{
 const input=[pose(0)],render=new RenderInterpolation(input);render.commit(1,0,input,0);assert.equal(render.alpha(0),1);
 const next=[pose(1)];render.commit(2,100/3,next,.5);assert.equal(render.anchor(0,render.alpha(100/3)).x,0);assert.ok(Math.abs(render.anchor(0,render.alpha(50)).x-.5)<1e-12);assert.equal(render.anchor(0,render.alpha(200/3)).x,1);
 render.commit(3,200/3,[pose(2)],1);assert.equal(render.anchor(0,render.alpha(200/3)).x,1);assert.deepEqual(input,[pose(0)]);assert.deepEqual(next,[pose(1)]);
 assert.equal(render.arrived,false);render.commit(4,100,[pose(2)],1);assert.equal(render.arrived,true);assert.equal(render.alpha(100,true),1);
});
test('idle time does not become an interpolation delay and angle wrapping keeps the shortest path',()=>{
 const render=new RenderInterpolation([pose(0)]);render.commit(1,0,[{...pose(0),yaw:Math.PI-.1}]);render.restart(10000);render.commit(2,10020,[{...pose(1),yaw:-Math.PI+.1}]);
 assert.equal(render.span,20);assert.ok(Math.abs(render.anchor(0,.5).yaw-Math.PI)<1e-12);assert.equal(render.alpha(10030),.5);
});
