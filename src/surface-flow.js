import * as T from 'three';
import {makeFlowLayout,createFlowReference} from './surface-flow-grid.js';
const sharedCache=new WeakMap();
export const flowSampling=`
uniform sampler2D uFlowGrid;
uniform vec3 uFlowDimensions;
uniform vec3 uFlowLo;
uniform vec3 uFlowHi;
vec3 flowCell(vec3 q){
 return texture2D(uFlowGrid,vec2(q.x+.5,q.y+q.z*uFlowDimensions.y+.5)/vec2(uFlowDimensions.x,uFlowDimensions.y*uFlowDimensions.z)).xyz;
}
vec3 sampleFlowGrid(vec3 p){
 vec3 q=clamp((p-uFlowLo)/(uFlowHi-uFlowLo),vec3(0.),vec3(1.))*(uFlowDimensions-1.);
 vec3 a=floor(q),b=min(a+1.,uFlowDimensions-1.),f=q-a;
 vec3 v00=mix(flowCell(a),flowCell(vec3(b.x,a.y,a.z)),f.x);
 vec3 v10=mix(flowCell(vec3(a.x,b.y,a.z)),flowCell(vec3(b.x,b.y,a.z)),f.x);
 vec3 v01=mix(flowCell(vec3(a.x,a.y,b.z)),flowCell(vec3(b.x,a.y,b.z)),f.x);
 vec3 v11=mix(flowCell(vec3(a.x,b.y,b.z)),flowCell(b),f.x);
 return mix(mix(v00,v10,f.y),mix(v01,v11,f.y),f.z);
}
vec3 sampleFlowTet(vec3 p){
 vec3 q=clamp((p-uFlowLo)/(uFlowHi-uFlowLo),vec3(0.),vec3(1.))*(uFlowDimensions-1.);
 vec3 cell=min(floor(q),uFlowDimensions-2.),f=q-cell;
 vec3 a,b;float high,mid,low;
 if(f.x>=f.y){if(f.y>=f.z){a=vec3(1.,0.,0.);b=vec3(1.,1.,0.);high=f.x;mid=f.y;low=f.z;}else if(f.x>=f.z){a=vec3(1.,0.,0.);b=vec3(1.,0.,1.);high=f.x;mid=f.z;low=f.y;}else{a=vec3(0.,0.,1.);b=vec3(1.,0.,1.);high=f.z;mid=f.x;low=f.y;}}
 else{if(f.x>=f.z){a=vec3(0.,1.,0.);b=vec3(1.,1.,0.);high=f.y;mid=f.x;low=f.z;}else if(f.y>=f.z){a=vec3(0.,1.,0.);b=vec3(0.,1.,1.);high=f.y;mid=f.z;low=f.x;}else{a=vec3(0.,0.,1.);b=vec3(0.,1.,1.);high=f.z;mid=f.y;low=f.x;}}
 return flowCell(cell)*(1.-high)+flowCell(cell+a)*(high-mid)+flowCell(cell+b)*(mid-low)+flowCell(cell+1.)*low;
}
vec3 flowMap(vec3 p){return p+sampleFlowTet(p);}

`;
export function createGpuFlow(data,source){
 let shared=sharedCache.get(data);
 if(!shared){const layout=makeFlowLayout(data),n=layout.positions.length/3,width=1024,height=Math.ceil(n*12/width),coefficients=new Float32Array(width*height*4);for(let i=0;i<n*12;i++){coefficients[i*4]=layout.weights[i];coefficients[i*4+3]=layout.ids[i];}
  const texture=new T.DataTexture(coefficients,width,height,T.RGBAFormat,T.FloatType);texture.minFilter=texture.magFilter=T.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  shared={texture,width,height,dimensions:layout.dimensions,lo:layout.lo,hi:layout.hi,references:0};sharedCache.set(data,shared);
 }shared.references++;
 const [nx,ny,nz]=shared.dimensions,targets=[0,1].map(()=>new T.WebGLRenderTarget(nx,ny*nz,{type:T.FloatType,minFilter:T.NearestFilter,magFilter:T.NearestFilter,depthBuffer:false,stencilBuffer:false,generateMipmaps:false}));
 const uniforms={uFlowGrid:{value:targets[1].texture},uFlowDimensions:{value:new T.Vector3(nx,ny,nz)},uFlowLo:{value:new T.Vector3(...shared.lo)},uFlowHi:{value:new T.Vector3(...shared.hi)}};
 const vertexShader='void main(){gl_Position=vec4(position.xy,0.,1.);}';
 const bake=new T.ShaderMaterial({uniforms:{uCoefficients:{value:shared.texture},uCoefficientSize:{value:new T.Vector2(shared.width,shared.height)},uSource:{value:source},uSourceWidth:{value:source.image.width},...uniforms},vertexShader,fragmentShader:`
 uniform sampler2D uCoefficients;uniform vec2 uCoefficientSize;uniform sampler2D uSource;uniform float uSourceWidth;${flowSampling}
 void main(){float index=floor(gl_FragCoord.y)*uFlowDimensions.x+floor(gl_FragCoord.x);vec3 offset=vec3(0.);for(int i=0;i<12;i++){float k=index*12.+float(i);vec4 b=texture2D(uCoefficients,vec2(mod(k,uCoefficientSize.x)+.5,floor(k/uCoefficientSize.x)+.5)/uCoefficientSize);offset+=texture2D(uSource,vec2((b.w+.5)/uSourceWidth,.25)).xyz*b.x;}gl_FragColor=vec4(offset/8.,1.);}`,depthTest:false,depthWrite:false,blending:T.NoBlending,toneMapped:false});
 const square=new T.ShaderMaterial({uniforms,vertexShader,fragmentShader:`${flowSampling}
 void main(){vec2 pixel=floor(gl_FragCoord.xy);float index=pixel.y*uFlowDimensions.x+pixel.x;vec3 q=vec3(pixel.x,mod(pixel.y,uFlowDimensions.y),floor(pixel.y/uFlowDimensions.y));vec3 p=uFlowLo+q/(uFlowDimensions-1.)*(uFlowHi-uFlowLo);vec3 d=texture2D(uFlowGrid,gl_FragCoord.xy/vec2(uFlowDimensions.x,uFlowDimensions.y*uFlowDimensions.z)).xyz;gl_FragColor=vec4(d+sampleFlowGrid(p+d),1.);}`,depthTest:false,depthWrite:false,blending:T.NoBlending,toneMapped:false});
 const geometry=new T.PlaneGeometry(2,2),quad=new T.Mesh(geometry,bake),scene=new T.Scene(),camera=new T.Camera();quad.frustumCulled=false;scene.add(quad);
 let version=-1,supported=null,reference=null,fallback=null;const enabled={value:0},viewport=new T.Vector4(),scissor=new T.Vector4();
 return{uniforms:{...uniforms,uFlowEnabled:enabled},targets,shared,
  prepare(renderer){
   // Long sleeves project the small CPU lattice before upload; no GPU readback.
   if(supported===null){supported=data.type!=='longSleeve'&&renderer.extensions.has('EXT_color_buffer_float');enabled.value=1;}
   if(version===source.version)return;
   if(!supported){reference??=createFlowReference(data);const pixels=reference.update(source.image.data);if(!fallback){fallback=new T.DataTexture(new Float32Array(pixels.length),nx,ny*nz,T.RGBAFormat,T.FloatType);fallback.minFilter=fallback.magFilter=T.NearestFilter;fallback.generateMipmaps=false;}fallback.image.data.set(pixels);fallback.needsUpdate=true;uniforms.uFlowGrid.value=fallback;version=source.version;return;}

   const target=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel(),xr=renderer.xr.enabled,autoClear=renderer.autoClear,scissorTest=renderer.getScissorTest();renderer.getViewport(viewport);renderer.getScissor(scissor);
   try{renderer.xr.enabled=false;renderer.autoClear=true;renderer.setScissorTest(false);quad.material=bake;renderer.setRenderTarget(targets[0]);renderer.render(scene,camera);
    for(let pass=0;pass<3;pass++){uniforms.uFlowGrid.value=targets[pass%2].texture;quad.material=square;renderer.setRenderTarget(targets[(pass+1)%2]);renderer.render(scene,camera);}
    uniforms.uFlowGrid.value=targets[1].texture;version=source.version;
   }finally{renderer.setRenderTarget(target,face,mip);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.autoClear=autoClear;renderer.xr.enabled=xr;}
  },
  get supported(){return supported;},
  dispose(){fallback?.dispose();targets.forEach(t=>t.dispose());bake.dispose();square.dispose();geometry.dispose();if(--shared.references===0){shared.texture.dispose();sharedCache.delete(data);}},
 };
}

