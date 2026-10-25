// Match full panel boundaries, including unequal tessellation, with
// point-to-edge seams. Separate UV panels still form one continuous textile.
const cache=new WeakMap();
export function buildSurfaceSeams(data){
  if(cache.has(data))return cache.get(data);
  const p=data.positions,t=data.triangles,count=p.length/3,edges=new Map(),parent=Array.from({length:count},(_,i)=>i),root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
  for(let i=0;i<t.length;i+=3)for(let k=0;k<3;k++){
    const a=t[i+k],b=t[i+(k+1)%3],key=a<b?a+':'+b:b+':'+a;parent[root(a)]=root(b);const edge=edges.get(key);if(edge)edge.count++;else edges.set(key,{a,b,count:1});
  }
  const boundary=[...edges.values()].filter(e=>e.count===1),nodes=new Set(boundary.flatMap(e=>[e.a,e.b])),seams=[];
  for(const a of nodes){
    const i=a*3,component=root(a);let best=null,bestDistance=.035*.035;
    for(const edge of boundary){
      if(root(edge.a)===component)continue;const j=edge.a*3,k=edge.b*3,dx=p[k]-p[j],dy=p[k+1]-p[j+1],dz=p[k+2]-p[j+2],length=dx*dx+dy*dy+dz*dz;if(length<1e-16)continue;
      const fraction=Math.max(0,Math.min(1,((p[i]-p[j])*dx+(p[i+1]-p[j+1])*dy+(p[i+2]-p[j+2])*dz)/length)),x=p[i]-p[j]-fraction*dx,y=p[i+1]-p[j+1]-fraction*dy,z=p[i+2]-p[j+2]-fraction*dz,distance=x*x+y*y+z*z;
      if(distance<bestDistance){bestDistance=distance;best={a,b:edge.a,c:edge.b,fraction,length:Math.sqrt(distance),compliance:.00000002};}
    }
    if(best)seams.push(best);
  }
  cache.set(data,seams);return seams;
}
