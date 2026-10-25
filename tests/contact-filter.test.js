import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import{SurfaceCloth}from'../src/surface-physics.js';

test('compiled contact exclusions match every original vertex-face and ordered edge pair',()=>{
  for(const file of['short-sleeve','hanging-long-sleeve']){
    const data=JSON.parse(readFileSync(new URL('../public/models/'+file+'-simulation.json',import.meta.url))),s=new SurfaceCloth(data),c=s.contacts,{masks,excluded,original}=c.shared,t=c.triangles,e=c.edges;
    for(let node=0;node<c.count;node++)for(let face=0;face<c.faceCount;face++){
      const expected=original.faces[node].has(face)||excluded[node].has(t[face*3])||excluded[node].has(t[face*3+1])||excluded[node].has(t[face*3+2]);
      const actual=Boolean(masks.faces[node*masks.faceWords+(face>>>5)]&(1<<(face&31)));
      if(actual!==expected)assert.fail(file+' vertex '+node+' face '+face);
    }
    for(let a=0;a<c.edgeCount;a++)for(let b=a+1;b<c.edgeCount;b++){
      const x=e[a*2],y=e[a*2+1],u=e[b*2],v=e[b*2+1];
      const expected=original.edgePairs.has(a*c.edgeCount+b)||excluded[x].has(u)||excluded[x].has(v)||excluded[y].has(u)||excluded[y].has(v);
      const actual=Boolean(masks.pairs[a*masks.edgeWords+(b>>>5)]&(1<<(b&31)));
      if(actual!==expected)assert.fail(file+' edge pair '+a+' '+b);
    }
  }
});
