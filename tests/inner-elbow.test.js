import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadGeometryAsset} from './helpers/geometry-asset.js';
import {strictTriangleContact,innerElbowContacts} from './helpers/strict-triangle-contact.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/inner-elbow.json',import.meta.url)));
const asset=new URL('../public/models/hanging-long-sleeve.glb',import.meta.url);
const hash=a=>createHash('sha256').update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)).digest('hex');
function dispose(scene){scene.traverse(o=>{o.geometry?.dispose();for(const m of(Array.isArray(o.material)?o.material:[o.material]))m?.dispose();});}

test('elbow inner repair preserves the accepted outer folds, trim and rigid hanger draw geometry',async()=>{
 const {scene}=await loadGeometryAsset(asset);
 try {for(const [name,attributes]of Object.entries(fixture.protected)){const g=scene.getObjectByName(name).geometry;for(const [key,expected]of Object.entries(attributes))assert.equal(hash(key==='index'?g.index:g.attributes[key]),expected,name+' '+key);}}
 finally{dispose(scene);}
});
test('actual elbow draw triangles have no inner-layer penetration, with the old defect as a failure control',async()=>{
 for(const pair of fixture.priorPenetrations)assert.equal(strictTriangleContact(...pair),true,'actual previous body/inner intersection is detectable');
 const {scene}=await loadGeometryAsset(asset);
 try {const result=innerElbowContacts(scene);assert.ok(result.triangles>10000&&result.innerTriangles>5000&&result.candidates>10000,'complete overlapping elbow draw regions, including neighboring surfaces');assert.deepEqual(result.contacts,[]);}
 finally{dispose(scene);}
});
test('strict surface contact distinguishes coplanar overlap, folded crossing and harmless shared boundaries',()=>{
 const triangle=[[0,0,0],[1,0,0],[0,1,0]];
 assert.equal(strictTriangleContact(triangle,[[.1,.1,0],[.6,.1,0],[.1,.6,0]]),true,'coplanar interior overlap');
 assert.equal(strictTriangleContact(triangle,[[0,0,0],[0,-1,0],[1,0,0]]),false,'shared edge');
 assert.equal(strictTriangleContact(triangle,[[.2,.2,.001],[.6,.2,.001],[.2,.6,.001]]),false,'separated parallel layers');
 assert.equal(strictTriangleContact(triangle,[[.2,.2,-.1],[.2,.2,.1],[.6,.2,.1]]),true,'transverse fold penetration');
});
