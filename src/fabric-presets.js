// Scan-based appearance choices. Fiber sheen is an authored appearance preset,
// independent of the scanned body roughness; these are not garment measurements.
export const fabricPresets={
  cotton:{folder:'cotton-jersey',resolution:'2k',patchMetres:.2638,repeatAspect:[1,1],colorGain:1,sheen:.22,sheenRoughness:.88,diffuseTransmissionGain:.12},
  melange:{folder:'jersey-melange',resolution:'1k',patchMetres:.2833202076225196,repeatAspect:[.9748686787615196,1.0257791862493804],colorGain:2.119877550262409,sheen:.22,sheenRoughness:.88,diffuseTransmissionGain:.06},
  fleece:{folder:'knitted-fleece',resolution:'1k',patchMetres:.26837072702461845,repeatAspect:[1.0075614084124636,.9924953374064045],colorGain:1.9062572053027504,sheen:.38,sheenRoughness:.94,diffuseTransmissionGain:.025},
};
export function fabricPreset(name='cotton'){
 if(!Object.hasOwn(fabricPresets,name))throw new RangeError('未知面料：'+name);return fabricPresets[name];
}
export function fabricColorGain(name,linearColor){
 const gain=fabricPreset(name).colorGain,brightest=Math.max(...linearColor);
 return Math.min(gain,brightest>0?1/brightest:gain);
}
