// Normals transform by the inverse transpose. The positive determinant is a
// common scalar after normalization, so cross-product cofactors avoid inversion.
export const clothNormalTransport=`
mat3 clothCofactorMatrix(mat3 deformation){
 vec3 a=cross(deformation[1],deformation[2]),b=cross(deformation[2],deformation[0]),c=cross(deformation[0],deformation[1]);
 float determinant=dot(deformation[0],a);
 if(abs(determinant)<.000001)return mat3(1.);
 return mat3(a,b,c)*sign(determinant);
}
mat3 clothSurfaceNormalMatrix(vec3 restU,vec3 restV,vec3 u,vec3 v){
 vec3 restCross=cross(restU,restV),deformedCross=cross(u,v);
 float restArea=length(restCross),area=length(deformedCross);
 if(restArea<.000001||area<.000001)return mat3(1.);
 vec3 restN=restCross/restArea,n=deformedCross/area;
 return clothCofactorMatrix(mat3(u,v,n))*transpose(mat3(restU,restV,restN));
}
vec3 clothTransportNormal(vec3 source,mat3 transport){
 vec3 result=transport*source;float lengthSquared=dot(result,result);
 if(lengthSquared>1e-16&&lengthSquared<1e20)return result*inversesqrt(lengthSquared);
 float sourceSquared=dot(source,source);
 return sourceSquared>1e-16?source*inversesqrt(sourceSquared):vec3(0.,0.,1.);
}
`;
