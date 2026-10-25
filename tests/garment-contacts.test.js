import test from 'node:test';
import assert from 'node:assert/strict';
import {GarmentContacts} from '../src/garment-contacts.js';
function sheet(z,nextZ=z,inverse=1){
 const rest=new Float64Array([-.5,-1,z,.5,-1,z,-.5,0,z,.5,0,z]),position=new Float64Array(rest),velocity=new Float64Array(12);for(let i=0;i<4;i++){position[i*3+2]=nextZ;velocity[i*3+2]=(nextZ-z)*60;}
 return{rest,position,previous:new Float64Array(rest),velocity,inverseMass:new Float64Array(4).fill(inverse),triangles:new Uint32Array([0,1,2,1,3,2]),count:4,initialized:true,asleep:false,version:0,stillFrames:0,localUpdates:0,updateLocal(){this.localUpdates++;}};
}
const averageZ=s=>[2,5,8,11].reduce((sum,k)=>sum+s.position[k],0)/4;
test('separate garments exchange contact without needing a shared rest shape',()=>{
 const a=sheet(.05,-.05),b=sheet(0,0,.25),contacts=new GarmentContacts({friction:0});const beforeA=averageZ(a),beforeB=averageZ(b);assert.ok(contacts.step([a,b],1/60)>0);assert.ok(averageZ(a)>averageZ(b));
 const light=averageZ(a)-beforeA,heavy=beforeB-averageZ(b);assert.ok(light>heavy*3.9&&light<heavy*4.1);assert.ok(a.localUpdates&&b.localUpdates);
 const momentum=[a,b].reduce((sum,s)=>sum+[2,5,8,11].reduce((v,k)=>v+s.velocity[k]/s.inverseMass[k/3|0],0),0);assert.ok(Math.abs(momentum+24)<1e-8);
});
test('a kinematic support keeps its position while the other garment yields',()=>{
 const a=sheet(.05,-.05,0),b=sheet(0),before=new Float64Array(a.position);assert.ok(new GarmentContacts().step([a,b],1/60)>0);assert.deepEqual(a.position,before);assert.ok(averageZ(b)<-.05);
});
test('an incoming garment wakes a sleeping neighboring cloth',()=>{
 const a=sheet(.05,-.05),b=sheet(0);b.asleep=true;b.stillFrames=90;new GarmentContacts().step([a,b],1/60);assert.equal(b.asleep,false);assert.equal(b.stillFrames,0);assert.ok(b.velocity.some(v=>Math.abs(v)>.01));
});
test('separated garments bypass narrow phase and keep their original velocities',()=>{
 const a=sheet(.2,.19),b=sheet(-.2),before=new Float64Array(a.velocity),contacts=new GarmentContacts();assert.equal(contacts.step([a,b],1/60),0);assert.equal(contacts.checkedPairs,0);assert.deepEqual(a.velocity,before);
});
