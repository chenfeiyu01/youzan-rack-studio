import * as THREE from 'three';
import { getBrandAsset } from './brand-assets.js';

export function makePrint(item,back=false,transparent=false) {
  const artwork=getBrandAsset(item.print);
  if(transparent&&artwork&&!back){const texture=new THREE.CanvasTexture(artwork);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=16;return texture;}
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const ctx=canvas.getContext('2d');
  if(!transparent){ctx.fillStyle=item.color;ctx.fillRect(0,0,1024,1024);}
  if(artwork&&!back) {
    const scale=800/Math.max(artwork.width,artwork.height),w=artwork.width*scale,h=artwork.height*scale;
    ctx.drawImage(artwork,(1024-w)/2,(1024-h)/2,w,h);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  return texture;
}
