import {SurfaceContacts} from './surface-contact.js';
function sweptBounds(solver){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],p=solver.position,old=solver.previous;
  for(let i=0;i<p.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[i+k],old[i+k]);max[k]=Math.max(max[k],p[i+k],old[i+k]);}
  return{min,max};
}
function overlaps(a,b,gap){return[0,1,2].every(k=>a.min[k]<=b.max[k]+gap&&b.min[k]<=a.max[k]+gap);}
function makePair(a,b,gap){
  const size=a.position.length+b.position.length,count=a.count+b.count,positions=new Float64Array(size),groups=new Uint8Array(count),triangles=new Uint32Array(a.triangles.length+b.triangles.length),weights=new Float64Array(count);
  positions.set(a.rest);positions.set(b.rest,a.rest.length);groups.fill(1,a.count);triangles.set(a.triangles);triangles.set(Array.from(b.triangles,i=>i+a.count),a.triangles.length);
  // Undo each solver's particle-count mass normalization before sharing force.
  for(let i=0;i<a.count;i++)weights[i]=a.inverseMass[i]*a.count;
  for(let i=0;i<b.count;i++)weights[a.count+i]=b.inverseMass[i]*b.count;
  const data={positions,triangles,groups,thickness:gap};
  return{contact:new SurfaceContacts(data,weights),old:new Float64Array(size),p:new Float64Array(size),v:new Float64Array(size)};
}
// Internal stretching and bending remain in each garment's own solver.
// This stage transfers contact between independent garment surfaces.
export class GarmentContacts{
  constructor({gap=.012,friction=.35}={}){this.gap=gap;this.friction=friction;this.cache=new WeakMap();this.contacts=0;this.checkedPairs=0;}
  step(solvers){
    this.contacts=0;this.checkedPairs=0;
    const active=solvers.filter(s=>s?.initialized),bounds=active.map(sweptBounds);
    for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
      if(!overlaps(bounds[i],bounds[j],this.gap)||active[i].asleep&&active[j].asleep)continue;
      const a=active[i],b=active[j];let list=this.cache.get(a);if(!list){list=new WeakMap();this.cache.set(a,list);}let pair=list.get(b);if(!pair){pair=makePair(a,b,this.gap);list.set(b,pair);}
      this.checkedPairs++;const{old,p,v,contact}=pair,n=a.position.length;
      old.set(a.previous);old.set(b.previous,n);p.set(a.position);p.set(b.position,n);v.set(a.velocity);v.set(b.velocity,n);
      const region=[0,1,2].map(k=>Math.max(bounds[i].min[k],bounds[j].min[k])-this.gap).concat([0,1,2].map(k=>Math.min(bounds[i].max[k],bounds[j].max[k])+this.gap));
      const count=contact.solve(old,p,1,region);this.contacts+=count;if(!count)continue;
      contact.applyVelocities(v,p,this.friction);
      for(const[solver,start]of[[a,0],[b,n]]){
        let changed=false;
        for(let k=0;k<solver.position.length;k++){if(Math.abs(p[start+k]-solver.position[k])>1e-10||Math.abs(v[start+k]-solver.velocity[k])>1e-8)changed=true;solver.position[k]=p[start+k];solver.velocity[k]=v[start+k];}
        if(changed){solver.asleep=false;solver.stillFrames=0;solver.version++;solver.updateLocal();}
      }
    }
    return this.contacts;
  }
}
