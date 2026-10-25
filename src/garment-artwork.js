// Original path-and-type compositions rendered at print texture resolution.
const cache=new Map();
function flower(ctx,x,y,r,color,angle=0){
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);
 for(let petal=0;petal<7;petal++){ctx.rotate(Math.PI*2/7);ctx.beginPath();ctx.ellipse(0,-r*.63,r*.26,r*.55,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
 ctx.beginPath();ctx.arc(0,0,r*.23,0,Math.PI*2);ctx.fillStyle='#d2a044';ctx.fill();ctx.restore();
}
function stem(ctx,x,y,endX,endY,color='#4d6950'){
 ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x-40,y-100,endX+45,endY+80,endX,endY);ctx.stroke();
 for(let i=0;i<3;i++){const t=.23+i*.18,px=x+(endX-x)*t,py=y+(endY-y)*t;ctx.save();ctx.translate(px,py);ctx.rotate((i%2?1:-1)*.7);ctx.beginPath();ctx.ellipse(i%2?16:-16,0,24,8,-.25,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.restore();}
}
function text(ctx,words,x,y,size,color,{italic=false,font='Georgia',align='center',weight='400'}={}){
 ctx.fillStyle=color;ctx.font=`${italic?'italic ':''}${weight} ${size}px ${font}`;ctx.textAlign=align;ctx.fillText(words,x,y);
}
export function getGarmentArtwork(key){
 if(!['wildflowers','afterHours','studioDays'].includes(key))return null;
 if(cache.has(key))return cache.get(key);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=2048;const ctx=canvas.getContext('2d');ctx.scale(2.048,2.048);
 if(key==='wildflowers'){
  text(ctx,'Grow',500,192,169,'#304b42',{italic:true});text(ctx,'AT YOUR OWN',500,252,31,'#526456',{font:'Arial',weight:'500'});
  const blooms=[[265,360,57,'#ca7661',-.25],[445,315,50,'#e1b458',.25],[650,355,59,'#758ab3',.12],[745,482,45,'#c48296',-.15],[360,492,47,'#b68ba6',.25],[560,480,55,'#dca85b',-.15],[210,550,38,'#7a8fbe',0],[650,610,45,'#cf7560',.35]];
  for(const[x,y,r,color,angle]of blooms){stem(ctx,490,738,x,y);flower(ctx,x,y,r,color,angle);}
  text(ctx,'pace.',500,850,154,'#304b42',{italic:true});text(ctx,'GOOD THINGS TAKE THEIR TIME',500,920,23,'#526456',{font:'Arial'});
 }else if(key==='afterHours'){
  ctx.strokeStyle='#d8d0b9';ctx.lineWidth=2;ctx.beginPath();ctx.arc(500,485,272,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(500,485,256,0,Math.PI*2);ctx.stroke();
  for(let branch=0;branch<5;branch++)stem(ctx,350+branch*70,720,240+branch*125,290+(branch%2)*100,'#b4baa1');
  for(const[x,y,r]of[[260,310,25],[390,425,30],[505,310,26],[620,415,32],[735,325,24]])for(let p=0;p<8;p++){const a=p*Math.PI/4;ctx.beginPath();ctx.ellipse(x+Math.cos(a)*r,y+Math.sin(a)*r,r*.65,r*.25,a,0,Math.PI*2);ctx.stroke();}
  text(ctx,'After',500,178,132,'#e0d8c2',{italic:true});text(ctx,'HOURS',500,840,110,'#e0d8c2');text(ctx,'A LITTLE WILD. A LITTLE QUIET.',500,910,22,'#c2bea9',{font:'Arial'});
 }else{
  ctx.strokeStyle='#ead6ad';ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(180,92,640,810,310);ctx.stroke();
  text(ctx,'STUDIO',500,265,103,'#ead6ad',{weight:'700'});text(ctx,'Days',500,405,156,'#ead6ad',{italic:true});
  ctx.save();ctx.beginPath();ctx.rect(268,455,464,300);ctx.clip();ctx.fillStyle='#d19d68';ctx.beginPath();ctx.arc(500,595,125,Math.PI,Math.PI*2);ctx.fill();
  for(let i=0;i<8;i++){ctx.strokeStyle=i%2?'#ead6ad':'#b97f58';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(245,616+i*19);ctx.bezierCurveTo(400,566+i*19,590,676+i*19,760,600+i*19);ctx.stroke();}
  ctx.restore();text(ctx,'MAKE SOMETHING GOOD',500,820,26,'#ead6ad',{font:'Arial'});
 }
 cache.set(key,canvas);return canvas;
}
