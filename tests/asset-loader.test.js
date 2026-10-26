import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {loadAssetBytes} from '../src/asset-loader.js';
import {modelConfig} from '../src/model-config.js';
const original=Buffer.from('完整模型字节\u0000\u0001');
test('compressed transport preserves the original bytes and needs one request',async()=>{
 const calls=[];const bytes=await loadAssetBytes('/model.glb',{fetcher:async url=>{calls.push(url);return new Response(gzipSync(original));}});
 assert.deepEqual(Buffer.from(bytes),original);assert.deepEqual(calls,['/model.glb.gz']);
});
test('missing, corrupt and HTML fallback responses use the original asset',async()=>{
 for(const response of[new Response('',{status:404}),new Response('<html>SPA fallback</html>'),new Response(new Uint8Array([31,139,0]))]){
  const calls=[];const bytes=await loadAssetBytes('/model.glb',{fetcher:async url=>{calls.push(url);return url.endsWith('.gz')?response:new Response(original);}});
  assert.deepEqual(Buffer.from(bytes),original);assert.deepEqual(calls,['/model.glb.gz','/model.glb']);
 }
});
test('already decoded HTTP gzip responses are not decompressed twice',async()=>{
 const bytes=await loadAssetBytes('/model.glb',{fetcher:async()=>new Response(original,{headers:{'content-encoding':'gzip'}})});assert.deepEqual(Buffer.from(bytes),original);
});
test('unsupported browsers request the original directly and preserve HTTP errors',async()=>{
 const calls=[];assert.deepEqual(Buffer.from(await loadAssetBytes('/model.glb',{Decompress:null,fetcher:async url=>{calls.push(url);return new Response(original);}})),original);assert.deepEqual(calls,['/model.glb']);
 await assert.rejects(loadAssetBytes('/model.glb',{Decompress:null,fetcher:async()=>new Response('',{status:404})}),/404/);
});
test('every packaged model and simulation decompresses byte-for-byte to its source',()=>{
 for(const c of Object.values(modelConfig))for(const path of[c.url,c.simulation]){
  const source=readFileSync(new URL('../public'+path,import.meta.url));
  assert.deepEqual(gunzipSync(readFileSync(new URL('../public'+path+'.gz',import.meta.url))),source,path);
 }
});
