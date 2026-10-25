import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import{createSurfaceRig}from'../src/surface-rig.js';

test('one neighbor traversal preserves the original per-axis Float32 smoothing exactly',()=>{
  for(const file of['short-sleeve','hanging-long-sleeve']){
    const data=JSON.parse(readFileSync(new URL('../public/models/'+file+'-simulation.json',import.meta.url))),rig=createSurfaceRig(data,{},file),s=rig.solver;
    const neighbors=Array.from({length:s.count},()=>new Set());for(const c of s.contactLinks){neighbors[c.a].add(c.b);neighbors[c.b].add(c.a);}
    try{
      for(let field=0;field<20;field++){
        for(let i=0;i<s.offsets.length;i++)s.offsets[i]=Math.sin(i*1.79+field*.31)*.2+Math.cos(i*.08-field)*.07;
        let source=new Float32Array(s.offsets);
        for(let pass=0;pass<5;pass++){
          const target=new Float32Array(source.length);
          for(let node=0;node<s.count;node++)for(let k=0;k<3;k++){
            const i=node*3+k;if(!s.inverseMass[node])continue;
            let sum=0;for(const other of neighbors[node])sum+=source[other*3+k];
            target[i]=source[i]*.40+(neighbors[node].size?sum/neighbors[node].size:source[i])*.60;
          }
          source=target;
        }
        const expected=new Float32Array(rig.texture.image.data);
        for(let node=0;node<s.count;node++)for(let k=0;k<3;k++)expected[node*4+k]=source[node*3+k];
        s.version++;rig.sync();assert.deepEqual(rig.texture.image.data,expected,file+' field '+field);
      }
    }finally{rig.dispose();}
  }
});
