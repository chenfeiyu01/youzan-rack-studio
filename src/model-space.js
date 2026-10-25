import {Box3,Vector3}from'three';

// New scanned cloth is exported in rack units around the actual hanger.
// Legacy assets still need their authored scale and origin converted once.
export function placeGarmentModel(model,config){
  model.rotation.set(...config.rotation);
  model.updateMatrixWorld(true);
  if(model.getObjectByName('Fabric')?.userData.rackCoordinates==='normalized')return model;
  const box=new Box3().setFromObject(model),size=box.getSize(new Vector3()),center=box.getCenter(new Vector3()),scale=config.height/size.y;
  model.scale.multiplyScalar(scale);
  model.scale.x*=config.widthScale??1;model.scale.z*=config.depthScale??1;
  model.position.set(-center.x*scale*(config.widthScale??1),(config.top??.98)-box.max.y*scale,-center.z*scale*(config.depthScale??1));
  model.position.add(new Vector3(...config.offset));
  model.updateMatrixWorld(true);
  return model;
}
