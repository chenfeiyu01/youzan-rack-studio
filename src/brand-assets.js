// Supplied brand artwork stays untouched on disk. Remove the image matte only
// for compositing the ink onto fabric; the white thumb inside the red disc stays.
const assets=new Map();
const urls={wordmark:'youzan-wordmark.png',round:'youzan-round.png',mascot:'youzan-mascot.png'};
function removeMatte(canvas,key) {
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const image=ctx.getImageData(0,0,canvas.width,canvas.height),d=image.data,w=canvas.width,h=canvas.height;
  if(key==='wordmark') {
    for(let i=0;i<d.length;i+=4) {
      const alpha=1-Math.min(d[i],d[i+1],d[i+2])/255;
      if(alpha<.025){d[i+3]=0;continue;}
      for(let k=0;k<3;k++)d[i+k]=Math.max(0,(d[i+k]-255*(1-alpha))/alpha);
      d[i+3]=Math.round(alpha*255);
    }
  } else {
    const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
    const add=index=>{if(index<0||index>=w*h||seen[index])return;seen[index]=1;const i=index*4;if(Math.min(d[i],d[i+1],d[i+2])>=246)queue[tail++]=index;};
    for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}
    for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
    while(head<tail){const index=queue[head++];d[index*4+3]=0;const x=index%w;if(x>0)add(index-1);if(x<w-1)add(index+1);add(index-w);add(index+w);}
  }
  ctx.putImageData(image,0,0);
  let x0=w,y0=h,x1=0,y1=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(d[(y*w+x)*4+3]>8){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  const trimmed=document.createElement('canvas');trimmed.width=x1-x0+5;trimmed.height=y1-y0+5;
  trimmed.getContext('2d').drawImage(canvas,x0-2,y0-2,trimmed.width,trimmed.height,0,0,trimmed.width,trimmed.height);
  return trimmed;
}
export async function preloadBrandAssets() {
  if(assets.size)return;
  await Promise.all(Object.entries(urls).map(async([key,file])=>{
    const response=await fetch(import.meta.env.BASE_URL+'brand/'+file);
    if(!response.ok)throw new Error('品牌图片加载失败');
    const bitmap=await createImageBitmap(await response.blob(),key==='mascot'?{resizeWidth:1400,resizeQuality:'high'}:{});
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();assets.set(key,removeMatte(canvas,key));
  }));
  const source=assets.get('wordmark'),light=document.createElement('canvas');light.width=source.width;light.height=source.height;
  const ctx=light.getContext('2d');ctx.drawImage(source,0,0);const image=ctx.getImageData(0,0,light.width,light.height);
  for(let i=0;i<image.data.length;i+=4)if(Math.max(image.data[i],image.data[i+1],image.data[i+2])<100)image.data[i]=image.data[i+1]=image.data[i+2]=244;
  ctx.putImageData(image,0,0);assets.set('wordmarkLight',light);
}
export const getBrandAsset=key=>assets.get(key);
export const getBrandAssetUrl=key=>assets.get(key)?.toDataURL();
