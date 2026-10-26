import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {modelConfig} from '../src/model-config.js';
for(const config of Object.values(modelConfig))for(const path of [config.url,config.simulation]){
  const url=new URL('../public'+path,import.meta.url),bytes=await readFile(url),compressed=gzipSync(bytes,{level:9});
  await writeFile(new URL(url.href+'.gz'),compressed);
  console.log(`${path}: ${bytes.length} → ${compressed.length} bytes`);
}
