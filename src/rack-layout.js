export const RACK_YAW=-1.43,INSPECTION_Y=1.94,INSPECTION_Z=.35,MAX_INSPECTION_SCALE=1.28;

// Hangers keep the same world-space slots on every screen. Browsing on a
// narrow screen moves the camera, instead of dragging every garment's anchor.
export function garmentRackX(index,count,chosen=null){
  return(index-(count-1)/2)*.73+(chosen==null?0:Math.sign(index-chosen)*.66);
}

// Blend one open slot between garments. The total allowance never grows during
// handoff, so unrelated hangers do not move out and back as the old item closes.
export function garmentRackPositions(count,space=[]){
  return Array.from({length:count},(_,index)=>garmentRackX(index,count)+.66*space.reduce((offset,weight,slot)=>offset+Math.sign(index-slot)*weight,0));
}

export function rackCameraX(selectedX,focus,mobile){
  return selectedX*(mobile?1:focus);
}

// Optical enlargement preserves the old selected-piece framing without
// changing its world size relative to the cloth solver, rail or studio lights.
// The camera remains parallel to -Z; the root is the former scaling pivot.
export function frameInspectionCamera(camera,garment,panX,zoom=1){
  garment.scale.setScalar(1);
  const changed=camera.zoom!==zoom;camera.zoom=zoom;
  camera.position.x=zoom===1?panX:garment.position.x-(garment.position.x-panX)/zoom;
  camera.position.y=zoom===1?.05:garment.position.y-(garment.position.y-.05)/zoom;
  camera.lookAt(camera.position.x,camera.position.y,0);
  if(changed)camera.updateProjectionMatrix();
}

// Only the inspected piece leaves its hanging pose. Preserve the ordinary
// rack selection's depth while the previous inspection is handing back over.
export function garmentFocusPose(selected,front,focus,inspectionScale,rackY=1.56){
  const rackZ=front?.15:0;
  return{
    y:selected?(1-focus)*rackY+focus*INSPECTION_Y:rackY,
    z:selected?(1-focus)*rackZ+focus*INSPECTION_Z:rackZ,
    scale:selected?(1-focus)+focus*inspectionScale:1,
  };
}
