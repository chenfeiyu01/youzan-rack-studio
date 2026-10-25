import{Box3,Group,Matrix4,Quaternion,Euler,Vector3}from'three';
import{Spring}from'./physics.js';
import{RACK_YAW}from'./rack-layout.js';

// Preserve the actual hook mesh and its seat on the rod. Only the wooden body
// swivels about the metal stem; cloth keeps its full world-space solver.
export function createHangerSwivel(root,motion){
 root.updateWorldMatrix(true,true);
 const inverse=new Matrix4().copy(root.matrixWorld).invert(),hooks=[],point=new Vector3(),bounds=new Box3();
 root.traverse(mesh=>{
  if(!mesh.isMesh||mesh.userData.cloth)return;
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  if(!materials.some(m=>m.name==='Hanger_Metal'||m.metalness>.9))return;
  const matrix=new Matrix4().multiplyMatrices(inverse,mesh.matrixWorld),p=mesh.geometry.attributes.position;
  for(let i=0;i<p.count;i++)bounds.expandByPoint(point.fromBufferAttribute(p,i).applyMatrix4(matrix));
  hooks.push({mesh,matrix});
 });
 if(!hooks.length)throw new Error('The hanger has no separate swivel hook');
 const axis=new Vector3();let count=0;
 for(const{mesh,matrix}of hooks){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){
  point.fromBufferAttribute(p,i).applyMatrix4(matrix);if(point.y<=bounds.min.y+.012){axis.add(point);count++;}
 }}axis.divideScalar(count);
 const group=new Group();group.name='Swivel_Hook';root.add(group);group.matrixAutoUpdate=false;
 for(const{mesh,matrix}of hooks){group.add(mesh);mesh.matrixAutoUpdate=false;mesh.matrix.copy(matrix);}
 const side=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),RACK_YAW),restAxis=axis.clone().applyQuaternion(side),rotation=new Quaternion(),offset=new Vector3(),hookMatrix=new Matrix4();
 const hookMotion=Object.assign(Object.create(motion),{yaw:new Spring(RACK_YAW),roll:new Spring(0),pitch:new Spring(0)});
 return{
  hookMotion,hookGroup:group,
  bodyPose(anchor){
   rotation.setFromEuler(new Euler(anchor.pitch??0,anchor.yaw,anchor.roll??0,'ZYX'));offset.copy(axis).applyQuaternion(rotation);
   return{...anchor,x:anchor.x+restAxis.x-offset.x,y:anchor.y+restAxis.y-offset.y,z:anchor.z+restAxis.z-offset.z};
  },
  sync(anchor){
   root.updateMatrix();hookMatrix.compose(new Vector3(anchor.x,anchor.y,anchor.z),side,new Vector3(1,1,1));
   group.matrix.copy(root.matrix).invert().multiply(hookMatrix);group.matrixWorldNeedsUpdate=true;
  },
 };
}
