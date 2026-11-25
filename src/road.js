// Visual road ribbon, vegetation, start/finish gates and split boards.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mulberry32, fbm } from './noise.js';
import { meshParts } from './models.js';

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

// Road texture from a photo: tiled photo (one canvas = 14 m of road), darker wheel tracks,
// white lines on tarmac and a soft transparent edge.
const ROAD_TEX_LENGTH = 14; // metres of road per texture repeat (matches the road UVs)
function photoRoadTexture(look, img, tile, widthM) {
  const W = 512, H = 768;
  const tx = Math.round((tile / widthM) * W), ty = Math.round((tile / ROAD_TEX_LENGTH) * H);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // seamless photo tiles; across the road the start is shifted so the tile border is not on the centre line
  for (let y = 0; y < H; y += ty) for (let x = -tx * 0.37; x < W; x += tx) g.drawImage(img, x, y, tx, ty);
  // re-tint the photo to the environment's road colour (keeps sand warm, snow bright, tarmac dark)
  const px = g.getImageData(0, 0, W, H);
  const d = px.data;
  let ar = 0, ag = 0, ab = 0;
  for (let i = 0; i < d.length; i += 4) { ar += d[i]; ag += d[i + 1]; ab += d[i + 2]; }
  const n = d.length / 4;
  const tint = look.tint || [1, 1, 1];
  const kr = (look.base[0] * tint[0]) / (ar / n), kg = (look.base[1] * tint[1]) / (ag / n), kb = (look.base[2] * tint[2]) / (ab / n);
  for (let i = 0; i < d.length; i += 4) { d[i] *= kr; d[i + 1] *= kg; d[i + 2] *= kb; }
  g.putImageData(px, 0, 0);
  // compacted wheel tracks
  g.globalCompositeOperation = 'multiply';
  const k = Math.round(255 * (1 - look.tracks / 140));
  const tracks = g.createLinearGradient(0, 0, W, 0);
  for (const [u, dark] of [[0, 0], [0.22, 0], [0.3, 1], [0.38, 0], [0.62, 0], [0.7, 1], [0.78, 0], [1, 0]]) {
    const v = dark ? k : 255;
    tracks.addColorStop(u, `rgb(${v},${v},${v})`);
  }
  g.fillStyle = tracks;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  if (look.lines) {
    g.fillStyle = 'rgba(238,238,238,0.95)';
    g.fillRect(Math.round(W * 0.085), 0, Math.round(W * 0.02), H);
    g.fillRect(Math.round(W * 0.895), 0, Math.round(W * 0.02), H);
    for (let y = 0; y < H; y += 128) g.fillRect(Math.round(W * 0.495), y, Math.round(W * 0.012), 70);
  }
  // soft edges into the terrain
  g.globalCompositeOperation = 'destination-in';
  const e = look.lines ? 0.05 : 0.1;
  const edge = g.createLinearGradient(0, 0, W, 0);
  edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(e, 'rgba(0,0,0,1)');
  edge.addColorStop(1 - e, 'rgba(0,0,0,1)'); edge.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = edge;
  g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildRoad(stage, scene, env, tex = null) {
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
    map: tex ? photoRoadTexture(env.road, tex.diff.image, tex.tile, hw * 2) : roadTexture(env.road),
    transparent: true, depthWrite: false, roughness: env.road.lines ? 0.85 : 1,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  if (tex) {
    const nor = tex.nor.clone();
    nor.repeat.set((hw * 2) / tex.tile, ROAD_TEX_LENGTH / tex.tile);
    nor.needsUpdate = true;
    mat.normalMap = nor;
    mat.normalScale.set(0.9, 0.9);
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return mesh;
}

// Vegetation and rocks from nature.glb, drawn as instanced meshes.
// Kinds: pine, snowpine, mixed (pines + broadleaf), shrub (bushes, rocks and cacti).
const MODEL = { pine: 'Pine', snowpine: 'PineSnow', broad: 'Broadleaf', shrub: 'Bush', rock: 'Rock', cactus: 'Cactus' };
const TINTED = new Set(['Needles', 'Leaves', 'Bush', 'Rock', 'Cactus']);

export function buildTrees(stage, terrain, world, scene, env, models) {
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
    let type = kind === 'snowpine' ? 'snowpine' : 'pine';
    if (kind === 'mixed') type = rng() < 0.45 ? 'broad' : 'pine';
    if (kind === 'shrub') { const r = rng(); type = r < 0.28 ? 'rock' : r < 0.42 ? 'cactus' : 'shrub'; }
    items.push({ x, z, y: terrain.terrainHeight(x, z), s: 0.75 + rng() * 0.6, d, hue: rng(), type });
  }

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const tint = (type, h) => {
    if (type === 'rock') return col.setHSL(0.07, 0.18, 0.36 + h * 0.14);
    if (type === 'shrub') return col.setHSL(0.15 + h * 0.08, 0.38, 0.26 + h * 0.08);
    if (type === 'cactus') return col.setHSL(0.27 + h * 0.04, 0.42, 0.28 + h * 0.06);
    if (type === 'broad') return col.setHSL(0.22 + h * 0.1, 0.5, 0.26 + h * 0.08);
    return col.setHSL(0.29 + h * 0.06, 0.42, 0.18 + h * 0.07);
  };
  for (const type of Object.keys(MODEL)) {
    const list = items.filter((t) => t.type === type);
    if (!list.length) continue;
    for (const part of meshParts(models.nature.getObjectByName(MODEL[type]))) {
      const tinted = TINTED.has(part.material.name);
      const mat = part.material.clone();
      if (tinted) mat.color.set(0xffffff);
      const im = new THREE.InstancedMesh(part.geometry, mat, list.length);
      list.forEach((t, i) => {
        q.setFromAxisAngle(yAxis, t.hue * 6.28);
        sc.set(t.s, t.s * (0.9 + t.hue * 0.3), t.s);
        p.set(t.x, t.y - 0.2, t.z);
        m.compose(p, q, sc);
        im.setMatrixAt(i, m);
        if (tinted) im.setColorAt(i, tint(type, t.hue));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      scene.add(im);
    }
    // only obstacles near the road need physics
    for (const t of list) {
      if (t.d > hw + 30 || type === 'shrub') continue;
      if (type === 'rock') world.createCollider(RAPIER.ColliderDesc.ball(0.9 * t.s).setTranslation(t.x, t.y + 0.1, t.z));
      else world.createCollider(RAPIER.ColliderDesc.cylinder(2, (type === 'cactus' ? 0.25 : 0.3) * t.s).setTranslation(t.x, t.y + 1.8, t.z));
    }
  }
  return items.length;
}

function bannerTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = fg; g.font = 'bold 84px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 512, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false; // glTF UV convention
  t.anisotropy = 8;
  return t;
}

// Truss gate from gate.glb; local X across the road, +Z in driving direction.
function gate(stage, i, text, bg, fg, scene, world, models) {
  const g = models.gate.getObjectByName('Gate').clone(true);
  const tex = bannerTexture(text, bg, fg);
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    // metal without reflections renders almost black; keep the aluminium truss bright
    if (o.material.metalness > 0.5) { o.material = o.material.clone(); o.material.metalness = 0.25; o.material.roughness = 0.45; }
    if (o.material.name === 'Banner') {
      o.material = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.45, roughness: 0.8 });
    }
  });
  g.position.set(stage.xs[i], stage.ys[i], stage.zs[i]);
  const yaw = Math.atan2(stage.tx[i], stage.tz[i]);
  g.rotation.y = yaw;
  scene.add(g);
  // the truss columns are solid
  for (const side of [-1, 1]) {
    const lx = side * 5.4;
    const x = stage.xs[i] + Math.cos(yaw) * lx, z = stage.zs[i] - Math.sin(yaw) * lx;
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.2, 2.7, 0.2).setTranslation(x, stage.ys[i] + 2.7, z)
      .setRotation({ w: Math.cos(yaw / 2), x: 0, y: Math.sin(yaw / 2), z: 0 }));
  }
}

export function buildGates(stage, scene, world, models) {
  gate(stage, stage.startIndex, 'START', '#d22b2b', '#ffffff', scene, world, models);
  gate(stage, stage.finishIndex, 'ZIEL', '#1d1d1d', '#ffd400', scene, world, models);
  stage.splitIndices.forEach((i, k) => gate(stage, i, `SPLIT ${k + 1}`, '#1f5fbf', '#ffffff', scene, world, models));
}
