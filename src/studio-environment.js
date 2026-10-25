import * as THREE from 'three';
import {makeStudio} from './studio-set.js';
import {applyStudioAreaLight} from './studio-area-light.js';

// Capture a first backdrop bounce. Analytic sources remain in direct lighting;
// additional emissive softbox cards must not enter this environment probe.
export function studioEnvironment(renderer){
  const scene=new THREE.Scene();let pmrem;
  try{
    makeStudio(scene);scene.background=new THREE.Color('#b9b7b2');
    scene.traverse(object=>{
      if(object.isLight)object.castShadow=false;
      if(object.isMesh)for(const material of(Array.isArray(object.material)?object.material:[object.material]))applyStudioAreaLight(material);
    });
    pmrem=new THREE.PMREMGenerator(renderer);
    return pmrem.fromScene(scene,.025);
  }finally{
    scene.traverse(object=>{object.geometry?.dispose();if(object.material)(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>material.dispose());object.shadow?.dispose();});
    pmrem?.dispose();
  }
}
