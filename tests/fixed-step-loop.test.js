import test from 'node:test';
import assert from 'node:assert/strict';
import {createFixedStepLoop} from '../src/fixed-step-loop.js';

function clock(){
  let time=0,id=0;const tasks=new Map();
  return {
    now:()=>time,
    advance:ms=>{time+=ms;},
    schedule(callback,delay){const key=++id;tasks.set(key,{callback,at:time+delay});return key;},
    cancel:key=>tasks.delete(key),
    get pending(){return tasks.size;},
    async next(){const [key,task]=tasks.entries().next().value;tasks.delete(key);time=Math.max(time,task.at);task.callback();await Promise.resolve();await Promise.resolve();await Promise.resolve();},
  };
}
test('slow asynchronous work retains every fixed physics step instead of dropping accumulated time',async()=>{
  const c=clock(),trace=[],durations=[25,2,2,2];
  const loop=createFixedStepLoop(async dt=>{trace.push({at:c.now(),dt});c.advance(durations.shift());return trace.length<4;},c);
  loop.start();for(let i=0;i<4;i++)await c.next();
  assert.deepEqual(trace.map(x=>x.dt),Array(4).fill(1/60));
  assert.equal(trace[0].at,0);assert.equal(trace[1].at,25);
  assert.ok(Math.abs(trace[2].at-1000/30)<1e-10);assert.ok(Math.abs(trace[3].at-50)<1e-10);
  assert.equal(loop.active,false);assert.equal(c.pending,0);
});
test('pause and resume during an in-flight step never overlap solvers or replay hidden-tab time',async()=>{
  const c=clock();let release,calls=0;
  const loop=createFixedStepLoop(()=>{calls++;return new Promise(resolve=>{release=resolve;});},c);
  loop.start();await c.next();loop.stop();c.advance(10000);loop.start();
  assert.equal(calls,1);assert.equal(c.pending,0);
  release(true);await Promise.resolve();await Promise.resolve();
  assert.equal(c.pending,1);await c.next();assert.equal(calls,2);
  assert.ok(c.now()>10000&&c.now()<10017);
  loop.stop();release(true);await Promise.resolve();await Promise.resolve();assert.equal(c.pending,0);
});
test('a failed step stops its clock and reports the actual error once',async()=>{
  const c=clock(),errors=[];
  const loop=createFixedStepLoop(()=>{throw new Error('solver error');},{...c,onError:error=>errors.push(error.message)});
  loop.start();await c.next();assert.equal(loop.active,false);assert.equal(c.pending,0);assert.deepEqual(errors,['solver error']);
});

test('interaction work never accelerates the cloth clock above real time',async()=>{
 const c=clock(),trace=[];
 const loop=createFixedStepLoop(dt=>{trace.push({at:c.now(),dt});return trace.length<61;},c);loop.start();
 for(let i=0;i<61;i++)await c.next();
 assert.ok(Math.abs(trace[60].at-1000)<1e-8);assert.deepEqual(trace.map(s=>s.dt),Array(61).fill(1/60));assert.equal(c.pending,0);
});
