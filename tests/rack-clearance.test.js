import test from 'node:test';
import assert from 'node:assert/strict';
import {rackClearanceYaw} from '../src/rack-clearance.js';
const body=new Float64Array([-1,0,-.1,1,0,-.1,-1,0,.1,1,0,.1]);
function record(center,halfWidth){return{motion:{x:{value:center}},solver:{initialized:true,local:body,position:new Float64Array([center-halfWidth,0,0,center+halfWidth,0,0])}};}
test('opening waits for physical clearance instead of rotating through an open neighbor',()=>{const chosen=record(0,.25),neighbor=record(1.39,1);const limit=rackClearanceYaw(chosen,[chosen,neighbor]);assert.ok(limit< -1&&limit> -1.43);neighbor.solver.position=new Float64Array([1.14,0,0,1.64,0,0]);assert.equal(rackClearanceYaw(chosen,[chosen,neighbor]),-.03);});
test('clearance protects either side of the selected garment',()=>{const chosen=record(0,.25),left=record(-1.39,1),right=record(1.39,1);const a=rackClearanceYaw(chosen,[chosen,left]),b=rackClearanceYaw(chosen,[chosen,right]);assert.ok(Math.abs(a-b)<1e-10);assert.ok(a< -1);});
test('a garment without adjacent surfaces opens fully',()=>{const chosen=record(0,.25);assert.equal(rackClearanceYaw(chosen,[chosen]),-.03);});

test('a sleeve at another height does not block the selected shoulder',()=>{const chosen=record(0,.25),neighbor=record(1.39,1);neighbor.solver.position=new Float64Array([.39,-1.4,0,2.39,-1.4,0]);assert.equal(rackClearanceYaw(chosen,[chosen,neighbor]),-.03);});
test('the selected garment deformation does not feed back into the rotation motor',()=>{const chosen=record(0,.25),neighbor=record(1.39,1);chosen.solver.rest=new Float64Array(body);const expected=rackClearanceYaw(chosen,[chosen,neighbor]);chosen.solver.local=Float64Array.from(body,v=>v*2);assert.equal(rackClearanceYaw(chosen,[chosen,neighbor]),expected);});
