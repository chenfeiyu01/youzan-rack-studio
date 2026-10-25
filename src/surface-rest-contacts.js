// The decimated proxy can contain intersections already present in the source
// (folds, seam strips). They cannot be assigned a new collision side at runtime.
// Exclude only those original primitive pairs; new contacts remain enabled.
function segmentTriangle(p,u,v,a,b,c){
 const i=u*3,j=v*3,k=a*3,l=b*3,m=c*3,dx=p[j]-p[i],dy=p[j+1]-p[i+1],dz=p[j+2]-p[i+2],ex=p[l]-p[k],ey=p[l+1]-p[k+1],ez=p[l+2]-p[k+2],fx=p[m]-p[k],fy=p[m+1]-p[k+1],fz=p[m+2]-p[k+2];
 const hx=dy*fz-dz*fy,hy=dz*fx-dx*fz,hz=dx*fy-dy*fx,det=ex*hx+ey*hy+ez*hz;if(Math.abs(det)<1e-12)return false;
 const rx=p[i]-p[k],ry=p[i+1]-p[k+1],rz=p[i+2]-p[k+2],s=(rx*hx+ry*hy+rz*hz)/det;if(s<0||s>1)return false;
 const qx=ry*ez-rz*ey,qy=rz*ex-rx*ez,qz=rx*ey-ry*ex,t=(dx*qx+dy*qy+dz*qz)/det;if(t<0||s+t>1)return false;
 const fraction=(fx*qx+fy*qy+fz*qz)/det;return fraction>1e-6&&fraction<1-1e-6;
}
export function initialContactExclusions(data,edges){
 const p=data.positions,t=data.triangles,count=p.length/3,n=t.length/3,cell=.18,grid=new Map(),seen=new Set(),faces=Array.from({length:count},()=>new Set()),edgePairs=new Set(),edgeIds=new Map(),faceEdges=[];
 for(let e=0;e<edges.length/2;e++){const a=edges[e*2],b=edges[e*2+1];edgeIds.set(a<b?a+':'+b:b+':'+a,e);}
 for(let face=0;face<n;face++){
  const ids=Array.from(t.slice(face*3,face*3+3)),coordinates=[0,1,2].map(axis=>ids.map(i=>p[i*3+axis]));
  faceEdges[face]=ids.map((a,k)=>{const b=ids[(k+1)%3];return edgeIds.get(a<b?a+':'+b:b+':'+a);});
  for(let x=Math.floor(Math.min(...coordinates[0])/cell);x<=Math.floor(Math.max(...coordinates[0])/cell);x++)for(let y=Math.floor(Math.min(...coordinates[1])/cell);y<=Math.floor(Math.max(...coordinates[1])/cell);y++)for(let z=Math.floor(Math.min(...coordinates[2])/cell);z<=Math.floor(Math.max(...coordinates[2])/cell);z++){
   const key=((x&1023)<<20)|((y&1023)<<10)|(z&1023),list=grid.get(key)??[];
   for(const other of list){const pair=other*n+face;if(seen.has(pair))continue;seen.add(pair);const q=Array.from(t.slice(other*3,other*3+3));if(ids.some(i=>q.includes(i)))continue;
    const intersect=ids.some((u,k)=>segmentTriangle(p,u,ids[(k+1)%3],...q))||q.some((u,k)=>segmentTriangle(p,u,q[(k+1)%3],...ids));if(!intersect)continue;
    for(const i of ids)faces[i].add(other);for(const i of q)faces[i].add(face);
    for(const a of faceEdges[face])for(const b of faceEdges[other])edgePairs.add(Math.min(a,b)*(edges.length/2)+Math.max(a,b));
   }
   list.push(face);grid.set(key,list);
  }
 }
 return{faces,edgePairs};
}
