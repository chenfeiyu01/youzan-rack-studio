import {initialContactExclusions} from './surface-rest-contacts.js';
// Continuous point/triangle contact for the moving cloth surface. Both the point
// and the three triangle vertices move during a step; their signed volume is a
// cubic in time. Endpoint distance tests alone can miss a crossing and return.
const dot=(ax,ay,az,bx,by,bz)=>ax*bx+ay*by+az*bz;
const evaluate=(c,t)=>((c[3]*t+c[2])*t+c[1])*t+c[0];
export function cubicRoots01(c){
  const cuts=[0,1],a=3*c[3],b=2*c[2],d=c[1],epsilon=1e-14;
  if(Math.abs(a)<epsilon){if(Math.abs(b)>epsilon){const t=-d/b;if(t>0&&t<1)cuts.push(t);}}
  else{const disc=b*b-4*a*d;if(disc>=0){const root=Math.sqrt(disc);for(const t of[(-b-root)/(2*a),(-b+root)/(2*a)])if(t>0&&t<1)cuts.push(t);}}
  cuts.sort((a,b)=>a-b);const roots=[];
  for(let i=0;i<cuts.length-1;i++){
    let lo=cuts[i],hi=cuts[i+1],f0=evaluate(c,lo),f1=evaluate(c,hi);
    if(Math.abs(f0)<epsilon&&lo>1e-6&&!roots.some(r=>Math.abs(r-lo)<1e-5))roots.push(lo);
    if(f0*f1>=0)continue;
    for(let k=0;k<24;k++){const mid=(lo+hi)*.5,f=evaluate(c,mid);if(f0*f<=0){hi=mid;f1=f;}else{lo=mid;f0=f;}}
    const root=(lo+hi)*.5;if(root>1e-6&&root<=1&&!roots.some(r=>Math.abs(r-root)<1e-5))roots.push(root);
  }
  if(Math.abs(evaluate(c,1))<epsilon&&!roots.some(r=>Math.abs(r-1)<1e-5))roots.push(1);
  return roots.sort((a,b)=>a-b);
}
function segmentDistanceSq(px,py,pz,ax,ay,az,bx,by,bz){const dx=bx-ax,dy=by-ay,dz=bz-az,len=dot(dx,dy,dz,dx,dy,dz),t=len>1e-20?Math.max(0,Math.min(1,dot(px-ax,py-ay,pz-az,dx,dy,dz)/len)):0;return(px-ax-t*dx)**2+(py-ay-t*dy)**2+(pz-az-t*dz)**2;}
function restDistance(p,node,t,a,b,c){
  const i=node*3,j=a*3,k=b*3,l=c*3,ax=t[j],ay=t[j+1],az=t[j+2],bx=t[k],by=t[k+1],bz=t[k+2],cx=t[l],cy=t[l+1],cz=t[l+2],px=p[i],py=p[i+1],pz=p[i+2];
  const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az,rx=px-ax,ry=py-ay,rz=pz-az;
  const uu=dot(ux,uy,uz,ux,uy,uz),uv=dot(ux,uy,uz,vx,vy,vz),vv=dot(vx,vy,vz,vx,vy,vz),ru=dot(rx,ry,rz,ux,uy,uz),rv=dot(rx,ry,rz,vx,vy,vz),den=uu*vv-uv*uv;
  if(den>1e-18){const u=(ru*vv-rv*uv)/den,v=(rv*uu-ru*uv)/den;if(u>=0&&v>=0&&u+v<=1){const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;return Math.abs(dot(rx,ry,rz,nx,ny,nz))/Math.sqrt(dot(nx,ny,nz,nx,ny,nz));}}
  return Math.sqrt(Math.min(segmentDistanceSq(px,py,pz,ax,ay,az,bx,by,bz),segmentDistanceSq(px,py,pz,bx,by,bz,cx,cy,cz),segmentDistanceSq(px,py,pz,cx,cy,cz,ax,ay,az)));
}
function edgeDistance(p,a,b,c,d){
  const i=a*3,j=b*3,k=c*3,l=d*3,ux=p[j]-p[i],uy=p[j+1]-p[i+1],uz=p[j+2]-p[i+2],vx=p[l]-p[k],vy=p[l+1]-p[k+1],vz=p[l+2]-p[k+2],rx=p[i]-p[k],ry=p[i+1]-p[k+1],rz=p[i+2]-p[k+2];
  const aa=dot(ux,uy,uz,ux,uy,uz),bb=dot(ux,uy,uz,vx,vy,vz),ee=dot(vx,vy,vz,vx,vy,vz),cc=dot(ux,uy,uz,rx,ry,rz),ff=dot(vx,vy,vz,rx,ry,rz),den=aa*ee-bb*bb;
  if(aa<1e-18||ee<1e-18)return Infinity;
  const clamp=x=>Math.max(0,Math.min(1,x));let u=den>1e-18?clamp((bb*ff-cc*ee)/den):0,v=(bb*u+ff)/ee;
  if(v<0){v=0;u=clamp(-cc/aa);}else if(v>1){v=1;u=clamp((bb-cc)/aa);}
  return Math.sqrt((rx+u*ux-v*vx)**2+(ry+u*uy-v*vy)**2+(rz+u*uz-v*vz)**2);
}

