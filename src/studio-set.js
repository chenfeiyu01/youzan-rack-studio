import * as THREE from 'three';
import {AreaAtlasShadow} from './studio-area-visibility.js';
import {StudioDirectionalShadow} from './studio-directional-shadow.js';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';

export function makeStudio(scene,{areaSampleSide=4}={}) {
  scene.background=new THREE.Color('#e9e8e4');
  // The probe stores the lit backdrop radiance; use its captured scale.
  scene.environmentIntensity=.62;
  // The set is a seamless photographic sweep. Lighting stays outside the frame.
  const backdrop=new THREE.MeshStandardMaterial({color:'#d6d4cf',roughness:1});
  const path=[[-5.5,5],[-5.5,-2.0]];
  for(let i=1;i<=32;i++){const a=i/32*Math.PI/2;path.push([-4.2-1.3*Math.cos(a),-2.0-1.3*Math.sin(a)]);}
  path.push([8,-3.3]);
  const vertices=[];
  for(let i=0;i<path.length-1;i++) {
    const [y,z]=path[i],[yy,zz]=path[i+1];
    vertices.push(-18,y,z,18,y,z,18,yy,zz,-18,y,z,18,yy,zz,-18,yy,zz);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
  const sweep=new THREE.Mesh(geometry,backdrop);sweep.receiveShadow=false;scene.add(sweep);
  scene.add(new THREE.HemisphereLight('#f7f6f1','#aaa69e',.45));
  // A finite softbox resolves light across the folds and falls off over the
  // rack. The zero-intensity key only stores the finite-source shadow atlas;
  // it does not add illumination a second time.
  if(!THREE.UniformsLib.LTC_FLOAT_1)RectAreaLightUniformsLib.init();
  const key=new THREE.DirectionalLight('#fff5e8',0);key.position.set(-4,5,6);key.castShadow=true;scene.add(key);
  const softbox=new THREE.RectAreaLight('#fffaf2',7.0,6,7);softbox.position.copy(key.position);softbox.lookAt(key.target.position);scene.add(softbox);
  const fill=new THREE.DirectionalLight('#eef1f5',.55);fill.position.set(4,1.5,5);scene.add(fill);
  const rim=new THREE.DirectionalLight('#faf7f0',.8);rim.position.set(-3,2,-.4);scene.add(rim);
  const wash=new THREE.SpotLight('#f1eeea',18,18,.86,1,2);wash.position.set(-1,4,1);wash.target.position.set(0,-.4,-3.2);scene.add(wash,wash.target);
  key.shadow.dispose();key.shadow=new AreaAtlasShadow(softbox,{sampleSide:areaSampleSide});
  for(const light of [fill,rim]){light.shadow.dispose();light.shadow=new StudioDirectionalShadow();light.castShadow=true;}
  return {key,softbox,sweep,secondaryLights:[fill,rim]};
}
