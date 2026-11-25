// The rally car from car.glb, coloured with the car's livery.
// Local frame: +X forward, +Y up, +Z right; origin = centre of the physics body.
import * as THREE from 'three';

function numberTexture(num) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#111111';
  g.lineWidth = 10;
  g.strokeRect(10, 10, 236, 236);
  g.fillStyle = '#111111';
  g.font = 'bold 170px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(num), 128, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false; // glTF UV convention
  t.anisotropy = 4;
  return t;
}

// Replace the glTF materials with tuned ones (one instance per material name).
function makeMaterials(livery, envMap) {
  const paint = (color, extra = {}) => new THREE.MeshPhysicalMaterial({
    color, roughness: 0.32, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.12,
    envMap, envMapIntensity: 0.9, side: THREE.DoubleSide, ...extra,
  });
  const std = (o) => new THREE.MeshStandardMaterial({ envMap, envMapIntensity: 0.6, ...o });
  return {
    Paint: paint(livery.color),
    Stripe: paint(livery.stripe),
    Accent: paint(livery.accent, { side: THREE.FrontSide }),
    Dark: std({ color: 0x141416, roughness: 0.7, side: THREE.DoubleSide }),
    Glass: new THREE.MeshPhysicalMaterial({
      color: 0x16202a, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.55,
      envMap, envMapIntensity: 1.4, depthWrite: false,
    }),
    Lamp: std({ color: 0xfff6d8, emissive: 0xfff0c0, emissiveIntensity: 1.2, roughness: 0.1 }),
    TailLamp: std({ color: 0x9a0a0a, emissive: 0x800000, emissiveIntensity: 0.9, roughness: 0.2 }),
    Grille: std({ color: 0x0c0c0e, roughness: 0.8 }),
    Number: std({ map: numberTexture(livery.number), roughness: 0.5 }),
    Metal: std({ color: 0x9a9ca0, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.0 }),
    Interior: std({ color: 0x2a2a2d, roughness: 0.85, envMapIntensity: 0.3 }),
    Display: std({ color: 0x0a2a24, emissive: 0x10a080, emissiveIntensity: 0.7 }),
    Seat: std({ color: 0x1c1c22, roughness: 0.9, envMapIntensity: 0.2 }),
    Cage: std({ color: 0xc8c8cc, roughness: 0.35, metalness: 0.6 }),
    Marker: std({ color: 0xffd400, roughness: 0.5 }),
    Glove: std({ color: 0x181818, roughness: 0.8 }),
    Suit: std({ color: livery.stripe, roughness: 0.8, envMapIntensity: 0.3 }),
    Helmet: std({ color: 0xf4f4f4, roughness: 0.25, envMapIntensity: 0.9 }),
    Visor: std({ color: 0x101418, roughness: 0.05, metalness: 0.5, envMapIntensity: 1.2 }),
    Paper: std({ color: 0xf4f1e6, roughness: 0.9 }),
    Tyre: std({ color: 0x1b1b1c, roughness: 0.92, envMapIntensity: 0.2 }),
    Rim: std({ color: livery.rim ?? 0xe8e8e8, roughness: 0.3, metalness: 0.6, envMapIntensity: 1.0 }),
    Brake: std({ color: 0x6c6e72, roughness: 0.45, metalness: 0.8 }),
    Caliper: std({ color: livery.accent, roughness: 0.4 }),
  };
}

function useMaterials(obj, mats) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const m = mats[o.material.name];
    if (m) o.material = m;
    else if (o.material.name) console.warn('Kein Material für', o.material.name);
  });
}

export function buildCarModel(models, livery, envMap) {
  const mats = makeMaterials(livery, envMap);
  const root = models.car.getObjectByName('Car').clone(true);
  useMaterials(root, mats);
  root.getObjectByName('Glass').traverse((o) => { o.castShadow = false; });

  // wheels: steerGroup (suspension + steering) -> spin (rolling) -> wheel; caliper does not roll
  const wheelSrc = models.car.getObjectByName('Wheel');
  const caliperSrc = models.car.getObjectByName('Caliper');
  const wheels = [];
  for (let i = 0; i < 4; i++) {
    const steerGroup = new THREE.Group();
    const spin = new THREE.Group();
    const w = wheelSrc.clone(true);
    w.position.set(0, 0, 0);
    useMaterials(w, mats);
    spin.add(w);
    const cal = caliperSrc.clone(true);
    cal.position.set(0, 0, 0);
    useMaterials(cal, mats);
    steerGroup.add(spin, cal);
    // the model is a left wheel; mirror it for the right side (+Z)
    if (i % 2 === 1) steerGroup.scale.z = -1;
    root.add(steerGroup);
    wheels.push({ steerGroup, spin });
  }

  const glass = root.getObjectByName('Glass');
  const wing = root.getObjectByName('Wing');
  const driver = root.getObjectByName('DriverFigure');
  const codriver = root.getObjectByName('CodriverFigure');
  const steeringWheel = root.getObjectByName('SteeringWheel');
  const headPosition = root.getObjectByName('HeadDriver').position.clone();
  const smokePoint = root.getObjectByName('EngineSmoke').position.clone();

  // in the cockpit the windows are hidden and your own body is not drawn
  function setView(role, cockpit) {
    glass.visible = !cockpit;
    driver.visible = !(cockpit && role !== 'codriver');
    codriver.visible = !(cockpit && role === 'codriver');
  }

  // damage: dirty, scratched paint and a lost rear wing
  const clean = { Paint: mats.Paint.color.clone(), Stripe: mats.Stripe.color.clone() };
  const grime = new THREE.Color(0x4a4036);
  function setDamage(d) {
    for (const k of ['Paint', 'Stripe']) {
      mats[k].color.copy(clean[k]).lerp(grime, Math.min(0.6, d.body * 0.6));
      mats[k].roughness = 0.32 + d.body * 0.5;
      mats[k].clearcoat = 0.8 * (1 - d.body);
    }
    wing.visible = d.body < 0.65;
  }

  return { root, wheels, steeringWheel, setView, setDamage, headPosition, smokePoint };
}
