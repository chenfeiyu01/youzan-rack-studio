// A shared, bounded scratch arena per worker. Only conservative candidate
// search runs here; the original Float64 CCD, projection and cloth stay in JS.
let compiled=null,loading=null,scratch=null;
const GRID_BYTES=4*1024*1024,MAX_PAIRS=65536,MAX_BYTES=8*1024*1024;
export async function initializeContactKernel(bytes){
 if(compiled)return true;
 if(loading&&!bytes)return loading;
 loading=(async()=>{
  try{
   if(typeof WebAssembly==='undefined')return false;
   if(!bytes){const response=await fetch(new URL('./contact-kernel.wasm',import.meta.url));if(!response.ok)return false;bytes=await response.arrayBuffer();}
   compiled=await WebAssembly.compile(bytes);return true;
  }catch{return false;}
 })();
 return loading;
}
export const contactKernelAvailable=()=>compiled!==null;
// Results borrow the scratch arena until the next search. Consume one face or
// edge batch synchronously before asking for another, including on other rigs.
export function findContactCandidates(queries,queryActive,bounds,active,legacyCell,masks,self=false,narrow=null){
 if(!compiled||!masks)return null;
 const count=active.length,queryCount=queryActive.length,words=Math.ceil(count/32);
 if(!count||!queryCount||!(bounds instanceof Float64Array)||!(queries instanceof Float64Array)||!(active instanceof Uint8Array)||!(queryActive instanceof Uint8Array)||!(masks instanceof Uint32Array)||bounds.length!==count*6||queries.length!==queryCount*6||masks.length!==queryCount*words)return null;
 if(self&&(queries!==bounds||queryActive!==active))return null;
 if(narrow&&(!(narrow.previous instanceof Float64Array)||!(narrow.current instanceof Float64Array)||!(narrow.indices instanceof Uint32Array)||narrow.previous.length!==narrow.current.length||narrow.indices.length!==count*(self?2:3)))return null;
 let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
 for(let id=0;id<count;id++)if(active[id]){const j=id*6;minX=Math.min(minX,bounds[j]);minY=Math.min(minY,bounds[j+1]);minZ=Math.min(minZ,bounds[j+2]);maxX=Math.max(maxX,bounds[j+3]);maxY=Math.max(maxY,bounds[j+4]);maxZ=Math.max(maxZ,bounds[j+5]);}
 if(!(legacyCell>0&&Number.isFinite(legacyCell)))return null;
 // Floor-to-i32 in the kernel is exact throughout this supported domain.
 // Large/invalid/sparse domains retain the original hashed Map implementation.
 for(let id=0;id<queryCount;id++)if(queryActive[id])for(let k=0;k<6;k++)if(!Number.isFinite(queries[id*6+k])||Math.abs(queries[id*6+k]/legacyCell)>1e8)return null;
 if(![minX,minY,minZ,maxX,maxY,maxZ].every(v=>Number.isFinite(v)&&Math.abs(v/legacyCell)<=1e8))return null;
 let cell=legacyCell*2/3,x,y,z,nx,ny,nz,cells;
 for(let attempt=0;attempt<2;attempt++){
  x=Math.floor(minX/cell);y=Math.floor(minY/cell);z=Math.floor(minZ/cell);nx=Math.floor(maxX/cell)-x+1;ny=Math.floor(maxY/cell)-y+1;nz=Math.floor(maxZ/cell)-z+1;cells=nx*ny*nz;
  if(Number.isSafeInteger(cells)&&cells>0&&nx<=1024&&ny<=1024&&nz<=1024&&cells*words*4<=GRID_BYTES)break;
  if(attempt===1)return null;cell=legacyCell;
 }
 let end=1024;const allocate=bytes=>{const offset=end;end=Math.ceil((end+bytes)/8)*8;return offset;};
 const p=allocate(bounds.byteLength),q=self?p:allocate(queries.byteLength),a=allocate(active.byteLength),qa=self?a:allocate(queryActive.byteLength),mask=allocate(masks.byteLength),grid=allocate(2*(nx+ny+nz)*words*4),offsets=allocate((queryCount+1)*4),result=allocate(MAX_PAIRS*4);
 const old=narrow?allocate(narrow.previous.byteLength):0,current=narrow?allocate(narrow.current.byteLength):0,primitives=narrow?allocate(narrow.indices.byteLength):0;
 if(end>MAX_BYTES)return null;
 try{
  scratch??=new WebAssembly.Instance(compiled).exports;const memory=scratch.memory;
  if(end>memory.buffer.byteLength)memory.grow(Math.ceil((end-memory.buffer.byteLength)/65536));
  const buffer=memory.buffer;new Float64Array(buffer,p,bounds.length).set(bounds);if(!self)new Float64Array(buffer,q,queries.length).set(queries);new Uint8Array(buffer,a,active.length).set(active);if(!self)new Uint8Array(buffer,qa,queryActive.length).set(queryActive);new Uint32Array(buffer,mask,masks.length).set(masks);
  if(narrow){new Float64Array(buffer,old,narrow.previous.length).set(narrow.previous);new Float64Array(buffer,current,narrow.current.length).set(narrow.current);new Uint32Array(buffer,primitives,narrow.indices.length).set(narrow.indices);}
  const size=scratch.candidates(q,qa,queryCount,p,a,count,mask,grid,offsets,result,MAX_PAIRS,cell,x,y,z,nx,ny,nz,self?1:0,old,current,primitives,narrow?(self?2:1):0,narrow?.nearDistance??0);
  return size<0?null:{offsets:new Uint32Array(buffer,offsets,queryCount+1),indices:new Uint32Array(buffer,result,size),cell,bytes:memory.buffer.byteLength};
 }catch{return null;}
}

