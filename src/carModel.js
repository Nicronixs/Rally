// Low-poly rally car built from simple shapes. Local frame: +X forward, +Y up, +Z right.
import * as THREE from 'three';
import { TUNING } from './vehicle.js';

function extrudeProfile(points, depth, material) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
  geo.translate(0, 0, -depth / 2);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function numberTexture(num) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111111';
  g.font = 'bold 84px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(num), 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCarModel({ color = 0xf2f2f2, stripe = 0x1f5fbf, accent = 0xe0322b, number = 7 } = {}) {
  const root = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.1, metalness: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: stripe, roughness: 0.4 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff0b0, emissiveIntensity: 0.6 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x8a0000, emissive: 0x550000 });

  const body = new THREE.Group();
  body.position.y = -0.02;
  root.add(body);

  // lower body
  body.add(extrudeProfile([[-2.0, -0.3], [1.92, -0.3], [2.06, -0.06], [2.0, 0.16], [0.82, 0.32], [-1.92, 0.34], [-2.05, 0.08]], 1.72, paint));
  // glasshouse
  const glassHouse = extrudeProfile([[0.8, 0.3], [0.02, 0.84], [-1.28, 0.84], [-1.86, 0.42], [-1.86, 0.3]], 1.42, glass);
  body.add(glassHouse);
  // roof, pillars
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.07, 1.44), paint);
  roof.position.set(-0.63, 0.88, 0); roof.castShadow = true; body.add(roof);
  for (const z of [-0.72, 0.72]) {
    const bp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, 0.04), paint);
    bp.position.set(-0.55, 0.58, z); body.add(bp);
  }
  const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.4), black);
  scoop.position.set(-0.3, 0.95, 0); body.add(scoop);

  // livery stripes along the sides and over the bonnet/roof
  for (const z of [-0.895, 0.895]) {
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.14, 0.02), stripeMat);
    s1.position.set(0, 0.12, z); body.add(s1);
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.06, 0.02), accentMat);
    s2.position.set(0, -0.02, z); body.add(s2);
    const num = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), new THREE.MeshStandardMaterial({ map: numberTexture(number) }));
    num.position.set(-0.5, 0.05, z + Math.sign(z) * 0.012);
    num.rotation.y = z > 0 ? 0 : Math.PI;
    body.add(num);
  }
  const bonnetStripe = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.02, 0.32), stripeMat);
  bonnetStripe.position.set(1.4, 0.25, 0); bonnetStripe.rotation.z = -0.13; body.add(bonnetStripe);
  const roofStripe = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.02, 0.32), stripeMat);
  roofStripe.position.set(-0.63, 0.925, 0); body.add(roofStripe);

  // spoiler
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 1.62), accentMat);
  wing.position.set(-1.92, 0.68, 0); wing.castShadow = true; body.add(wing);
  for (const z of [-0.55, 0.55]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.05), black);
    st.position.set(-1.92, 0.52, z); body.add(st);
  }

  // bumpers, lights, mud flaps
  const fb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 1.7), black);
  fb.position.set(2.04, -0.22, 0); body.add(fb);
  const rb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 1.7), black);
  rb.position.set(-2.04, -0.2, 0); body.add(rb);
  for (const z of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.32), lightMat);
    hl.position.set(2.06, 0.06, z); body.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.3), tailMat);
    tl.position.set(-2.06, 0.18, z); body.add(tl);
    for (const x of [TUNING.wheelBase - 0.5, -TUNING.wheelBase - 0.48]) {
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.3), accentMat);
      flap.position.set(x, -0.32, z * 1.33); body.add(flap);
    }
  }
  // rally light pod on the bonnet front
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 1.2), black);
  bar.position.set(1.98, 0.2, 0); body.add(bar);
  for (const z of [-0.45, -0.15, 0.15, 0.45]) {
    const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 14), lightMat);
    lp.rotation.z = Math.PI / 2;
    lp.position.set(2.04, 0.27, z); body.add(lp);
  }

  // wheels
  const tyreGeo = new THREE.CylinderGeometry(TUNING.wheelRadius, TUNING.wheelRadius, 0.24, 18);
  tyreGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(TUNING.wheelRadius * 0.62, TUNING.wheelRadius * 0.62, 0.25, 6);
  rimGeo.rotateX(Math.PI / 2);
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.95 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.3, metalness: 0.7 });
  const wheels = [];
  for (let i = 0; i < 4; i++) {
    const steerGroup = new THREE.Group();
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(tyreGeo, tyreMat);
    tyre.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    spin.add(tyre, rim);
    steerGroup.add(spin);
    root.add(steerGroup);
    wheels.push({ steerGroup, spin });
  }

  const cockpit = buildInterior(body, paint, black);

  // hide the opaque glass when looking out from the driver's seat
  function setCockpitView(on) {
    glassHouse.visible = !on;
  }

  // damage: dirty, scratched paint and a lost rear wing
  const cleanPaint = paint.color.clone();
  const grime = new THREE.Color(0x4a4036);
  function setDamage(d) {
    paint.color.copy(cleanPaint).lerp(grime, Math.min(0.6, d.body * 0.6));
    paint.roughness = 0.35 + d.body * 0.5;
    wing.visible = d.body < 0.65;
  }

  return { root, wheels, steeringWheel: cockpit.steeringWheel, setCockpitView, setDamage, headPosition: cockpit.head };
}

