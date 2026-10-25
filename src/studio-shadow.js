import {Vector3} from 'three';
import {updateStudioSoftShadow} from './studio-soft-shadow.js';

const lightSpaceCenter=new Vector3();

// Move only the orthographic shadow window: the key light and its direction
// stay fixed. Keep a constant window within each capture, and snap its centre
// to shadow texels so carrier motion does not continuously slide the grid.
export function frameStudioShadow(light,worldCenter,focused,viewCamera){
  const shadow=light.shadow;
  if(shadow.isAreaAtlasShadow||shadow.isStudioDirectionalShadow){shadow.frame(worldCenter,focused);return;}
  const camera=shadow.camera;
  const halfWidth=focused?3:7,halfHeight=focused?3.25:4.5;
  light.updateWorldMatrix(true,false);light.target.updateWorldMatrix(true,false);
  shadow.updateMatrices(light);
  lightSpaceCenter.copy(worldCenter).applyMatrix4(camera.matrixWorldInverse);
  const texelX=2*halfWidth/shadow.mapSize.x,texelY=2*halfHeight/shadow.mapSize.y;
  const x=Math.round(lightSpaceCenter.x/texelX)*texelX,y=Math.round(lightSpaceCenter.y/texelY)*texelY;
  camera.left=x-halfWidth;camera.right=x+halfWidth;
  camera.bottom=y-halfHeight;camera.top=y+halfHeight;
  camera.updateProjectionMatrix();
  shadow.radius=focused?6:5;
  updateStudioSoftShadow(light,viewCamera);
}

export function createStudioShadowFraming(light,rail,activeGarment,secondaryLights=[]){
  const center=new Vector3();
  return(_renderer,_scene,camera)=>{
    const focused=!rail.visible;
    if(focused)activeGarment().localToWorld(center.set(0,-1.58,0));
    // Retain the original fixed rack window, which also covers its mobile
    // translation. Only the isolated piece needs a moving shadow window.
    else center.set(0,0,0);
    frameStudioShadow(light,center,focused,camera);
    for(const secondary of secondaryLights)frameStudioShadow(secondary,center,focused,camera);
  };
}
