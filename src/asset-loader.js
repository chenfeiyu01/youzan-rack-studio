// Static hosts need no compression configuration: the packaged .gz assets
// decode to the exact original bytes, preserving model/index hash validation.
export async function loadAssetBytes(url,{fetcher=fetch,Decompress=globalThis.DecompressionStream}={}){
  if(Decompress){
    try{
      const response=await fetcher(url+'.gz');
      if(!response.ok)throw new Error('Compressed asset unavailable');
      const bytes=await response.arrayBuffer(),header=new Uint8Array(bytes,0,Math.min(2,bytes.byteLength));
      // Some hosts set Content-Encoding and the browser already decompresses.
      if(header[0]!==0x1f||header[1]!==0x8b){
        if(/gzip/i.test(response.headers.get('content-encoding')??''))return bytes;
        throw new Error('Invalid compressed asset');
      }
      return await new Response(new Blob([bytes]).stream().pipeThrough(new Decompress('gzip'))).arrayBuffer();
    }catch{ /* Older caches/hosts retain the original asset as a fallback. */ }
  }
  const response=await fetcher(url);
  if(!response.ok)throw new Error(`资源加载失败 (${response.status}): ${url}`);
  return response.arrayBuffer();
}