function contains(cached,bounds,flags,oldFlags){
 if(!cached||cached.length!==bounds.length)return false;
 for(let id=0;id<flags.length;id++)if(flags[id]){
  if(!oldFlags[id])return false;const j=id*6;
  for(let k=0;k<3;k++)if(!(bounds[j+k]>=cached[j+k]&&bounds[j+3+k]<=cached[j+3+k]))return false;
 }
 return true;
}
function padded(bounds,pad){const out=bounds.slice();for(let i=0;i<out.length;i++)out[i]+=i%6<3?-pad:pad;return out;}
// Topological exclusions only grow in SurfaceContacts. Store all possible
// neighbours inside a padded swept envelope, rebuilding before either surface
// leaves it. This caches search work, never contacts or cloth simulation.
export class ContactCandidateCache{
 constructor(){this.builds=0;this.reuses=0;}
 reset(){this.pairs=null;}
 find(queries,qa,bounds,active,cell,masks,self=false,narrow=null){
  if(!compiled)return null;
  let valid=this.pairs&&this.cell===cell&&this.masks===masks&&this.self===self&&contains(this.bounds,bounds,active,this.active)&&(self||contains(this.queries,queries,qa,this.qa));
  if(!valid){
   const padding=cell/6,p=padded(bounds,padding),q=self?p:padded(queries,padding),batch=findContactCandidates(q,qa,p,active,cell,masks,self);
   this.builds++;
   if(!batch){this.reset();return findContactCandidates(queries,qa,bounds,active,cell,masks,self,narrow);}
   this.bounds=p;this.queries=q;this.active=active.slice();this.qa=qa.slice();this.cell=cell;this.masks=masks;this.self=self;
   this.offsets=batch.offsets.slice();this.pairs=batch.indices.slice();
  }else this.reuses++;
  let end=1024;const allocate=bytes=>{const offset=end;end=Math.ceil((end+bytes)/8)*8;return offset;};
  const p=allocate(bounds.byteLength),q=self?p:allocate(queries.byteLength),a=allocate(active.byteLength),queryFlags=self?a:allocate(qa.byteLength),mask=allocate(masks.byteLength),inputOffsets=allocate(this.offsets.byteLength),input=allocate(this.pairs.byteLength),offsets=allocate(this.offsets.byteLength),result=allocate(this.pairs.byteLength);
  const old=narrow?allocate(narrow.previous.byteLength):0,current=narrow?allocate(narrow.current.byteLength):0,indices=narrow?allocate(narrow.indices.byteLength):0;
  if(end>MAX_BYTES)return findContactCandidates(queries,qa,bounds,active,cell,masks,self,narrow);
  const memory=scratch.memory;if(end>memory.buffer.byteLength)memory.grow(Math.ceil((end-memory.buffer.byteLength)/65536));const buffer=memory.buffer;
  new Float64Array(buffer,p,bounds.length).set(bounds);if(!self)new Float64Array(buffer,q,queries.length).set(queries);new Uint8Array(buffer,a,active.length).set(active);if(!self)new Uint8Array(buffer,queryFlags,qa.length).set(qa);
  new Uint32Array(buffer,mask,masks.length).set(masks);new Uint32Array(buffer,inputOffsets,this.offsets.length).set(this.offsets);new Uint32Array(buffer,input,this.pairs.length).set(this.pairs);
  if(narrow){new Float64Array(buffer,old,narrow.previous.length).set(narrow.previous);new Float64Array(buffer,current,narrow.current.length).set(narrow.current);new Uint32Array(buffer,indices,narrow.indices.length).set(narrow.indices);}
  const size=scratch.filterCandidates(q,queryFlags,qa.length,p,a,active.length,mask,inputOffsets,input,offsets,result,old,current,indices,narrow?(self?2:1):0,narrow?.nearDistance??0);
  return{offsets:new Uint32Array(buffer,offsets,qa.length+1),indices:new Uint32Array(buffer,result,size),bytes:memory.buffer.byteLength,cell};
 }
}
