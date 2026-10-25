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

test('synchronizing only before drawing preserves every displayed deformation byte',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/models/hanging-long-sleeve-simulation.json',import.meta.url)));
 const eager=createSurfaceRig(data,{mass:1.1,drag:1.9},'eager-sync'),onDraw=createSurfaceRig(data,{mass:1.1,drag:1.9},'draw-sync');
 try{for(let frame=0;frame<100;frame++){
  const pose={x:.25*Math.sin(frame/19),y:1.65,z:0,yaw:-1.43+Math.min(1,frame/55)*1.4,roll:.008*Math.sin(frame/13),pitch:.005*Math.cos(frame/11)};
  eager.update(1/60,pose,false,true);onDraw.update(1/60,pose,false,true);eager.sync();
  if(frame%3===0||frame===99){onDraw.sync();assert.deepEqual(onDraw.texture.image.data,eager.texture.image.data,'draw frame '+frame);assert.deepEqual(onDraw.solver.position,eager.solver.position,'unchanged physical trajectory');}
 }}finally{eager.dispose();onDraw.dispose();}
});


test('pure layout translation preserves the displayed field without reuploading a sleeping rig',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/models/hanging-long-sleeve-simulation.json',import.meta.url))),rig=createSurfaceRig(data,{},'layout-cache');
 try{
  const pose={x:0,y:1.65,z:0,yaw:-1.43};rig.update(1/60,pose,false,true);rig.sync();const version=rig.texture.version,original=rig.texture.image.data.slice();
  for(let frame=1;frame<=12;frame++){rig.update(1/60,{...pose,x:frame*.05},false,true,1,.05);rig.sync();assert.equal(rig.texture.version,version);assert.deepEqual(rig.texture.image.data,original);}
  rig.update(1/60,{...pose,x:.6,yaw:-1.35},false,true);rig.sync();assert.ok(rig.texture.version>version,'real deformation must still upload');
 }finally{rig.dispose();}
});