const shader=`
uniform float uFlowEnabled;
${flowSampling}
void sampleFlowCloth(vec3 p){
 // Symmetric probes filter the coarse tetrahedral derivative for shading.
 // Include the normal-axis derivative so local twist and 3D shear both follow.
 vec3 u=(flowMap(p+clothTangent*.04)-flowMap(p-clothTangent*.04))/.08;
 vec3 v=(flowMap(p+clothBitangent*.04)-flowMap(p-clothBitangent*.04))/.08;
 clothDisplacement=flowMap(p)-p;
 vec3 n=normalize(cross(clothTangent,clothBitangent));
 vec3 w=(flowMap(p+n*.04)-flowMap(p-n*.04))/.08;
 clothNormalRotation=clothCofactorMatrix(mat3(u,v,w)*transpose(mat3(clothTangent,clothBitangent,n)));
}
`;
export function withSurfaceFlow(rig,data){
 const flow=createGpuFlow(data,rig.texture),bind=rig.bind,dispose=rig.dispose;
 rig.flow=flow;rig.prepare=renderer=>flow.prepare(renderer);
 rig.bind=mesh=>{bind(mesh);for(const material of [...(Array.isArray(mesh.material)?mesh.material:[mesh.material]),mesh.customDepthMaterial]){
  const before=material.onBeforeCompile,key=material.customProgramCacheKey;
  material.onBeforeCompile=(s,renderer)=>{before.call(material,s,renderer);Object.assign(s.uniforms,flow.uniforms);s.vertexShader=s.vertexShader.replace('void main() {',shader+'\nvoid main() {').replace('sampleCloth(position);','sampleFlowCloth(position);');};
  material.customProgramCacheKey=()=>key.call(material)+'-flow-tet-v2-volume-normal';
 }};rig.dispose=()=>{flow.dispose();dispose();};return rig;
}
