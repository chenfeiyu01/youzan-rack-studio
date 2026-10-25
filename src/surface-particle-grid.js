// Fixed-capacity buckets for a garment's packed 30-bit background cell keys.
// Preserve insertion order within each cell, just as Map<key, number[]> did.
export class SurfaceParticleGrid{
  constructor(count){
    let capacity=1;while(capacity<count*2)capacity*=2;
    this.mask=capacity-1;this.keys=new Int32Array(capacity);
    this.heads=new Int32Array(capacity);this.tails=new Int32Array(capacity);
    this.next=new Int32Array(count);this.reset();
  }
  reset(){this.heads.fill(-1);}
  slot(key){
    const hash=key^(key>>>12)^(key>>>24);
    let slot=Math.imul(hash,0x9e3779b1)&this.mask;
    while(this.heads[slot]!==-1&&this.keys[slot]!==key)slot=(slot+1)&this.mask;
    return slot;
  }
  first(key){return this.heads[this.slot(key)];}
  add(key,node){
    const slot=this.slot(key);
    if(this.heads[slot]===-1){this.keys[slot]=key;this.heads[slot]=node;}
    else this.next[this.tails[slot]]=node;
    this.tails[slot]=node;this.next[node]=-1;
  }
}
