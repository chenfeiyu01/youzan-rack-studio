// Internal edge dashpots dissipate stretch-rate noise. Central, equal/opposite
// impulses preserve total linear/angular momentum of free cloth; translation
// and rigid rotation have zero edge strain rate and remain untouched.
export class SurfaceDamping {
  constructor(data){
    const edges=new Map(),degree=new Uint16Array(data.positions.length/3);
    for(let i=0;i<data.triangles.length;i+=3){
      const t=data.triangles;
      for(const[a,b]of[[t[i],t[i+1]],[t[i+1],t[i+2]],[t[i+2],t[i]]]){
        const key=a<b?a+':'+b:b+':'+a;if(a!==b&&!edges.has(key)){edges.set(key,{a,b});degree[a]++;degree[b]++;}
      }
    }
    this.edges=[...edges.values()].map(e=>({...e,degree:Math.max(degree[e.a],degree[e.b])}));
    this.decay=new Float64Array(Math.max(...degree)+1);this.lastTime=-1;this.lastRate=-1;
  }
  step(p,v,w,dt,rate=12){
    if(!(dt>0&&rate>0))return;
    if(dt!==this.lastTime||rate!==this.lastRate){for(let d=1;d<this.decay.length;d++)this.decay[d]=-Math.expm1(-rate*dt/d);this.lastTime=dt;this.lastRate=rate;}
    // Symmetric half steps avoid favoring the triangle traversal direction.
    for(let pass=0;pass<2;pass++)for(let index=0;index<this.edges.length;index++){
      const e=this.edges[pass?this.edges.length-1-index:index],a=e.a*3,b=e.b*3,wa=w[e.a],wb=w[e.b],weight=wa+wb;if(!weight)continue;
      const x=p[a]-p[b],y=p[a+1]-p[b+1],z=p[a+2]-p[b+2],length2=x*x+y*y+z*z;if(length2<1e-16)continue;
      const speed=(v[a]-v[b])*x+(v[a+1]-v[b+1])*y+(v[a+2]-v[b+2])*z;
      const impulse=-speed*this.decay[e.degree]/(length2*weight);
      v[a]+=wa*x*impulse;v[a+1]+=wa*y*impulse;v[a+2]+=wa*z*impulse;
      v[b]-=wb*x*impulse;v[b+1]-=wb*y*impulse;v[b+2]-=wb*z*impulse;
    }
  }
}
