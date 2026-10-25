// Keep the same 1080p budget in either orientation. A settled frame may use
// native pixels once; interaction immediately returns to the motion budget.
export function renderPixelRatio(width,height,dpr,settled=false){
 if(!(width>0&&height>0&&dpr>0))return 1;
 if(settled)return Math.min(dpr,Math.sqrt(3840*2160/(width*height)));
 const portrait=height>width;
 return Math.min(dpr,(portrait?1080:1920)/width,(portrait?1920:1080)/height);
}
