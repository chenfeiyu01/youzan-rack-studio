// Assumed physical scale shared by fabric scans and incremental gravity.
export const MODEL_METRES=.283;
// Put the supplied assets in public/models/ and set their URL here.
// The rack, selection, and focus transitions do not depend on garment geometry.
export const modelConfig = {
  shortSleeve: {
    url: '/models/short-sleeve-web.glb',
    simulation:'/models/short-sleeve-clean-simulation.json',
    height: 2.48,
    top: .98,
    widthScale: 1,
    depthScale: 1,
    hasHanger: false,
    rotation: [0, 0, 0],
    offset: [0, 0, 0],
    colorMaterials: ['Fabric', 'Hem_Stitching'],
  },
  longSleeve: {
    url: '/models/hanging-long-sleeve-web.glb',
    simulation:'/models/hanging-long-sleeve-simulation.json',
    height: 3.18,
    top: 1.58,
    widthScale: 1,
    depthScale: 1,
    hasHanger: true,
    rotation: [0, 0, 0],
    offset: [0, 0, 0],
    colorMaterials: ['Fabric', 'Fabric_Inner', 'Fabric_Trim'],
  },
};
