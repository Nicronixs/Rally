// Photo textures for road and ground (Poly Haven, CC0; see public/textures/LICENSE.txt).
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const load = (name) => loader.loadAsync(`${import.meta.env.BASE_URL}textures/${name}.jpg`);

// average colour of an image, so the ground can be re-tinted to each environment's palette
function averageColor(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, 16, 16);
  const d = g.getImageData(0, 0, 16, 16).data;
  let r = 0, gg = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  return new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
}

// Returns { road: {diff, nor, tile}, ground: {diff, nor, tile, avg} } or null (then the procedural look is used).
export async function loadSurfaceTextures(env) {
  const t = env.textures;
  if (!t) return null;
  try {
    const [rd, rn, gd, gn] = await Promise.all([load(`${t.road}_diff`), load(`${t.road}_nor`), load(`${t.ground}_diff`), load(`${t.ground}_nor`)]);
    for (const x of [rd, gd]) x.colorSpace = THREE.SRGBColorSpace;
    for (const x of [rd, rn, gd, gn]) { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = 8; }
    return {
      road: { diff: rd, nor: rn, tile: t.roadTile },
      ground: { diff: gd, nor: gn, tile: t.groundTile, avg: averageColor(gd.image) },
    };
  } catch (e) {
    console.warn('Texturen konnten nicht geladen werden, nutze die einfache Optik', e);
    return null;
  }
}
