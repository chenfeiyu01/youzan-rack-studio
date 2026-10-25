// Inspect actual indexed draw geometry across duplicate UV/normal vertices.
// Generator face identities do not determine whether two panels are sewn.
export function measureSeamContinuity(scene, segments, tolerance=2e-7, meshNames=['Fabric','Fabric_Inner']) {
  const points=[], positionIDs=new Map(), edges=new Map(), bins=new Map(), cell=.05;
  const dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0);
  const subtract=(a,b)=>a.map((v,k)=>v-b[k]);
  scene.traverse(mesh=>{
    if(!mesh.isMesh||!meshNames.includes(mesh.name))return;
    const {position}=mesh.geometry.attributes, index=mesh.geometry.index, ids=[];
    for(let i=0;i<position.count;i++) {
      const point=[position.getX(i),position.getY(i),position.getZ(i)], key=point.join(':');
      if(!positionIDs.has(key)){positionIDs.set(key,points.length);points.push(point);}
      ids.push(positionIDs.get(key));
    }
    for(let i=0;i<index.count;i+=3) {
      const triangle=[0,1,2].map(k=>ids[index.getX(i+k)]);
      for(let j=0;j<3;j++) {
        const a=triangle[j], b=triangle[(j+1)%3];
        if(a===b)continue;
        const key=a<b?`${a}:${b}`:`${b}:${a}`;
        if(!edges.has(key))edges.set(key,{a:Math.min(a,b),b:Math.max(a,b),count:0,orientation:0,materials:[]});
        const edge=edges.get(key);edge.count++;edge.orientation+=a<b?1:-1;edge.materials.push(mesh.name);
      }
    }
  });
  for(const edge of edges.values()) {
    const key=points[edge.a].map((v,k)=>Math.floor((v+points[edge.b][k])*.5/cell)).join(':');
    if(!bins.has(key))bins.set(key,[]);
    bins.get(key).push(edge);
  }
  return segments.map(segment=>{
    const direction=subtract(segment.b,segment.a), lengthSquared=dot(direction,direction);
    const length=Math.sqrt(lengthSquared), intervals=[], badIncidence=[];
    const low=segment.a.map((v,k)=>Math.floor((Math.min(v,segment.b[k])-tolerance)/cell));
    const high=segment.a.map((v,k)=>Math.floor((Math.max(v,segment.b[k])+tolerance)/cell));
    for(let z=low[2];z<=high[2];z++)for(let y=low[1];y<=high[1];y++)for(let x=low[0];x<=high[0];x++) {
      for(const edge of bins.get([x,y,z].join(':'))??[]) {
        const ends=[points[edge.a],points[edge.b]];
        const t=ends.map(p=>dot(subtract(p,segment.a),direction)/lengthSquared);
        if(t.some(v=>v< -tolerance/length||v>1+tolerance/length))continue;
        const distance=ends.map((p,i)=>Math.hypot(...p.map((v,k)=>v-segment.a[k]-t[i]*direction[k])));
        if(Math.max(...distance)>tolerance)continue;
        const start=Math.max(0,Math.min(...t)), end=Math.min(1,Math.max(...t));
        if((end-start)*length<1e-10)continue;
        const expected=segment.expectedMeshes, names=edge.materials.slice().sort();
        const materialMatch=!expected||expected.slice().sort().every((name,i)=>names[i]===name);
        if(edge.count===2&&edge.orientation===0&&materialMatch)intervals.push([start,end]);
        else badIncidence.push({start,end,count:edge.count,orientation:edge.orientation,materials:edge.materials});
      }
    }
    intervals.sort((a,b)=>a[0]-b[0]);
    let cursor=0, uncoveredLength=0;
    for(const [start,end]of intervals) {
      if(start>cursor)uncoveredLength+=(start-cursor)*length;
      cursor=Math.max(cursor,end);
    }
    if(cursor<1)uncoveredLength+=(1-cursor)*length;
    return {...segment,length,uncoveredLength,badIncidence};
  });
}