// Compile only static topological exclusions. Continuous crossing tests and
// sequential projection order remain unchanged. Shared by matching geometry.
function contactMasks(count,triangles,edges,excluded,original){
  const faceWords=Math.ceil(triangles.length/3/32),edgeWords=Math.ceil(edges.length/2/32),faces=new Uint32Array(count*faceWords),pairs=new Uint32Array(edges.length/2*edgeWords);
  const incidentFaces=Array.from({length:count},()=>[]),incidentEdges=Array.from({length:count},()=>[]);
  for(let f=0;f<triangles.length/3;f++)for(let k=0;k<3;k++)incidentFaces[triangles[f*3+k]].push(f);
  for(let e=0;e<edges.length/2;e++){incidentEdges[edges[e*2]].push(e);incidentEdges[edges[e*2+1]].push(e);}
  for(let node=0;node<count;node++){
    const offset=node*faceWords;
    for(const other of excluded[node])for(const face of incidentFaces[other])faces[offset+(face>>>5)]|=1<<(face&31);
    for(const face of original.faces[node])faces[offset+(face>>>5)]|=1<<(face&31);
  }
  for(let e=0;e<edges.length/2;e++){
    const offset=e*edgeWords;
    for(let k=0;k<2;k++)for(const other of excluded[edges[e*2+k]])for(const edge of incidentEdges[other])pairs[offset+(edge>>>5)]|=1<<(edge&31);
  }
  const edgeCount=edges.length/2;
  for(const key of original.edgePairs){const a=Math.floor(key/edgeCount),b=key%edgeCount;pairs[a*edgeWords+(b>>>5)]|=1<<(b&31);}
  return{faceWords,edgeWords,faces,pairs};
}
// Reuse sparse word buckets between scans; count retains array storage.
class ContactWordGrid{
 constructor(){this.cells=new Map();this.pool=[];this.used=0;}
 reset(){this.cells.clear();this.used=0;}
 get(key){return this.cells.get(key);}
 add(key,id){let bucket=this.cells.get(key);if(!bucket){bucket=this.pool[this.used];if(!bucket)this.pool[this.used]={words:[],bits:[],count:0};bucket=this.pool[this.used++];bucket.count=0;this.cells.set(key,bucket);}const word=id>>>5,bit=1<<(id&31),last=bucket.count-1;if(last>=0&&bucket.words[last]===word)bucket.bits[last]|=bit;else{bucket.words[bucket.count]=word;bucket.bits[bucket.count++]=bit;}}
}
const shared=new WeakMap();
export class SurfaceContacts{
  constructor(data,inverseMass,constraints=[],friction=null){
    if(friction&&(![friction.static,friction.dynamic].every(x=>Number.isFinite(x)&&x>=0)||friction.dynamic>friction.static))throw new RangeError('接触摩擦须满足 0 ≤ dynamic ≤ static');
    this.friction=friction;this.previous=null;this.faceGrid=new ContactWordGrid();this.edgeGrid=new ContactWordGrid();
    this.rest=data.positions;this.triangles=data.triangles;this.groups=data.groups;this.thickness=data.thickness??.008;this.weights=inverseMass;this.count=this.rest.length/3;this.faceCount=this.triangles.length/3;this.faceGroups=this.groups?Array.from({length:this.faceCount},(_,i)=>this.groups[this.triangles[i*3]]):null;
    if(data.edges)this.edges=data.edges;
    else{const seen=new Set(),edges=[];for(let i=0;i<this.triangles.length;i+=3){const tri=this.triangles.slice(i,i+3);for(let k=0;k<3;k++){const a=tri[k],b=tri[(k+1)%3],key=a<b?a+':'+b:b+':'+a;if(!seen.has(key)){seen.add(key);edges.push(a,b);}}}this.edges=edges;}
    this.edgeCount=this.edges.length/2;this.edgeActive=new Uint8Array(this.edgeCount);this.edgeStamps=new Int32Array(Math.ceil(this.edgeCount/32));this.edgeSeen=new Uint32Array(Math.ceil(this.edgeCount/32));this.edgeBounds=new Float64Array(this.edgeCount*6);this.edgeStamp=0;
    if(!shared.has(data)&&this.groups){
      shared.set(data,{excluded:Array.from({length:this.count},()=>new Set()),original:{faces:Array.from({length:this.count},()=>new Set()),edgePairs:new Set()},restGaps:new Map(),edgeGaps:new Map()});
    }
    if(!shared.has(data)){
      const graph=Array.from({length:this.count},()=>new Set());for(let i=0;i<this.edges.length;i+=2){graph[this.edges[i]].add(this.edges[i+1]);graph[this.edges[i+1]].add(this.edges[i]);}for(const c of constraints){graph[c.a].add(c.b);graph[c.b].add(c.a);}
      const excluded=graph.map((neighbors,i)=>{const result=new Set(neighbors);result.add(i);for(const a of neighbors)for(const b of graph[a])result.add(b);return result;});
      shared.set(data,{excluded,original:initialContactExclusions(data,this.edges),restGaps:new Map(),edgeGaps:new Map()});
    }
    this.shared=shared.get(data);
    if(!this.groups)this.shared.masks??=contactMasks(this.count,this.triangles,this.edges,this.shared.excluded,this.shared.original);
    this.bounds=new Float64Array(this.faceCount*6);this.stamps=new Int32Array(Math.ceil(this.faceCount/32));this.faceSeen=new Uint32Array(Math.ceil(this.faceCount/32));this.stamp=0;this.contacts=[];this.candidateChecks=0;
  }
  solve(previous,current,scale=1,region=null){
    this.region=region;this.previous=previous;
    const triangles=this.triangles,w=this.weights,masks=this.shared.masks,grid=this.faceGrid,cell=.18*scale,thickness=this.thickness*scale,bounds=this.bounds;this.contacts=[];this.candidateChecks=0;
    const key=(x,y,z)=>((x&1023)<<20)|((y&1023)<<10)|(z&1023);grid.reset();
    for(let face=0;face<this.faceCount;face++){
      const a=triangles[face*3]*3,b=triangles[face*3+1]*3,c=triangles[face*3+2]*3,j=face*6;
      for(let axis=0;axis<3;axis++){bounds[j+axis]=Math.min(previous[a+axis],previous[b+axis],previous[c+axis],current[a+axis],current[b+axis],current[c+axis])-thickness;bounds[j+3+axis]=Math.max(previous[a+axis],previous[b+axis],previous[c+axis],current[a+axis],current[b+axis],current[c+axis])+thickness;}
      if(region&&(bounds[j]>region[3]||bounds[j+3]<region[0]||bounds[j+1]>region[4]||bounds[j+4]<region[1]||bounds[j+2]>region[5]||bounds[j+5]<region[2]))continue;
      const cellMinX=Math.floor(bounds[j]/cell),cellMinY=Math.floor(bounds[j+1]/cell),cellMinZ=Math.floor(bounds[j+2]/cell),cellMaxX=Math.floor(bounds[j+3]/cell),cellMaxY=Math.floor(bounds[j+4]/cell),cellMaxZ=Math.floor(bounds[j+5]/cell);
      for(let x=cellMinX;x<=cellMaxX;x++)for(let y=cellMinY;y<=cellMaxY;y++)for(let z=cellMinZ;z<=cellMaxZ;z++){
        grid.add(key(x,y,z),face);
      }
    }
    for(let node=0;node<this.count;node++){
      const i=node*3,minX=Math.min(previous[i],current[i])-thickness,maxX=Math.max(previous[i],current[i])+thickness,minY=Math.min(previous[i+1],current[i+1])-thickness,maxY=Math.max(previous[i+1],current[i+1])+thickness,minZ=Math.min(previous[i+2],current[i+2])-thickness,maxZ=Math.max(previous[i+2],current[i+2])+thickness;
      if(region&&(minX>region[3]||maxX<region[0]||minY>region[4]||maxY<region[1]||minZ>region[5]||maxZ<region[2]))continue;
      if(++this.stamp>=2147483647){this.stamps.fill(0);this.stamp=1;}
      const cellMinX=Math.floor(minX/cell),cellMinY=Math.floor(minY/cell),cellMinZ=Math.floor(minZ/cell),cellMaxX=Math.floor(maxX/cell),cellMaxY=Math.floor(maxY/cell),cellMaxZ=Math.floor(maxZ/cell);
      for(let x=cellMinX;x<=cellMaxX;x++)for(let y=cellMinY;y<=cellMaxY;y++)for(let z=cellMinZ;z<=cellMaxZ;z++){
        const faces=grid.get(key(x,y,z));if(!faces)continue;
        for(let block=0;block<faces.count;block++){
          const word=faces.words[block],bits=faces.bits[block],seen=this.stamps[word]===this.stamp?this.faceSeen[word]:0;
          this.stamps[word]=this.stamp;this.faceSeen[word]=seen|bits;
          let candidates=bits&~seen;if(masks)candidates&=~masks.faces[node*masks.faceWords+word];
          while(candidates!==0){
          const bit=candidates&-candidates,face=(word<<5)+31-Math.clz32(bit);candidates^=bit;
          if(this.groups&&this.groups[node]===this.faceGroups[face])continue;
          const a=triangles[face*3],b=triangles[face*3+1],c=triangles[face*3+2],j=face*6;
          if(minX>bounds[j+3]||maxX<bounds[j]||minY>bounds[j+4]||maxY<bounds[j+1]||minZ>bounds[j+5]||maxZ<bounds[j+2])continue;
          if(w[node]+w[a]+w[b]+w[c]===0)continue;
          this.candidateChecks++;
          const hit=this.crossing(node,a,b,c,previous,current,thickness*1.25);if(!hit)continue;
          const cacheKey=node*this.faceCount+face;let gap=this.groups?Infinity:this.shared.restGaps.get(cacheKey);
          if(gap===undefined){gap=restDistance(this.rest,node,this.rest,a,b,c);this.shared.restGaps.set(cacheKey,gap);}
          // Authored coincident seam faces have no consistent initial side.
          // They stay under the seam constraints rather than being blown apart.
          if(gap<.003||hit.near&&hit.distance>Math.min(thickness,gap*.4*scale)+1e-5)continue;
          this.contacts.push({node,a,b,c,bary:hit.bary,side:hit.side,gap:Math.min(thickness,gap*.4*scale)});
          }
        }
      }
    }
    this.edgeContacts(previous,current,scale);
    for(let iteration=0;iteration<2;iteration++)for(const contact of this.contacts)this.project(contact,current);
    return this.contacts.length;
  }
  crossing(node,a,b,c,old,p,nearDistance=.010){
    const i=node*3,j=a*3,k=b*3,l=c*3;
    const rx=old[i]-old[j],ry=old[i+1]-old[j+1],rz=old[i+2]-old[j+2],ux=old[k]-old[j],uy=old[k+1]-old[j+1],uz=old[k+2]-old[j+2],vx=old[l]-old[j],vy=old[l+1]-old[j+1],vz=old[l+2]-old[j+2];
    const drx=(p[i]-p[j])-rx,dry=(p[i+1]-p[j+1])-ry,drz=(p[i+2]-p[j+2])-rz,dux=(p[k]-p[j])-ux,duy=(p[k+1]-p[j+1])-uy,duz=(p[k+2]-p[j+2])-uz,dvx=(p[l]-p[j])-vx,dvy=(p[l+1]-p[j+1])-vy,dvz=(p[l+2]-p[j+2])-vz;
    const n0x=uy*vz-uz*vy,n0y=uz*vx-ux*vz,n0z=ux*vy-uy*vx;
    const n1x=duy*vz-duz*vy+uy*dvz-uz*dvy,n1y=duz*vx-dux*vz+uz*dvx-ux*dvz,n1z=dux*vy-duy*vx+ux*dvy-uy*dvx;
    const n2x=duy*dvz-duz*dvy,n2y=duz*dvx-dux*dvz,n2z=dux*dvy-duy*dvx;
    const c0=dot(rx,ry,rz,n0x,n0y,n0z),n0Length=Math.sqrt(dot(n0x,n0y,n0z,n0x,n0y,n0z));if(n0Length<1e-10||Math.abs(c0)/n0Length<1e-6)return null;
    const coefficients=[c0,dot(drx,dry,drz,n0x,n0y,n0z)+dot(rx,ry,rz,n1x,n1y,n1z),dot(drx,dry,drz,n1x,n1y,n1z)+dot(rx,ry,rz,n2x,n2y,n2z),dot(drx,dry,drz,n2x,n2y,n2z)];
    // Bernstein convex-hull bound rejects all no-root intervals, including
    // cases where endpoints share a sign but an interior extremum crosses zero.
    const b0=c0,b1=c0+coefficients[1]/3,b2=c0+2*coefficients[1]/3+coefficients[2]/3,b3=coefficients.reduce((a,b)=>a+b,0);
    const roots=Math.min(b0,b1,b2,b3)>0||Math.max(b0,b1,b2,b3)<0?[]:cubicRoots01(coefficients);
    for(const {t,near} of [...roots.map(t=>({t,near:false})),{t:1,near:true}]){
      const ax=ux+t*dux,ay=uy+t*duy,az=uz+t*duz,bx=vx+t*dvx,by=vy+t*dvy,bz=vz+t*dvz,px=rx+t*drx,py=ry+t*dry,pz=rz+t*drz;
      const aa=dot(ax,ay,az,ax,ay,az),ab=dot(ax,ay,az,bx,by,bz),bb=dot(bx,by,bz,bx,by,bz),pa=dot(px,py,pz,ax,ay,az),pb=dot(px,py,pz,bx,by,bz),den=aa*bb-ab*ab;if(den<1e-18)continue;
      const u=(pa*bb-pb*ab)/den,v=(pb*aa-pa*ab)/den;const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,distance=dot(px,py,pz,nx,ny,nz)/Math.sqrt(dot(nx,ny,nz,nx,ny,nz))*Math.sign(c0);
      if(near&&(distance<0||distance>nearDistance))continue;
      if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)return{bary:[1-u-v,u,v],side:Math.sign(c0),near,distance};
    }
    return null;
  }
  edgeContacts(old,p,scale){
    const edges=this.edges,bounds=this.edgeBounds,cell=.18*scale,thickness=this.thickness*scale,grid=this.edgeGrid,key=(x,y,z)=>((x&1023)<<20)|((y&1023)<<10)|(z&1023),masks=this.shared.masks,w=this.weights;
    const region=this.region;this.edgeActive.fill(0);grid.reset();
    for(let e=0;e<this.edgeCount;e++){
      const a=edges[e*2]*3,b=edges[e*2+1]*3,i=e*6;
      for(let axis=0;axis<3;axis++){bounds[i+axis]=Math.min(old[a+axis],old[b+axis],p[a+axis],p[b+axis])-thickness;bounds[i+3+axis]=Math.max(old[a+axis],old[b+axis],p[a+axis],p[b+axis])+thickness;}
      if(region&&(bounds[i]>region[3]||bounds[i+3]<region[0]||bounds[i+1]>region[4]||bounds[i+4]<region[1]||bounds[i+2]>region[5]||bounds[i+5]<region[2]))continue;
      this.edgeActive[e]=1;
      const cellMinX=Math.floor(bounds[i]/cell),cellMinY=Math.floor(bounds[i+1]/cell),cellMinZ=Math.floor(bounds[i+2]/cell),cellMaxX=Math.floor(bounds[i+3]/cell),cellMaxY=Math.floor(bounds[i+4]/cell),cellMaxZ=Math.floor(bounds[i+5]/cell);
      for(let x=cellMinX;x<=cellMaxX;x++)for(let y=cellMinY;y<=cellMaxY;y++)for(let z=cellMinZ;z<=cellMaxZ;z++){
        grid.add(key(x,y,z),e);
      }
    }
    for(let e=0;e<this.edgeCount;e++){
      if(!this.edgeActive[e])continue;
      const a=edges[e*2],b=edges[e*2+1],i=e*6,firstWord=e>>>5,maskBase=masks?e*masks.edgeWords:0;
      if(++this.edgeStamp>=2147483647){this.edgeStamps.fill(0);this.edgeStamp=1;}
      const cellMinX=Math.floor(bounds[i]/cell),cellMinY=Math.floor(bounds[i+1]/cell),cellMinZ=Math.floor(bounds[i+2]/cell),cellMaxX=Math.floor(bounds[i+3]/cell),cellMaxY=Math.floor(bounds[i+4]/cell),cellMaxZ=Math.floor(bounds[i+5]/cell);
      for(let x=cellMinX;x<=cellMaxX;x++)for(let y=cellMinY;y<=cellMaxY;y++)for(let z=cellMinZ;z<=cellMaxZ;z++){
        const list=grid.get(key(x,y,z));if(!list)continue;
        // Edges enter cells in increasing ID order. Word order and low-bit
        // enumeration therefore retain the original first-visit CCD order.
        let first=0,last=list.count;
        // Buckets are sorted by edge ID. Skip the prefix of earlier words
        // without changing the first-visit order of any eligible pair.
        if(list.words[0]<firstWord)while(first<last){const middle=(first+last)>>>1;if(list.words[middle]<firstWord)first=middle+1;else last=middle;}
        for(let block=first;block<list.count;block++){
          const word=list.words[block];
          const bits=list.bits[block],seen=this.edgeStamps[word]===this.edgeStamp?this.edgeSeen[word]:0;
          this.edgeStamps[word]=this.edgeStamp;this.edgeSeen[word]=seen|bits;
          let candidates=bits&~seen;
          if(word===firstWord)candidates&=-2<<(e&31);
          if(masks)candidates&=~masks.pairs[maskBase+word];
          while(candidates!==0){
            const bit=candidates&-candidates,other=(word<<5)+31-Math.clz32(bit);candidates^=bit;
            if(this.groups&&this.groups[a]===this.groups[edges[other*2]])continue;
            const j=other*6;
            if(bounds[i]>bounds[j+3]||bounds[i+3]<bounds[j]||bounds[i+1]>bounds[j+4]||bounds[i+4]<bounds[j+1]||bounds[i+2]>bounds[j+5]||bounds[i+5]<bounds[j+2])continue;
            const c=edges[other*2],d=edges[other*2+1];if(w[a]+w[b]+w[c]+w[d]===0)continue;
            this.candidateChecks++;const crossing=this.edgeCrossing(a,b,c,d,old,p,thickness*1.25);if(!crossing)continue;
            const cacheKey=e*this.edgeCount+other;let gap=this.groups?Infinity:this.shared.edgeGaps.get(cacheKey);
            if(gap===undefined){gap=edgeDistance(this.rest,a,b,c,d);this.shared.edgeGaps.set(cacheKey,gap);}if(gap<.003||crossing.near&&crossing.distance>Math.min(thickness,gap*.4*scale)+1e-5)continue;
            this.contacts.push({type:'edge',a,b,c,d,parameters:crossing.parameters,side:crossing.side,gap:Math.min(thickness,gap*.4*scale)});
          }
        }
      }
    }
  }
  edgeCrossing(a,b,c,d,old,p,nearDistance=.010){
    const i=a*3,j=b*3,k=c*3,l=d*3,rx=old[k]-old[i],ry=old[k+1]-old[i+1],rz=old[k+2]-old[i+2],ux=old[j]-old[i],uy=old[j+1]-old[i+1],uz=old[j+2]-old[i+2],vx=old[l]-old[k],vy=old[l+1]-old[k+1],vz=old[l+2]-old[k+2];
    const drx=(p[k]-p[i])-rx,dry=(p[k+1]-p[i+1])-ry,drz=(p[k+2]-p[i+2])-rz,dux=(p[j]-p[i])-ux,duy=(p[j+1]-p[i+1])-uy,duz=(p[j+2]-p[i+2])-uz,dvx=(p[l]-p[k])-vx,dvy=(p[l+1]-p[k+1])-vy,dvz=(p[l+2]-p[k+2])-vz;
    const n0x=uy*vz-uz*vy,n0y=uz*vx-ux*vz,n0z=ux*vy-uy*vx,n1x=duy*vz-duz*vy+uy*dvz-uz*dvy,n1y=duz*vx-dux*vz+uz*dvx-ux*dvz,n1z=dux*vy-duy*vx+ux*dvy-uy*dvx,n2x=duy*dvz-duz*dvy,n2y=duz*dvx-dux*dvz,n2z=dux*dvy-duy*dvx;
    const c0=dot(rx,ry,rz,n0x,n0y,n0z),length=Math.sqrt(dot(n0x,n0y,n0z,n0x,n0y,n0z));if(length<1e-10||Math.abs(c0)/length<1e-6)return null;
    const coefficients=[c0,dot(drx,dry,drz,n0x,n0y,n0z)+dot(rx,ry,rz,n1x,n1y,n1z),dot(drx,dry,drz,n1x,n1y,n1z)+dot(rx,ry,rz,n2x,n2y,n2z),dot(drx,dry,drz,n2x,n2y,n2z)],b0=c0,b1=c0+coefficients[1]/3,b2=c0+2*coefficients[1]/3+coefficients[2]/3,b3=coefficients.reduce((a,b)=>a+b,0);
    const roots=Math.min(b0,b1,b2,b3)>0||Math.max(b0,b1,b2,b3)<0?[]:cubicRoots01(coefficients);
    for(const {t,near} of [...roots.map(t=>({t,near:false})),{t:1,near:true}]){
      const ax=ux+t*dux,ay=uy+t*duy,az=uz+t*duz,bx=vx+t*dvx,by=vy+t*dvy,bz=vz+t*dvz,qx=-(rx+t*drx),qy=-(ry+t*dry),qz=-(rz+t*drz),aa=dot(ax,ay,az,ax,ay,az),bb=dot(ax,ay,az,bx,by,bz),ee=dot(bx,by,bz,bx,by,bz),cc=dot(ax,ay,az,qx,qy,qz),ff=dot(bx,by,bz,qx,qy,qz),den=aa*ee-bb*bb;
      if(den<1e-18)continue;const u=(bb*ff-cc*ee)/den,v=(bb*u+ff)/ee;
      const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,distance=-dot(qx,qy,qz,nx,ny,nz)/Math.sqrt(dot(nx,ny,nz,nx,ny,nz))*Math.sign(c0);
      if(near&&(distance<0||distance>nearDistance))continue;
      if(u>=-1e-6&&u<=1+1e-6&&v>=-1e-6&&v<=1+1e-6)return{parameters:[u,v],side:Math.sign(c0),near,distance};
    }
    return null;
  }
  normal(contact,p){
    if(contact.type==='edge'){
      const a=contact.a*3,b=contact.b*3,c=contact.c*3,d=contact.d*3,ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[d]-p[c],vy=p[d+1]-p[c+1],vz=p[d+2]-p[c+2],x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx,len=Math.sqrt(x*x+y*y+z*z);return len>1e-10?[x/len*contact.side,y/len*contact.side,z/len*contact.side]:null;
    }
    const a=contact.a*3,b=contact.b*3,c=contact.c*3,ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2],x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx,len=Math.sqrt(x*x+y*y+z*z);return len>1e-10?[x/len*contact.side,y/len*contact.side,z/len*contact.side]:null;
  }
  participants(contact){return contact.type==='edge'?{ids:[contact.a,contact.b,contact.c,contact.d],coefficients:[contact.parameters[0]-1,-contact.parameters[0],1-contact.parameters[1],contact.parameters[1]]}:{ids:[contact.node,contact.a,contact.b,contact.c],coefficients:[1,-contact.bary[0],-contact.bary[1],-contact.bary[2]]};}
  project(contact,p){
    const n=this.normal(contact,p);if(!n)return;const {ids,coefficients}=this.participants(contact),w=this.weights;let x=0,y=0,z=0,weight=0;
    for(let k=0;k<4;k++){const j=ids[k]*3,c=coefficients[k];x+=p[j]*c;y+=p[j+1]*c;z+=p[j+2]*c;weight+=w[ids[k]]*c*c;}
    const distance=x*n[0]+y*n[1]+z*n[2];if(distance>=contact.gap||weight<1e-12)return;const lambda=(contact.gap-distance)/weight;
    for(let k=0;k<4;k++)for(let axis=0;axis<3;axis++)p[ids[k]*3+axis]+=n[axis]*lambda*w[ids[k]]*coefficients[k];
    if(!this.friction?.static||!this.previous)return;
    // Position-level Coulomb friction (PBD Survey 2017, 5.4.4), generalized
    // to the same barycentric point/face or interpolated edge participants.
    // Only actual normal projection supplies traction; no global damping or
    // persistent adhesion is applied to unloaded/separating cloth.
    let dx=0,dy=0,dz=0;
    for(let k=0;k<4;k++){const j=ids[k]*3,c=coefficients[k];dx+=(p[j]-this.previous[j])*c;dy+=(p[j+1]-this.previous[j+1])*c;dz+=(p[j+2]-this.previous[j+2])*c;}
    const normal=dx*n[0]+dy*n[1]+dz*n[2],tx=dx-normal*n[0],ty=dy-normal*n[1],tz=dz-normal*n[2],slip=Math.sqrt(tx*tx+ty*ty+tz*tz);
    if(slip<1e-14)return;
    const depth=lambda*weight,fraction=slip<=this.friction.static*depth?1:Math.min(this.friction.dynamic*depth/slip,1),tangentLambda=fraction/weight;
    for(let k=0;k<4;k++){const j=ids[k]*3,factor=tangentLambda*w[ids[k]]*coefficients[k];p[j]-=tx*factor;p[j+1]-=ty*factor;p[j+2]-=tz*factor;}
  }
  applyVelocities(v,p,friction=0){
    for(const contact of this.contacts){const n=this.normal(contact,p);if(!n)continue;const {ids,coefficients}=this.participants(contact),w=this.weights;let x=0,y=0,z=0,weight=0;
      for(let k=0;k<4;k++){const j=ids[k]*3,c=coefficients[k];x+=v[j]*c;y+=v[j+1]*c;z+=v[j+2]*c;weight+=w[ids[k]]*c*c;}
      const normalSpeed=x*n[0]+y*n[1]+z*n[2];
      if(weight<1e-12||normalSpeed>=0)continue;const impulse=-normalSpeed/weight;
      const tx=x-n[0]*normalSpeed,ty=y-n[1]*normalSpeed,tz=z-n[2]*normalSpeed,tangent=Math.sqrt(tx*tx+ty*ty+tz*tz),frictionImpulse=friction>0&&tangent>1e-12?Math.min(tangent/weight,friction*impulse)/tangent:0;
      for(let k=0;k<4;k++)for(let axis=0;axis<3;axis++)v[ids[k]*3+axis]+=(n[axis]*impulse-(axis===0?tx:axis===1?ty:tz)*frictionImpulse)*w[ids[k]]*coefficients[k];
    }
  }
}
