// Terrain around the stage: chunked height grid, rendered meshes and Rapier heightfields.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { fbm, smoothstep } from './noise.js';

export const CHUNK_CELLS = 64;
export const CELL_SIZE = 2;
const CHUNK_SIZE = CHUNK_CELLS * CELL_SIZE;
const CORRIDOR = 320; // terrain is built this far from the road
const BLEND_OUT = 18; // distance beyond the road edge where terrain is natural again

export function makeTerrainHeight(stage) {
  const hw = stage.halfWidth;
  const radius = hw + BLEND_OUT;
  return function terrainHeight(x, z) {
    const base = stage.baseHeight(x, z);
    const i = stage.hash.nearest(x, z, radius);
    if (i < 0) return base;
    const d = Math.hypot(stage.xs[i] - x, stage.zs[i] - z);
    const roadY = stage.ys[i];
    const w = smoothstep(hw + 0.8, hw + BLEND_OUT, d);
    // shallow ditch just beyond the road edge
    const e = (d - (hw + 1.2)) / 2.4;
    const ditch = e > 0 && e < 1 ? -0.35 * Math.sin(e * Math.PI) : 0;
    return roadY + (base - roadY) * w + ditch * (1 - w);
  };
}

function grassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const n = 0.5 * fbm(x / 9, y / 9, 7, 3) + 0.5 * fbm(x / 2.2, y / 2.2, 11, 2);
      const v = 205 + n * 50 + (Math.random() - 0.5) * 30;
      const o = (y * 256 + x) * 4;
      img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function buildTerrain(stage, world, scene) {
  const terrainHeight = makeTerrainHeight(stage);
  const b = stage.bounds;
  const minCX = Math.floor((b.minX - CORRIDOR) / CHUNK_SIZE);
  const maxCX = Math.floor((b.maxX + CORRIDOR) / CHUNK_SIZE);
  const minCZ = Math.floor((b.minZ - CORRIDOR) / CHUNK_SIZE);
  const maxCZ = Math.floor((b.maxZ + CORRIDOR) / CHUNK_SIZE);

  const N = CHUNK_CELLS + 1; // vertices per side
  const index = [];
  for (let r = 0; r < CHUNK_CELLS; r++) {
    for (let c = 0; c < CHUNK_CELLS; c++) {
      const a = r * N + c, b2 = a + 1, d = a + N, e = d + 1;
      index.push(a, d, b2, b2, d, e);
    }
  }

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, map: grassTexture(), roughness: 0.95, metalness: 0,
  });

  const grass = new THREE.Color(0x5d7a32), grass2 = new THREE.Color(0x7b8a3c);
  const dirt = new THREE.Color(0x7a6448), rock = new THREE.Color(0x7d776c);
  const tmp = new THREE.Color();
  const hw = stage.halfWidth;
  const chunks = [];
  const group = new THREE.Group();

  for (let cx = minCX; cx <= maxCX; cx++) {
    for (let cz = minCZ; cz <= maxCZ; cz++) {
      const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
      const centreX = x0 + CHUNK_SIZE / 2, centreZ = z0 + CHUNK_SIZE / 2;
      if (stage.hash.nearest(centreX, centreZ, CORRIDOR + CHUNK_SIZE * 0.71) < 0) continue;

      // heights with a one-vertex border for normals
      const P = N + 2;
      const hgrid = new Float32Array(P * P);
      for (let r = 0; r < P; r++) {
        for (let c = 0; c < P; c++) {
          hgrid[r * P + c] = terrainHeight(x0 + (c - 1) * CELL_SIZE, z0 + (r - 1) * CELL_SIZE);
        }
      }
      const pos = new Float32Array(N * N * 3);
      const nor = new Float32Array(N * N * 3);
      const col = new Float32Array(N * N * 3);
      const uv = new Float32Array(N * N * 2);
      const hf = new Float32Array(N * N);
      let minY = Infinity;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const v = r * N + c;
          const x = x0 + c * CELL_SIZE, z = z0 + r * CELL_SIZE;
          const y = hgrid[(r + 1) * P + (c + 1)];
          minY = Math.min(minY, y);
          pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
          const hl = hgrid[(r + 1) * P + c], hr = hgrid[(r + 1) * P + c + 2];
          const hd = hgrid[r * P + c + 1], hu = hgrid[(r + 2) * P + c + 1];
          let nx = hl - hr, ny = 2 * CELL_SIZE, nz = hd - hu;
          const l = Math.hypot(nx, ny, nz);
          nx /= l; ny /= l; nz /= l;
          nor[v * 3] = nx; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nz;
          uv[v * 2] = x / 6; uv[v * 2 + 1] = z / 6;
          hf[c * N + r] = y; // column-major for Rapier: column = x, row = z

          // colour
          const ni = stage.hash.nearest(x, z, hw + 6);
          const d = ni >= 0 ? Math.hypot(stage.xs[ni] - x, stage.zs[ni] - z) : 99;
          tmp.copy(grass).lerp(grass2, 0.5 + 0.5 * fbm(x / 40, z / 40, 3, 3));
          const slope = 1 - ny;
          tmp.lerp(rock, smoothstep(0.12, 0.3, slope));
          tmp.lerp(dirt, 1 - smoothstep(hw + 0.5, hw + 4.5, d));
          col[v * 3] = tmp.r; col[v * 3 + 1] = tmp.g; col[v * 3 + 2] = tmp.b;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(index);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      group.add(mesh);

      const desc = RAPIER.ColliderDesc.heightfield(CHUNK_CELLS, CHUNK_CELLS, hf,
        { x: CHUNK_SIZE, y: 1, z: CHUNK_SIZE })
        .setTranslation(centreX, 0, centreZ)
        .setFriction(0.9);
      const collider = world.createCollider(desc);
      collider.userData = { surface: 'terrain' };
      chunks.push({ cx, cz, mesh, collider, minY });
    }
  }
  scene.add(group);
  return { terrainHeight, chunks, group };
}
