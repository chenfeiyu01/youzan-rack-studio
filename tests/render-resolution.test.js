import test from'node:test';import assert from'node:assert/strict';import{renderPixelRatio}from'../src/render-resolution.js';
test('portrait phone and rotated phone retain the same 1080p motion budget',()=>{
 const portrait=renderPixelRatio(393,852,3),landscape=renderPixelRatio(852,393,3);
 assert.equal(portrait,landscape);assert.equal(852*portrait,1920);assert.ok(393*portrait>880);assert.ok(393*852*portrait*portrait<=1920*1080);
});
test('retina desktop restores native settled detail and returns to 1080p on motion',()=>{
 assert.equal(renderPixelRatio(1920,834,2),1);assert.equal(renderPixelRatio(1920,834,2,true),2);assert.equal(renderPixelRatio(1920,834,2),1);
 assert.ok(3840*2160*renderPixelRatio(3840,2160,2,true)**2<=3840*2160);assert.equal(renderPixelRatio(800,600,1,true),1);
});