// Interior seen from the driver's seat (left-hand drive: driver on the -Z side).
function buildInterior(body, paint, black) {
  const dashMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.9 });
  const cageMat = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.4, metalness: 0.6 });
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.receiveShadow = true; body.add(mesh); return mesh; };
  const DRIVER_Z = -0.36;

  // A-pillars along the windscreen edges, C-pillars at the back, windscreen header
  const beam = (x1, y1, x2, y2, z, thick, mat) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const m = add(new THREE.Mesh(new THREE.BoxGeometry(len, thick, thick), mat), (x1 + x2) / 2, (y1 + y2) / 2, z);
    m.rotation.z = Math.atan2(y2 - y1, x2 - x1);
    return m;
  };
  for (const z of [-0.69, 0.69]) {
    beam(0.8, 0.31, 0.02, 0.85, z, 0.09, paint);
    beam(-1.28, 0.85, -1.86, 0.42, z, 0.12, paint);
  }
  add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 1.42), paint), 0.05, 0.855, 0);

  // dashboard with instrument hood
  add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 1.44), dashMat), 0.58, 0.36, 0);
  const hood = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.32), dashMat), 0.46, 0.45, DRIVER_Z);
  hood.rotation.z = -0.25;
  add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.16), black), 0.04, 0.76, -0.05); // mirror

  // roll cage
  const tube = (a, b) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 8), cageMat);
    m.position.copy(va).add(vb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    body.add(m);
  };
  for (const z of [-0.62, 0.62]) {
    tube([-0.8, 0.3, z], [-0.8, 0.8, z]); // main hoop legs
    tube([0.62, 0.3, z], [0.06, 0.78, z]); // front hoop along the A-pillar
    tube([0.06, 0.78, z], [-0.8, 0.8, z]); // roof bar
  }
  tube([-0.8, 0.8, -0.62], [-0.8, 0.8, 0.62]);
  tube([-0.8, 0.8, -0.62], [-0.8, 0.32, 0.62]); // diagonal

  // steering wheel: tilted towards the driver, spins around its own axis
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.3, 8), black);
  column.rotation.z = Math.PI / 2 + 0.35;
  add(column, 0.38, 0.41, DRIVER_Z);
  const mount = new THREE.Group();
  mount.position.set(0.24, 0.46, DRIVER_Z);
  mount.rotation.z = 0.35;
  body.add(mount);
  const spinner = new THREE.Group();
  mount.add(spinner);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 8, 28), black);
  rim.rotation.y = Math.PI / 2;
  spinner.add(rim);
  const spokeH = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.3), dashMat);
  spinner.add(spokeH);
  const spokeV = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.17, 0.035), dashMat);
  spokeV.position.y = -0.085;
  spinner.add(spokeV);
  const marker = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.03), new THREE.MeshStandardMaterial({ color: 0xffd400 }));
  marker.position.y = 0.16;
  spinner.add(marker);

  return { steeringWheel: spinner, head: new THREE.Vector3(-0.4, 0.71, DRIVER_Z) };
}
