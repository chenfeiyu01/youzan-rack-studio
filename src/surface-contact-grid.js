// Identical sparse word buckets and 1024-cell hashing, with dense storage for
// the bounded cloth volume. Unusually large/sparse volumes retain the Map path.
export class ContactWordGrid{
 constructor(primitiveCount,{denseByteLimit=4*1024*1024}={}){
  this.wordCount=Math.ceil(primitiveCount/32);this.denseByteLimit=denseByteLimit;this.cacheCell=null;this.cacheToken=null;this.reused=false;this.expansion=new Float64Array(3);this.builds=0;this.reuses=0;this.dense=false;this.capacity=0;this.buckets=[];
  this.cells=new Map();this.pool=[];this.used=0;this.queryEpoch=0;
 }
 prepare(bounds,active,cell,token){
  let valid=token!=null&&this.cacheToken===token&&this.cacheCell===cell&&this.cachedActive?.length===active.length;
  const d=this.expansion;d.fill(0);
  if(valid)for(let id=0;id<active.length;id++){
   if(active[id]!==this.cachedActive[id]){valid=false;break;}
   if(active[id])for(let k=0;k<3;k++){const j=id*6,b=this.cachedBounds;d[k]=Math.max(d[k],b[j+k]-bounds[j+k],bounds[j+3+k]-b[j+3+k]);if(!(d[k]<=cell/18)){valid=false;break;}}
   if(!valid)break;
  }
  if(valid){this.reused=true;this.reuses++;return false;}
  if(!this.cachedActive||this.cachedActive.length!==active.length){this.cachedActive=new Uint8Array(active.length);this.cachedBounds=new Float64Array(bounds.length);}
  this.cachedActive.set(active);this.cachedBounds.set(bounds);
  this.reset(bounds,active,cell);this.cacheCell=cell;this.cacheToken=token;this.builds++;return true;
 }
 beginQueries(){
  if(++this.queryEpoch>=2147483647){this.queryEpoch=1;for(const b of this.buckets)b.cursorEpoch=0;for(const b of this.pool)b.cursorEpoch=0;}
 }
 // Edge IDs are visited in increasing order within each query batch. A cell's
 // lower-bound cursor therefore advances through its words only once.
 firstWord(bucket,minimum){
  let first=bucket.cursorEpoch===this.queryEpoch?bucket.cursor:0;
  while(first<bucket.count&&bucket.words[first]<minimum)first++;
  bucket.cursorEpoch=this.queryEpoch;bucket.cursor=first;return first;
 }
 reset(bounds,active,cell){
  this.cacheCell=null;this.cacheToken=null;this.reused=false;this.expansion.fill(0);
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(let id=0;id<active.length;id++)if(active[id]){const j=id*6;minX=Math.min(minX,bounds[j]);minY=Math.min(minY,bounds[j+1]);minZ=Math.min(minZ,bounds[j+2]);maxX=Math.max(maxX,bounds[j+3]);maxY=Math.max(maxY,bounds[j+4]);maxZ=Math.max(maxZ,bounds[j+5]);}
  const x=Math.floor(minX/cell),y=Math.floor(minY/cell),z=Math.floor(minZ/cell),nx=Math.floor(maxX/cell)-x+1,ny=Math.floor(maxY/cell)-y+1,nz=Math.floor(maxZ/cell)-z+1,cells=nx*ny*nz,wide=this.wordCount>255,bytesPerWord=wide?8:6;
  this.dense=this.wordCount<=65535&&Number.isSafeInteger(cells)&&cells>0&&nx<=1024&&ny<=1024&&nz<=1024&&cells*this.wordCount*bytesPerWord<=this.denseByteLimit;
  this.cells.clear();this.used=0;
  if(!this.dense)return;
  this.x=x&1023;this.y=y&1023;this.z=z&1023;this.nx=nx;this.ny=ny;this.nz=nz;
  if(cells>this.capacity){
   this.capacity=Math.min(Math.floor(this.denseByteLimit/(this.wordCount*bytesPerWord)),Math.max(cells,Math.ceil(this.capacity*1.5),128));
   const count=this.capacity*this.wordCount,Index=wide?Uint16Array:Uint8Array;
   this.slots=new Index(count);this.words=new Index(count);this.bits=new Uint32Array(count);this.buckets=[];
   for(let id=0;id<this.capacity;id++){const start=id*this.wordCount;this.buckets.push({words:this.words.subarray(start,start+this.wordCount),bits:this.bits.subarray(start,start+this.wordCount),count:0,cursorEpoch:0,cursor:0});}
  }
  this.slots.fill(0,0,cells*this.wordCount);for(let id=0;id<cells;id++)this.buckets[id].count=0;
 }
 index(key){
  const x=((key>>>20)-this.x)&1023,y=(((key>>>10)&1023)-this.y)&1023,z=((key&1023)-this.z)&1023;
  return x<this.nx&&y<this.ny&&z<this.nz?(x*this.ny+y)*this.nz+z:-1;
 }
 get(key){
  if(!this.dense)return this.cells.get(key);
  const slot=this.index(key);if(slot<0)return;const bucket=this.buckets[slot];return bucket.count?bucket:undefined;
 }
 add(key,id){
  const word=id>>>5,bit=1<<(id&31);
  if(this.dense){
   const cell=this.index(key),base=cell*this.wordCount,bucket=this.buckets[cell],found=this.slots[base+word];
   if(found)this.bits[base+found-1]|=bit;
   else{const index=bucket.count++;this.slots[base+word]=index+1;this.words[base+index]=word;this.bits[base+index]=bit;}
   return;
  }
  let bucket=this.cells.get(key);
  if(!bucket){bucket=this.pool[this.used];if(!bucket)this.pool[this.used]={words:[],bits:[],count:0,cursorEpoch:0,cursor:0};bucket=this.pool[this.used++];bucket.count=0;this.cells.set(key,bucket);}
  const last=bucket.count-1;if(last>=0&&bucket.words[last]===word)bucket.bits[last]|=bit;else{bucket.words[bucket.count]=word;bucket.bits[bucket.count++]=bit;}
 }
}

// Sorting only actual hits preserves the original first-visited hashed cell
// and primitive order even when the candidate buckets use conservative bounds.
function firstCell(start,min,max){return Math.max(start,min+Math.ceil((start-max)/1024)*1024);}
export function orderContactHits(hits,bounds,cell,minX,minY,minZ){
 if(hits.length<2)return;
 const x=Math.floor(minX/cell),y=Math.floor(minY/cell),z=Math.floor(minZ/cell);
 hits.sort((a,b)=>{
  const i=a[0]*6,j=b[0]*6;
  for(const[k,start]of[[0,x],[1,y],[2,z]]){const d=firstCell(start,Math.floor(bounds[i+k]/cell),Math.floor(bounds[i+3+k]/cell))-firstCell(start,Math.floor(bounds[j+k]/cell),Math.floor(bounds[j+3+k]/cell));if(d)return d;}
  return a[0]-b[0];
 });
}
