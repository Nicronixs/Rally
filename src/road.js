// Visual road ribbon, vegetation, start/finish gates and split boards.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mulberry32, fbm } from './noise.js';

function roadTexture(look) {
  const W = 256, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const [br, bg, bb] = look.base;
  const base = (br + bg + bb) / 3;
  const tint = look.tint || [1, 1, 1];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const edge = Math.min(u, 1 - u) / (look.lines ? 0.05 : 0.09); // fade at the road edges
      const alpha = Math.min(1, edge);
      // darker, compacted wheel tracks
      const track = Math.exp(-(((u - 0.3) / 0.06) ** 2)) + Math.exp(-(((u - 0.7) / 0.06) ** 2));
      const n = fbm(x / 6, y / 6, 5, 3) * 0.6 + fbm(x / 1.5, y / 1.5, 9, 2) * 0.4;
      const stone = look.stones && Math.random() < 0.04 ? 30 : 0;
      const v = base + n * (look.lines ? 14 : 45) - track * look.tracks + stone + (Math.random() - 0.5) * (look.lines ? 10 : 22);
      let r = v * (br / base) * tint[0], gg = v * (bg / base) * tint[1], b = v * (bb / base) * tint[2];
      if (look.lines) {
        // white edge lines and a dashed centre line
        const edgeLine = Math.abs(u - 0.09) < 0.012 || Math.abs(u - 0.91) < 0.012;
        const centre = Math.abs(u - 0.5) < 0.01 && (y % 128) < 70;
        if (edgeLine || centre) { r = gg = b = 225 + Math.random() * 20; }
      }
      const o = (y * W + x) * 4;
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b;
      img.data[o + 3] = 255 * alpha * (look.lines ? 1 : 0.85 + 0.15 * Math.random());
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function buildRoad(stage, scene, env) {
  const hw = stage.halfWidth + 0.5;
  const COLS = 7, STEP = 2;
  const rows = Math.floor((stage.count - 1) / STEP) + 1;
  const pos = new Float32Array(rows * COLS * 3);
  const uv = new Float32Array(rows * COLS * 2);
  for (let r = 0; r < rows; r++) {
    const i = Math.min(stage.count - 1, r * STEP);
    const nx = -stage.tz[i], nz = stage.tx[i];
    for (let c = 0; c < COLS; c++) {
      const t = c / (COLS - 1);
      const off = (t * 2 - 1) * hw;
      const v = r * COLS + c;
      pos[v * 3] = stage.xs[i] + nx * off;
      pos[v * 3 + 1] = stage.ys[i] + 0.07;
      pos[v * 3 + 2] = stage.zs[i] + nz * off;
      uv[v * 2] = t; uv[v * 2 + 1] = i / 14;
    }
  }
  const index = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      const a = r * COLS + c, b = a + 1, d = a + COLS, e = d + 1;
      index.push(a, b, d, b, e, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  // the road normals must face up whatever the winding turned out to be
  const n = geo.getAttribute('normal');
  if (n.getY(0) < 0) { for (let k = 0; k < index.length; k += 3) { const t = index[k + 1]; index[k + 1] = index[k + 2]; index[k + 2] = t; } geo.setIndex(index); geo.computeVertexNormals(); }
  const mat = new THREE.MeshStandardMaterial({
    map: roadTexture(env.road), transparent: true, depthWrite: false, roughness: env.road.lines ? 0.85 : 1,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return mesh;
}

// Vegetation and rocks. Kinds: pine, snowpine, mixed (pines + broadleaf), shrub (bushes + rocks).
export function buildTrees(stage, terrain, world, scene, env) {
  const rng = mulberry32(stage.seed * 3 + 1);
  const b = stage.bounds;
  const hw = stage.halfWidth;
  const kind = env.trees.kind;
  const items = [];
  const area = (b.maxX - b.minX + 600) * (b.maxZ - b.minZ + 600);
  const candidates = Math.min(60000, Math.floor(area / 90));
  for (let k = 0; k < candidates && items.length < 9000; k++) {
    const x = b.minX - 300 + rng() * (b.maxX - b.minX + 600);
    const z = b.minZ - 300 + rng() * (b.maxZ - b.minZ + 600);
    const near = stage.hash.nearest(x, z, 260);
    if (near < 0) continue;
    const d = Math.hypot(stage.xs[near] - x, stage.zs[near] - z);
    if (d < hw + 6.5) continue;
    const forest = fbm(x / 180, z / 180, stage.seed + 5, 3);
    const density = (forest > 0.05 ? 1 : 0.12) * env.trees.density;
    if (rng() > density) continue;
    let type = 'pine';
    if (kind === 'mixed') type = rng() < 0.45 ? 'broad' : 'pine';
    if (kind === 'shrub') type = rng() < 0.3 ? 'rock' : 'shrub';
    items.push({ x, z, y: terrain.terrainHeight(x, z), s: 0.75 + rng() * 0.6, d, hue: rng(), type });
  }

  const pineTrunk = new THREE.CylinderGeometry(0.18, 0.28, 3, 6); pineTrunk.translate(0, 1.5, 0);
  const pineCrown = new THREE.ConeGeometry(1.9, 6.5, 7); pineCrown.translate(0, 5.6, 0);
  const broadTrunk = new THREE.CylinderGeometry(0.2, 0.32, 3.6, 6); broadTrunk.translate(0, 1.8, 0);
  const broadCrown = new THREE.IcosahedronGeometry(2.5, 0); broadCrown.translate(0, 5.0, 0);
  const shrubGeo = new THREE.IcosahedronGeometry(1.0, 0); shrubGeo.scale(1.2, 0.7, 1.2); shrubGeo.translate(0, 0.45, 0);
  const rockGeo = new THREE.DodecahedronGeometry(1.2, 0); rockGeo.scale(1.3, 0.75, 1.0); rockGeo.translate(0, 0.35, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });

  const layers = {
    pine: [[pineTrunk, trunkMat, false], [pineCrown, leafMat, true]],
    broad: [[broadTrunk, trunkMat, false], [broadCrown, leafMat, true]],
    shrub: [[shrubGeo, leafMat, true]],
    rock: [[rockGeo, leafMat, true]],
  };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color(), white = new THREE.Color(0xf4f7fb);
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (const type of Object.keys(layers)) {
    const list = items.filter((t) => t.type === type);
    if (!list.length) continue;
    for (const [geo, mat, colored] of layers[type]) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((t, i) => {
        q.setFromAxisAngle(yAxis, t.hue * 6.28);
        sc.set(t.s, t.s * (0.9 + t.hue * 0.3), t.s);
        p.set(t.x, t.y - 0.2, t.z);
        m.compose(p, q, sc);
        im.setMatrixAt(i, m);
        if (colored) {
          if (type === 'rock') col.setHSL(0.07, 0.25, 0.32 + t.hue * 0.12);
          else if (type === 'shrub') col.setHSL(0.16 + t.hue * 0.08, 0.35, 0.22 + t.hue * 0.08);
          else if (type === 'broad') col.setHSL(0.22 + t.hue * 0.1, 0.5, 0.22 + t.hue * 0.08);
          else col.setHSL(0.27 + t.hue * 0.08, 0.45, 0.17 + t.hue * 0.08);
          if (kind === 'snowpine') col.lerp(white, 0.45 + t.hue * 0.3);
          im.setColorAt(i, col);
        }
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      scene.add(im);
    }
    // only obstacles near the road need physics
    for (const t of list) {
      if (t.d > hw + 30 || type === 'shrub') continue;
      if (type === 'rock') world.createCollider(RAPIER.ColliderDesc.ball(0.95 * t.s).setTranslation(t.x, t.y + 0.1, t.z));
      else world.createCollider(RAPIER.ColliderDesc.cylinder(2, 0.3 * t.s).setTranslation(t.x, t.y + 1.8, t.z));
    }
  }
  return items.length;
}

function bannerTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 96);
  g.fillStyle = fg; g.font = 'bold 60px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function gate(stage, i, text, bg, fg, scene) {
  const hw = stage.halfWidth + 1.2;
  const group = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  // local frame: x across the road, z along the driving direction
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.2, 0.35), postMat);
    post.position.set(side * hw, 2.6, 0);
    post.castShadow = true;
    group.add(post);
  }
  const tex = bannerTexture(text, bg, fg);
  const face = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55 });
  const banner = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.4, 1.2, 0.2),
    [postMat, postMat, postMat, postMat, face, face]);
  banner.position.y = 4.8;
  banner.castShadow = true;
  group.add(banner);
  group.position.set(stage.xs[i], stage.ys[i], stage.zs[i]);
  group.rotation.y = Math.atan2(stage.tx[i], stage.tz[i]);
  scene.add(group);
}

export function buildGates(stage, scene) {
  gate(stage, stage.startIndex, 'START', '#d22b2b', '#ffffff', scene);
  gate(stage, stage.finishIndex, 'ZIEL', '#1d1d1d', '#ffd400', scene);
  stage.splitIndices.forEach((i, k) => gate(stage, i, `SPLIT ${k + 1}`, '#1f5fbf', '#ffffff', scene));
}
