// Rally environments: look of the world, terrain shape and grip of the surfaces.

export const ENVIRONMENTS = {
  forest: {
    id: 'forest',
    name: 'Waldschotter',
    surfaceName: 'Schotter',
    sky: { top: 0x3f78c0, horizon: 0xc9d8e4, fogNear: 90, fogFar: 620 },
    light: { sky: 0xcfe3ff, ground: 0x5a5a3a, hemi: 1.1, sun: 0xfff1d8, sunIntensity: 2.6 },
    terrain: { amp: 48, scale: 520, detail: 5, edge: 'ditch' },
    ground: { a: 0x5d7a32, b: 0x7b8a3c, shoulder: 0x7a6448, rock: 0x7d776c },
    road: { base: [150, 138, 118], tracks: 26, stones: true, lines: false },
    trees: { kind: 'pine', density: 1 },
    grip: { road: 1.0, off: 0.8, offRolling: 6 },
    dust: { color: { r: 0.66, g: 0.58, b: 0.46 }, amount: 1 },
  },
  snow: {
    id: 'snow',
    name: 'Schneeland',
    surfaceName: 'Schnee & Eis',
    sky: { top: 0x6f8fb4, horizon: 0xdfe6ee, fogNear: 60, fogFar: 430 },
    light: { sky: 0xe8f0ff, ground: 0x8e98a8, hemi: 1.35, sun: 0xfff6ee, sunIntensity: 1.9 },
    terrain: { amp: 36, scale: 480, detail: 4, edge: 'bank' },
    ground: { a: 0xe9eef4, b: 0xd9e2ec, shoulder: 0xd2dbe6, rock: 0x8a8f96 },
    road: { base: [214, 222, 232], tracks: 40, stones: false, lines: false, tint: [0.92, 0.97, 1.05] },
    trees: { kind: 'snowpine', density: 1 },
    grip: { road: 0.72, off: 0.55, offRolling: 9 },
    dust: { color: { r: 0.95, g: 0.97, b: 1.0 }, amount: 1.4 },
  },
  tarmac: {
    id: 'tarmac',
    name: 'Alpenasphalt',
    surfaceName: 'Asphalt',
    sky: { top: 0x2f6fc8, horizon: 0xbfd4ea, fogNear: 120, fogFar: 760 },
    light: { sky: 0xd6e8ff, ground: 0x5f6a3c, hemi: 1.0, sun: 0xfff3dc, sunIntensity: 2.9 },
    terrain: { amp: 85, scale: 560, detail: 7, edge: 'kerb' },
    ground: { a: 0x5f8a36, b: 0x86a24a, shoulder: 0x6e6a5c, rock: 0x8d877c },
    road: { base: [74, 74, 78], tracks: 10, stones: false, lines: true },
    trees: { kind: 'mixed', density: 0.7 },
    grip: { road: 1.3, off: 0.75, offRolling: 7 },
    dust: { color: { r: 0.62, g: 0.62, b: 0.64 }, amount: 0.04 }, // on tarmac: only tyre smoke when sliding
  },
  desert: {
    id: 'desert',
    name: 'Sandmeer',
    surfaceName: 'Sand & Staub',
    sky: { top: 0x4f8ad0, horizon: 0xf0dcc0, fogNear: 110, fogFar: 700 },
    light: { sky: 0xffefd8, ground: 0x9a7a52, hemi: 1.15, sun: 0xffe6c4, sunIntensity: 3.1 },
    terrain: { amp: 26, scale: 380, detail: 6, edge: 'none' },
    ground: { a: 0xd8a868, b: 0xc89458, shoulder: 0xc08a52, rock: 0x9a6a48 },
    road: { base: [206, 160, 112], tracks: 30, stones: true, lines: false },
    trees: { kind: 'shrub', density: 0.35 },
    grip: { road: 0.85, off: 0.68, offRolling: 10 },
    dust: { color: { r: 0.86, g: 0.68, b: 0.48 }, amount: 1.8 },
  },
};

export function getEnvironment(id) {
  return ENVIRONMENTS[id] || ENVIRONMENTS.forest;
}
