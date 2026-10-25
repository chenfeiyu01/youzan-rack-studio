import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSurfaceBinder,surfaceReferenceNormals} from '../src/surface-bindings.js';
function patch(){const positions=[];for(let y=0;y<5;y++)for(let x=0;x<5;x++)positions.push(x*.09+(y%2)*.023,y*.08,0);return{positions,triangles:[]};}
function field(p){return[.1*p[0]*p[0],.04*Math.sin(p[1]*4),.2*p[0]*p[1]+.01*Math.cos(p[0]*7)];}
function evaluate(data,p){const near=Array.from({length:data.positions.length/3},(_,id)=>({id,d:Math.hypot(...data.positions.slice(id*3,id*3+3).map((v,k)=>v-p[k]))})).sort((a,b)=>a.d-b.d).slice(0,12),radius=Math.max(.0001,near.at(-1).d*1.0001);let total=0;const sum=[0,0,0];for(const{id,d}of near){const s=Math.min(1,d/radius),w=(1-s)**4*(1+4*s),v=field(data.positions.slice(id*3,id*3+3));total+=w;for(let k=0;k<3;k++)sum[k]+=w*v[k];}return sum.map(v=>v/Math.max(total,1e-6));}
function channels(data,b){const out=Array.from({length:3},()=>[0,0,0]);for(let i=0;i<b.ids.length;i++){const v=field(data.positions.slice(b.ids[i]*3,b.ids[i]*3+3));for(let c=0;c<3;c++)for(let k=0;k<3;k++)out[c][k]+=v[k]*b.coefficients[i*4+c];}return out;}
test('surface probes keep the established displacement and include changing radius and neighbors in their directions',()=>{
 const data=patch(),p=[.175,.166,0],b=makeSurfaceBinder(data)(p,[0,0,1]),actual=channels(data,b),expected=evaluate(data,p);for(let k=0;k<3;k++)assert.ok(Math.abs(actual[0][k]-expected[k])<1e-8);
 for(const[direction,channel]of[[b.u,1],[b.v,2]]){const plus=evaluate(data,p.map((v,k)=>v+.04*direction[k])),minus=evaluate(data,p.map((v,k)=>v-.04*direction[k]));for(let k=0;k<3;k++)assert.ok(Math.abs(actual[channel][k]-(plus[k]-minus[k])/.08)<2e-7);}
});
test('constant translation introduces no spurious bend, even on a narrow proxy strip',()=>{
 for(const data of[patch(),{positions:Array.from({length:16},(_,i)=>[i*.02,0,0]).flat(),triangles:[]}]){const b=makeSurfaceBinder(data)([.154,.002,0],[0,0,1]),sum=[0,0,0];assert.ok(b.ids.length<=60);for(let i=0;i<b.ids.length;i++)for(let k=0;k<3;k++){const v=b.coefficients[i*4+k];assert.ok(Number.isFinite(v));sum[k]+=v;}assert.ok(Math.abs(sum[0]-1)<1e-6);assert.ok(Math.abs(sum[1])<1e-5);assert.ok(Math.abs(sum[2])<1e-5);}
});
test('split shading or UV vertices at the same position share the same deformation probes',()=>{const bind=makeSurfaceBinder(patch()),a=bind([.18,.16,0],[0,0,1]),b=bind([.18,.16,0],[0,.5,.866]);assert.equal(a,b);});
test('reference surface frames weld UV splits and remain finite on degenerate detail',()=>{const p=[-1,-1,0,1,-1,0,-1,1,0,1,-1,0,1,1,0,-1,1,0],n=surfaceReferenceNormals(p,null);for(let i=0;i<n.length;i+=3){assert.ok(Math.abs(n[i])<1e-6);assert.ok(Math.abs(n[i+1])<1e-6);assert.ok(Math.abs(n[i+2]-1)<1e-6);}assert.ok(surfaceReferenceNormals([0,0,0,0,0,0,0,0,0],null).every(Number.isFinite));});
