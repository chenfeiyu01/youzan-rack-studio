import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSurfaceSeams} from '../src/surface-seams.js';
import {initialContactExclusions} from '../src/surface-rest-contacts.js';
test('unequal panel tessellation connects a seam midpoint to the opposite boundary edge',()=>{
 const data={positions:[0,0,0,1,0,0,0,1,0,1,1,0,1.01,0,0,1.01,.5,0,1.01,1,0,2,0,0],triangles:[0,1,2,1,3,2,4,7,5,5,7,6]};
 const seams=buildSurfaceSeams(data),middle=seams.find(s=>s.a===5);assert.ok(middle);assert.ok(Math.abs(middle.fraction-.5)<1e-10);assert.ok(Math.abs(middle.length-.01)<1e-10);assert.deepEqual(new Set([middle.b,middle.c]),new Set([1,3]));
 data.positions=data.positions.map((v,i)=>i>=12&&i%3===0?v+1:v);assert.equal(buildSurfaceSeams({...data}).length,0);
});
test('initial intersections are excluded per primitive pair without disabling a separate face',()=>{
 const data={positions:[-1,-1,0,1,-1,0,0,1,0,0,0,-1,0,0,1,.5,0,1,4,-1,0,5,-1,0,4,1,0],triangles:[0,1,2,3,4,5,6,7,8]},edges=[0,1,1,2,2,0,3,4,4,5,5,3,6,7,7,8,8,6],excluded=initialContactExclusions(data,edges);
 assert.ok(excluded.faces[0].has(1));assert.ok(excluded.faces[3].has(0));assert.ok(excluded.edgePairs.has(3));assert.ok(!excluded.faces[0].has(2));assert.equal(excluded.faces[6].size,0);
});
