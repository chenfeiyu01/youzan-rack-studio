import test from'node:test';import assert from'node:assert/strict';import{createFrameDiagnostics}from'../src/frame-diagnostics.js';
test('physics and render diagnostics publish at most four periodic DOM batches per second',()=>{
 let now=0,writes=0;const data={},target=new Proxy(data,{set(o,key,value){writes++;o[key]=value;return true;}}),report=createFrameDiagnostics(target,{now:()=>now});
 for(let step=0;step<240;step++){now=step*1000/240;report.values.frame=step;report.publish();}
 assert.equal(writes,4);assert.equal(data.frame,'180');
});
test('arrival and final draw force exact diagnostics without rewriting unchanged attributes',()=>{
 let now=0;const target={},report=createFrameDiagnostics(target,{now:()=>now});Object.assign(report.values,{physicsWorkers:4,progress:0});assert.equal(report.publish(),2);
 now=10;report.values.progress=.5;assert.equal(report.publish(),0);assert.equal(target.progress,'0');
 Object.assign(report.values,{progress:1,hoverCompleteMs:'322.7'});assert.equal(report.publish(true),2);assert.equal(target.hoverCompleteMs,'322.7');assert.equal(report.publish(true),0);
});
