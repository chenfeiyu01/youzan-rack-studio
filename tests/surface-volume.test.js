import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CageVolumeProjection} from '../src/surface-volume.js';
import {makeFlowLayout,createFlowReference} from '../src/surface-flow-grid.js';
import {createSurfaceRig} from '../src/surface-rig.js';
const read=file=>JSON.parse(readFileSync(new URL(file,import.meta.url))),data=read('../public/models/hanging-long-sleeve-simulation.json'),layout=makeFlowLayout(data),fixture=read('./fixtures/invalid-long-cage.json');
const det=(u,v,w)=>u[0]*(v[1]*w[2]-v[2]*w[1])-u[1]*(v[0]*w[2]-v[2]*w[0])+u[2]*(v[0]*w[1]-v[1]*w[0]);
function minimum(field,grid=layout){const [nx,ny,nz]=grid.dimensions,p=grid.positions,orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];let result=Infinity;
 for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++)for(const order of orders){const c=[x,y,z],rest=[],deformed=[];for(let j=0;j<4;j++){if(j)c[order[j-1]]++;const id=c[2]*ny*nx+c[1]*nx+c[0],r=Array.from(p.slice(id*3,id*3+3));rest.push(r);deformed.push(r.map((v,k)=>v+field[id*4+k]));}const edges=v=>[1,2,3].map(j=>v[j].map((value,k)=>value-v[0][k]));result=Math.min(result,det(...edges(deformed))/det(...edges(rest)));}return result;
}

test('valid display fields are returned byte-for-byte without a blanket motion reduction',()=>{
 const projector=new CageVolumeProjection(layout),field=new Float32Array(layout.positions.length/3*4);for(let i=0;i<field.length/4;i++){const p=layout.positions;field[i*4]=.005*Math.sin(p[i*3]);field[i*4+1]=.004*Math.sin(p[i*3+1]);field[i*4+2]=.002*Math.cos(p[i*3+2]);}
 assert.ok(minimum(field)>.9);const before=field.slice();assert.equal(projector.project(field),field);assert.deepEqual(field,before);assert.equal(projector.lastStats.changed,false);
});

test('the frozen collapsed long-sleeve cell is separated locally while its supported top stays fixed',()=>{
 const field=new Float32Array(fixture.field),before=field.slice(),projector=new CageVolumeProjection(layout);assert.ok(minimum(field)<-.005,'retain the actual unprojected inversion');projector.project(field);
 assert.ok(minimum(field)>.0399);assert.equal(projector.lastStats.changed,true);assert.ok(projector.lastStats.maxCorrection<.01);assert.ok(projector.lastStats.rmsCorrection<.0003);
 for(let i=0;i<projector.free.length;i++){assert.equal(field[i*4+3],before[i*4+3]);if(!projector.free[i])for(let k=0;k<3;k++)assert.equal(field[i*4+k],before[i*4+k],'the fixed shoulder plane cannot move');}
});

test('the geometric volume barrier scales with the garment instead of adding a fixed-size correction',()=>{
 const scale=2.5,a=new Float32Array(fixture.field),b=a.map((v,i)=>i%4===3?v:v*scale),larger={...layout,positions:layout.positions.map(v=>v*scale),lo:layout.lo.map(v=>v*scale),hi:layout.hi.map(v=>v*scale)};
 new CageVolumeProjection(layout).project(a);new CageVolumeProjection(larger).project(b);let maximum=0;for(let i=0;i<a.length;i++)if(i%4!==3)maximum=Math.max(maximum,Math.abs(b[i]/scale-a[i]));assert.ok(maximum<1e-6,maximum);assert.ok(minimum(b,larger)>.0399);
});

test('long-sleeve GPU uniforms upload the projected CPU field without a readback or unsupported float target',()=>{
 const rig=createSurfaceRig(data,{},'long-volume-upload',{flow:true}),source=rig.texture.image.data;source.set(fixture.sourceOffsets);rig.texture.needsUpdate=true;const reference=createFlowReference(data);reference.update(source);
 try{rig.prepare({get extensions(){throw Error('long sleeves do not require a float-render-target check');}});const texture=rig.flow.uniforms.uFlowGrid.value;assert.equal(rig.flow.supported,false);assert.deepEqual(texture.image.data,reference.pixels);assert.ok(minimum(texture.image.data)>.0399);rig.prepare({});assert.equal(rig.flow.uniforms.uFlowGrid.value,texture,'unchanged fields reuse their upload');}finally{rig.dispose();}
});
