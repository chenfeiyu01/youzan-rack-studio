// The receiver horizon cuts the rectangle along a line. Split the outer
// interval where that line crosses either inner edge, then remap Gauss nodes
// into the non-empty part. Integrate only directions in the front hemisphere.
export const horizonSheen=`
#ifndef STUDIO_AREA_SAMPLE_SIDE
#define STUDIO_AREA_SAMPLE_SIDE 4
#endif
#if NUM_RECT_AREA_LIGHTS > 0 && defined(USE_SHEEN)
float studioSheenNode(int i){
#if STUDIO_AREA_SAMPLE_SIDE == 2
return i==0?-.5773502691896258:.5773502691896258;
#else
const vec4 nodes=vec4(-.8611363115940526,-.3399810435848563,.3399810435848563,.8611363115940526);return nodes[i];
#endif
}
float studioSheenWeight(int i){
#if STUDIO_AREA_SAMPLE_SIDE == 2
return 1.;
#else
const vec4 weights=vec4(.34785484513745385,.6521451548625461,.6521451548625461,.34785484513745385);return weights[i];
#endif
}
bool studioSheenCrossesHorizon(const in RectAreaLight light,const in vec3 p,const in vec3 n){return dot(n,light.position-p)<abs(dot(n,light.halfWidth))+abs(dot(n,light.halfHeight));}
float studioSheenVisibility(vec2 q,const in float visibility[16]){
#if STUDIO_AREA_SAMPLE_SIDE == 2
 vec2 f=clamp((q+vec2(.5773502691896258))/1.1547005383792516,0.,1.);
 return mix(mix(visibility[0],visibility[1],f.x),mix(visibility[2],visibility[3],f.x),f.y);
#else
 int x=q.x<-.3399810435848563?0:(q.x<.3399810435848563?1:2);
 int y=q.y<-.3399810435848563?0:(q.y<.3399810435848563?1:2);
 vec2 lo=vec2(studioSheenNode(x),studioSheenNode(y)),hi=vec2(studioSheenNode(x+1),studioSheenNode(y+1));
 vec2 f=clamp((q-lo)/(hi-lo),0.,1.);
 return mix(mix(visibility[y*4+x],visibility[y*4+x+1],f.x),mix(visibility[(y+1)*4+x],visibility[(y+1)*4+x+1],f.x),f.y);
#endif
}
vec3 studioHorizonSheen(const in RectAreaLight light,const in vec3 p,const in vec3 n,const in vec3 v,const in PhysicalMaterial material,const in float visibility[16],const in bool shadows){
 vec3 c=light.position-p,w=light.halfWidth,h=light.halfHeight;
 float a=dot(n,c),b=dot(n,w),d=dot(n,h),extent=abs(b)+abs(d);
 if(a<=-extent)return vec3(0.);
 vec3 outer=w,inner=h;
 if(abs(b)>abs(d)){outer=h;inner=w;float temporary=b;b=d;d=temporary;}
 if(b<0.)outer=-outer;if(d<0.)inner=-inner;b=abs(b);d=abs(d);
 float start=clamp((-d-a)/max(b,1.e-8),-1.,1.),middle=clamp((d-a)/max(b,1.e-8),-1.,1.);
 vec3 sourceNormal=-normalize(cross(w,h));float sampleArea=length(w)*length(h);vec3 result=vec3(0.);
 for(int interval=0;interval<2;interval++){
  float lowerU=interval==0?start:middle,upperU=interval==0?middle:1.;
  float halfU=(upperU-lowerU)*.5,centerU=(upperU+lowerU)*.5;if(halfU<=0.)continue;
  for(int x=0;x<STUDIO_AREA_SAMPLE_SIDE;x++){
   float u=centerU+halfU*studioSheenNode(x);
   float lowerV=interval==0?clamp(-(a+b*u)/max(d,1.e-8),-1.,1.):-1.,halfV=(1.-lowerV)*.5;
   for(int y=0;y<STUDIO_AREA_SAMPLE_SIDE;y++){
    float t=lowerV+halfV*(1.+studioSheenNode(y));vec3 offset=outer*u+inner*t,delta=c+offset;
    float r2=max(dot(delta,delta),1.e-8);vec3 l=delta*inversesqrt(r2);
    float weight=sampleArea*halfU*halfV*studioSheenWeight(x)*studioSheenWeight(y)*max(dot(sourceNormal,-l),0.)/r2;
    vec2 q=vec2(dot(offset,w)/dot(w,w),dot(offset,h)/dot(h,h));
    float visible=shadows?studioSheenVisibility(q,visibility):1.;
    result+=light.color*(weight*max(dot(n,l),0.)*visible)*BRDF_Sheen(l,v,n,material.sheenColor,material.sheenRoughness);
   }
  }
 }
 return result;
}
#endif
`;
