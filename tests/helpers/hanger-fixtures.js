import*as T from'three';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import{readFileSync}from'node:fs';import{makeHanger}from'../../src/garments.js';import{modelConfig}from'../../src/model-config.js';import{placeGarmentModel}from'../../src/model-space.js';import{rigidHangerData,RAIL}from'../../src/hanger-placement.js';
let cached;
export function hangerFixtures(){return cached??=load();}
async function load(){
 const short=new T.Group(),h=makeHanger();h.position.y=-1.58;short.add(h);
 const c=modelConfig.longSleeve,b=readFileSync(new URL('../../public'+c.url,import.meta.url)),asset=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 const model=asset.scene;placeGarmentModel(model,c);
 const long=new T.Group(),content=new T.Group();content.position.y=-1.58;long.add(content);model.traverse(o=>{if(o.isMesh&&!c.colorMaterials.includes(o.material.name))content.add(new T.Mesh(o.geometry.clone().applyMatrix4(o.matrixWorld),o.material));});
 return{short:{root:short,data:rigidHangerData(short)},long:{root:long,data:rigidHangerData(long)}};
}
// Independent of the placement interval construction: transform the real
// triangle vertices with Three, then use circle/triangle intersection in YZ.
export class RailAudit{
 constructor(data){this.data=data;this.p=new Float64Array(data.positions.length/3*2);this.point=new T.Vector3();this.matrix=new T.Matrix4();this.rotation=new T.Quaternion();}
 inspect(pose){
  const{y,z=0,yaw=-1.43,roll=0,pitch=0,scale=1}=pose;this.rotation.setFromEuler(new T.Euler(pitch,yaw,roll,'ZYX'));this.matrix.compose(new T.Vector3(0,y,z),this.rotation,new T.Vector3(scale,scale,scale));const p=this.p,rest=this.data.positions;
  for(let i=0,j=0;i<rest.length;i+=3,j+=2){this.point.fromArray(rest,i).applyMatrix4(this.matrix);p[j]=this.point.y-RAIL.height;p[j+1]=this.point.z;}
  let count=0,minGap=Infinity;const tri=this.data.triangles,r=RAIL.radius;
  for(let i=0;i<tri.length;i+=3){const a=tri[i]*2,b=tri[i+1]*2,c=tri[i+2]*2;if(Math.min(p[a],p[b],p[c])>r||Math.max(p[a],p[b],p[c])< -r||Math.min(p[a+1],p[b+1],p[c+1])>r||Math.max(p[a+1],p[b+1],p[c+1])< -r)continue;
   const ay=p[a],az=p[a+1],by=p[b],bz=p[b+1],cy=p[c],cz=p[c+1],s0=ay*bz-az*by,s1=by*cz-bz*cy,s2=cy*az-cz*ay,area=(by-ay)*(cz-az)-(bz-az)*(cy-ay);let d2=Infinity;
   if(Math.abs(area)>1e-18&&((s0>=0&&s1>=0&&s2>=0)||(s0<=0&&s1<=0&&s2<=0)))d2=0;
   else for(const[u,v]of[[a,b],[b,c],[c,a]]){const dy=p[v]-p[u],dz=p[v+1]-p[u+1],length=dy*dy+dz*dz,t=length?Math.max(0,Math.min(1,-(p[u]*dy+p[u+1]*dz)/length)):0;d2=Math.min(d2,(p[u]+t*dy)**2+(p[u+1]+t*dz)**2);}
   const gap=Math.sqrt(d2)-r;minGap=Math.min(minGap,gap);if(gap< -1e-8)count++;
  }
  return{count,minGap};
 }
}
