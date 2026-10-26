import test from 'node:test';
import assert from 'node:assert/strict';
import {requiredBrandAssets} from '../src/brand-assets.js';
import {catalog} from '../src/catalog.js';
test('the current rack loads only used brand images plus the header logo',()=>{
 assert.deepEqual(requiredBrandAssets(catalog.map(item=>item.print)),['wordmark','round']);
});
test('light wordmarks share their source and procedural prints need no image download',()=>{
 assert.deepEqual(requiredBrandAssets(['wordmarkLight','wordmarkLight','wildflowers',undefined]),['wordmark']);
 assert.deepEqual(requiredBrandAssets(['mascot']),['wordmark','mascot']);
});
