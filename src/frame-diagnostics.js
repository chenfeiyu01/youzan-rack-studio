// Keep diagnostic DOM mutations out of the per-step hot path. These values
// describe committed frames; they never drive presentation or physics.
export function createFrameDiagnostics(target,{now=()=>performance.now(),intervalMs=250}={}){
 const values={};let publishedAt=-Infinity;
 return{values,publish(force=false){
  const time=now();if(!force&&time-publishedAt<intervalMs)return 0;
  let writes=0;for(const[key,value]of Object.entries(values)){
   if(value===undefined)continue;const text=String(value);if(target[key]!==text){target[key]=text;writes++;}
  }
  publishedAt=time;return writes;
 }};
}
