import{Color,CanvasTexture,SRGBColorSpace,RepeatWrapping}from'three';
let botanical;
function botanicalTexture(){
 if(botanical)return botanical;
 const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d');ctx.scale(2,2);ctx.fillStyle='#e4e1d3';ctx.fillRect(0,0,512,512);
 // Four sprigs on one seamless tile; no branch crosses its boundary.
 for(const[x,y,angle]of[[100,80,-.4],[350,130,.45],[145,330,.3],[380,390,-.3]]){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.strokeStyle='#647d88';ctx.fillStyle='#758d96';ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(0,80);ctx.bezierCurveTo(-24,40,25,-10,0,-65);ctx.stroke();
  for(let i=0;i<6;i++){const py=55-i*21,side=i%2?1:-1;ctx.beginPath();ctx.ellipse(side*15,py,24,8,side*.55,0,Math.PI*2);ctx.fill();}
  for(let p=0;p<5;p++){const a=p*Math.PI*2/5;ctx.beginPath();ctx.ellipse(Math.cos(a)*12,-67+Math.sin(a)*12,11,6,a,0,Math.PI*2);ctx.fillStyle='#455d71';ctx.fill();}
  ctx.restore();
 }
 botanical=new CanvasTexture(c);botanical.colorSpace=SRGBColorSpace;botanical.wrapS=botanical.wrapT=RepeatWrapping;botanical.anisotropy=8;return botanical;
}
const noise=`
float garmentPatternHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float garmentPatternNoise(vec2 p){vec2 a=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(garmentPatternHash(a),garmentPatternHash(a+vec2(1.,0.)),f.x),mix(garmentPatternHash(a+vec2(0.,1.)),garmentPatternHash(a+1.),f.x),f.y);}
`;
export function prepareFabricPattern(material,pattern){
 if(!pattern)return;material.userData.fabricPattern=pattern;
 if(pattern==='botanical')material.userData.fabricPatternMap=botanicalTexture();
}
export function applyFabricPattern(shader,material){
 const pattern=material.userData.fabricPattern;if(!pattern||!shader.fragmentShader.includes('#include <map_fragment>'))return;
 let code='';
 if(pattern==='maritime'){
  shader.uniforms.uStripeColor={value:new Color('#283e59')};shader.fragmentShader='uniform vec3 uStripeColor;\n'+shader.fragmentShader;
  code=`float stripeCoord=(vGarmentRest.y+.11)*5.4;float stripeDistance=abs(fract(stripeCoord)-.5);float stripeAA=max(fwidth(stripeCoord),.001);float stripeMask=1.-smoothstep(.17-stripeAA,.17+stripeAA,stripeDistance);diffuseColor.rgb*=mix(vec3(1.),uStripeColor,stripeMask);`;
 }else if(pattern==='camouflage'){
  shader.uniforms.uCamoDark={value:new Color('#445044')};shader.uniforms.uCamoMid={value:new Color('#858c72')};shader.uniforms.uCamoLight={value:new Color('#bdbaa0')};
  shader.fragmentShader='uniform vec3 uCamoDark;uniform vec3 uCamoMid;uniform vec3 uCamoLight;\n'+noise+shader.fragmentShader;
  code=`vec2 patternP=vGarmentRest.xy*8.+vec2(vGarmentRest.z*2.,0.);float patternN=garmentPatternNoise(patternP+garmentPatternNoise(patternP*.6)*2.);float patternFine=garmentPatternNoise(patternP*1.9+3.);float patternAA=max(fwidth(patternN),.005);vec3 camo=mix(uCamoDark,uCamoMid,smoothstep(.35-patternAA,.35+patternAA,patternN));camo=mix(camo,uCamoLight,smoothstep(.62-patternAA,.62+patternAA,patternN+.14*patternFine));diffuseColor.rgb*=camo;`;
 }else if(pattern==='botanical'){
  shader.uniforms.uFabricPatternMap={value:material.userData.fabricPatternMap};shader.fragmentShader='uniform sampler2D uFabricPatternMap;\n'+shader.fragmentShader;
  code='diffuseColor.rgb*=texture2D(uFabricPatternMap,vGarmentRest.xy*1.25).rgb;';
 }
 shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n'+code);
}
