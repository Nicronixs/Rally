import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { generateStage } from './track.js';
import { buildTerrain } from './terrain.js';
import { buildRoad, buildTrees, buildGates } from './road.js';
import { Vehicle, TUNING, rotate } from './vehicle.js';
import { buildCarModel } from './carModel.js';
import { Dust } from './effects.js';
import { CarAudio } from './audio.js';
import { Input } from './input.js';

const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed')) || 7;
const AUTOPILOT = params.has('autopilot');

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

async function main() {
  await RAPIER.init();
  $('loading').textContent = 'Strecke wird erzeugt…';
  await nextFrame();

  // ---------- renderer & scene ----------
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const horizon = new THREE.Color(0xc9d8e4);
  scene.background = horizon;
  scene.fog = new THREE.Fog(horizon, 90, 620);

  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 5000);

  // sky dome
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(3000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x3f78c0) }, bottom: { value: horizon } },
      vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vPos; void main(){ float h = clamp(normalize(vPos).y * 2.2, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.7)), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    }));
  sky.renderOrder = -1;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x5a5a3a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1d8, 2.6);
  const sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 300;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // ---------- world ----------
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  const stage = generateStage(SEED);
  $('loading').textContent = 'Gelände wird gebaut…';
  await nextFrame();
  const terrain = buildTerrain(stage, world, scene);
  buildRoad(stage, scene);
  $('loading').textContent = 'Wald wird gepflanzt…';
  await nextFrame();
  buildTrees(stage, terrain, world, scene);
  buildGates(stage, scene);

  const vehicle = new Vehicle(world);
  const car = buildCarModel();
  scene.add(car.root);
  const dust = new Dust(scene);
  const audio = new CarAudio();
  const input = new Input();

  // ---------- game state ----------
  const stageKm = ((stage.finishIndex - stage.startIndex) / 1000).toFixed(2).replace('.', ',');
  const bestKey = `rally.best.${SEED}`;
  const bestSplitsKey = `rally.bestSplits.${SEED}`;
  const game = {
    state: 'intro', // intro, countdown, running, finished
    time: 0,
    countdown: 0,
    trackIndex: stage.startIndex,
    splits: [],
    flipTimer: 0,
    camMode: 0,
    best: Number(localStorage.getItem(bestKey)) || null,
    bestSplits: JSON.parse(localStorage.getItem(bestSplitsKey) || 'null'),
  };

  function placeAtIndex(i) {
    i = Math.max(2, Math.min(stage.count - 3, i));
    const yaw = Math.atan2(-stage.tz[i], stage.tx[i]);
    vehicle.place(stage.xs[i], stage.ys[i] + 0.85, stage.zs[i], yaw);
    game.trackIndex = i;
    snapshot();
    copySnapshot();
  }

  function restart() {
    placeAtIndex(stage.startIndex - 4);
    game.state = 'countdown';
    game.countdown = 3.5;
    game.time = 0;
    game.splits = [];
    $('splits').innerHTML = '';
    $('result').classList.add('hidden');
    $('overlay').classList.add('hidden');
    $('hud').classList.remove('hidden');
  }

  function finish() {
    game.state = 'finished';
    const t = game.time;
    let line = '';
    if (game.best === null || t < game.best) {
      line = game.best === null ? 'Erste Zeit auf dieser Strecke!' : `Neue Bestzeit! (−${(game.best - t).toFixed(2)} s)`;
      game.best = t;
      game.bestSplits = game.splits.slice();
      localStorage.setItem(bestKey, String(t));
      localStorage.setItem(bestSplitsKey, JSON.stringify(game.bestSplits));
    } else {
      line = `Bestzeit ${formatTime(game.best)} (+${(t - game.best).toFixed(2)} s)`;
    }
    setTimeout(() => {
      if (game.state !== 'finished') return;
      $('intro').classList.add('hidden');
      $('loading').classList.add('hidden');
      const r = $('result');
      r.innerHTML = `<p class="sub">Etappe beendet</p><div class="result-time">${formatTime(t)}</div>
        <div class="result-best">${line}</div><p class="small">Enter = nochmal fahren · N = neue Strecke</p>`;
      r.classList.remove('hidden');
      $('overlay').classList.remove('hidden');
    }, 1800);
  }

  // ---------- interpolation between physics steps ----------
  const prevPos = new THREE.Vector3(), currPos = new THREE.Vector3();
  const prevQuat = new THREE.Quaternion(), currQuat = new THREE.Quaternion();
  function snapshot() {
    prevPos.copy(currPos); prevQuat.copy(currQuat);
    const t = vehicle.body.translation(), q = vehicle.body.rotation();
    currPos.set(t.x, t.y, t.z); currQuat.set(q.x, q.y, q.z, q.w);
  }
  function copySnapshot() { prevPos.copy(currPos); prevQuat.copy(currQuat); }

  function surfaceAt(x, z) {
    const i = stage.nearestTracked(x, z, game.trackIndex);
    const d = i >= 0 ? Math.hypot(stage.xs[i] - x, stage.zs[i] - z) : 99;
    if (d < stage.halfWidth + 0.4) return { grip: 1, rolling: 0, kind: 'gravel' };
    return { grip: 0.8, rolling: 6, kind: 'grass' };
  }

  function autopilot() {
    const t = vehicle.body.translation();
    const look = Math.min(stage.count - 1, game.trackIndex + 12 + Math.floor(Math.abs(vehicle.speed) * 0.6));
    const dx = stage.xs[look] - t.x, dz = stage.zs[look] - t.z;
    const f = vehicle.forward();
    const cross = f.x * dz - f.z * dx; // >0 means target is to the right
    const ang = Math.atan2(-cross, f.x * dx + f.z * dz);
    let maxC = 0;
    for (let k = game.trackIndex; k < Math.min(stage.count, game.trackIndex + 60); k++) maxC = Math.max(maxC, Math.abs(stage.curv[k]));
    const safe = Math.sqrt((0.85 * 9.81) / Math.max(maxC, 0.003));
    const v = vehicle.speed;
    return { throttle: v < safe ? 1 : 0, brake: v > safe + 3 ? 1 : 0, steer: Math.max(-1, Math.min(1, ang * 2.2)), handbrake: false };
  }

  // ---------- intro ----------
  $('loading').textContent = '';
  $('stage-info').textContent = `Etappe „Waldschotter“ · ${stageKm} km · Strecke #${SEED}` +
    (game.best ? ` · Bestzeit ${formatTime(game.best)}` : '');
  $('intro').classList.remove('hidden');
  placeAtIndex(stage.startIndex - 4);

  const startHandler = () => {
    if (game.state !== 'intro') return;
    audio.start();
    restart();
  };
  window.addEventListener('keydown', startHandler);
  window.addEventListener('pointerdown', startHandler);
  if (AUTOPILOT) startHandler();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------- camera ----------
  let camYaw = Math.atan2(stage.tz[stage.startIndex], stage.tx[stage.startIndex]);
  const camPos = new THREE.Vector3();
  let camInit = false;
  const lookTarget = new THREE.Vector3();
  const tmpV = new THREE.Vector3();

  function updateCamera(dt, pos, quat) {
    const fwd = tmpV.set(1, 0, 0).applyQuaternion(quat);
    const carYaw = Math.atan2(fwd.z, fwd.x);
    const speed = Math.abs(vehicle.speed);
    if (game.camMode === 0) {
      let d = carYaw - camYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      camYaw += d * (1 - Math.exp(-dt * 3.5));
      const dist = 6.4 + speed * 0.03, height = 2.3;
      const want = new THREE.Vector3(pos.x - Math.cos(camYaw) * dist, pos.y + height, pos.z - Math.sin(camYaw) * dist);
      const ground = terrain.terrainHeight(want.x, want.z) + 0.8;
      if (want.y < ground) want.y = ground;
      if (!camInit) { camPos.copy(want); camInit = true; }
      camPos.lerp(want, 1 - Math.exp(-dt * 12));
      camera.position.copy(camPos);
      lookTarget.set(pos.x + Math.cos(camYaw) * 3, pos.y + 0.9, pos.z + Math.sin(camYaw) * 3);
      camera.lookAt(lookTarget);
    } else {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
      camera.position.copy(pos).addScaledVector(fwd, 0.3).addScaledVector(up, 1.12);
      camera.up.copy(up);
      lookTarget.copy(camera.position).addScaledVector(fwd, 10);
      camera.lookAt(lookTarget);
      camera.up.set(0, 1, 0);
      camInit = false;
    }
    const fov = 62 + Math.min(14, speed * 0.22);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
    sky.position.copy(camera.position);
  }

  // ---------- main loop ----------
  const STEP = 1 / 60;
  let acc = 0;
  let last = performance.now();
  const gravelColor = { r: 0.66, g: 0.58, b: 0.46 };
  const grassColor = { r: 0.46, g: 0.43, b: 0.33 };
  const renderPos = new THREE.Vector3(), renderQuat = new THREE.Quaternion();
  const contact = { x: 0, y: 0, z: 0 };

  window.__rally = { vehicle, stage, game, TUNING, restart, renderer, scene, camera, sun, world, autopilot, surfaceAt, placeAtIndex };

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const inp = input.read(dt);

    // one-shot actions
    if (inp.actions.has('KeyM')) audio.toggleMute();
    if (inp.actions.has('KeyC')) game.camMode = (game.camMode + 1) % 2;
    if (inp.actions.has('KeyN')) { location.search = `?seed=${Math.floor(Math.random() * 99999) + 1}`; return; }
    if (inp.actions.has('Enter') && game.state !== 'intro') restart();
    if (inp.actions.has('KeyR') && (game.state === 'running' || game.state === 'countdown')) {
      placeAtIndex(Math.max(stage.startIndex - 4, game.trackIndex - 3));
    }

    let drive = AUTOPILOT && game.state === 'running' ? autopilot() : inp;
    if (game.state === 'intro' || game.state === 'countdown') drive = { throttle: 0, brake: 0, steer: inp.steer, handbrake: true };
    if (game.state === 'finished') drive = { throttle: 0, brake: 0.6, steer: 0, handbrake: false };

    acc += dt;
    while (acc >= STEP) {
      vehicle.step(STEP, drive, surfaceAt);
      world.step();
      snapshot();
      acc -= STEP;
      if (game.state === 'running') game.time += STEP;
    }

    // track progress
    const p = vehicle.body.translation();
    game.trackIndex = stage.nearestTracked(p.x, p.z, game.trackIndex);
    const ti = game.trackIndex;
    const distFromRoad = Math.hypot(stage.xs[ti] - p.x, stage.zs[ti] - p.z);

    if (game.state === 'countdown') {
      game.countdown -= dt;
      const n = Math.ceil(game.countdown);
      $('message').textContent = n > 3 ? '' : n > 0 ? String(n) : '';
      if (game.countdown <= 0) {
        game.state = 'running';
        $('message').textContent = 'LOS!';
        setTimeout(() => { if ($('message').textContent === 'LOS!') $('message').textContent = ''; }, 900);
      }
    }
    if (game.state === 'running') {
      const k = game.splits.length;
      if (k < stage.splitIndices.length && ti >= stage.splitIndices[k] && distFromRoad < 25) {
        game.splits.push(game.time);
        let cls = '', diff = '';
        if (game.bestSplits && game.bestSplits[k] != null) {
          const dd = game.time - game.bestSplits[k];
          cls = dd < 0 ? 'faster' : 'slower';
          diff = ` <span class="${cls}">${dd < 0 ? '−' : '+'}${Math.abs(dd).toFixed(2)}</span>`;
        }
        $('splits').insertAdjacentHTML('beforeend', `<div>Split ${k + 1}: ${formatTime(game.time)}${diff}</div>`);
      }
      if (ti >= stage.finishIndex && distFromRoad < 25) {
        $('message').textContent = 'ZIEL!';
        finish();
      }
    }

    // stuck / off-road helpers
    const up = vehicle.up();
    if (up.y < 0.25 && Math.abs(vehicle.speed) < 2) game.flipTimer += dt; else game.flipTimer = 0;
    if (game.flipTimer > 2.5 || p.y < -200) placeAtIndex(game.trackIndex);
    let hint = '';
    if (game.state === 'running') {
      if (game.flipTimer > 0.6) hint = 'Überschlagen – gleich geht’s weiter';
      else if (distFromRoad > 35) hint = 'Weit weg von der Strecke – R drücken';
    }
    $('hint').textContent = hint;

    // visuals
    const alpha = acc / STEP;
    renderPos.lerpVectors(prevPos, currPos, alpha);
    renderQuat.slerpQuaternions(prevQuat, currQuat, alpha);
    car.root.position.copy(renderPos);
    car.root.quaternion.copy(renderQuat);
    for (let i = 0; i < 4; i++) {
      const w = car.wheels[i];
      const wp = vehicle.wheelPositions[i];
      const len = vehicle.vc.wheelSuspensionLength(i) ?? TUNING.restLength;
      w.steerGroup.position.set(wp.x, wp.y - len, wp.z);
      w.steerGroup.rotation.y = i < 2 ? vehicle.steer : 0;
      w.spin.rotation.z = -vehicle.wheelSpin[i];
    }

    // dust
    const vel = vehicle.body.linvel();
    const sp = Math.abs(vehicle.speed);
    for (let i = 0; i < 4; i++) {
      if (!vehicle.vc.wheelIsInContact(i)) continue;
      const grass = vehicle.wheelSurface[i] === 'grass';
      const amount = Math.min(1, sp / 28) * (grass ? 0.25 : 0.6) + vehicle.wheelSlip[i] * Math.min(1, sp / 6) * 0.9;
      let n = amount * dt * 55;
      const cp = vehicle.vc.wheelContactPoint(i, contact);
      if (!cp) continue;
      while (n > 0) {
        if (n >= 1 || Math.random() < n) {
          dust.emit(cp.x, cp.y + 0.15, cp.z, vel.x * 0.25, 0.4, vel.z * 0.25, amount, grass ? grassColor : gravelColor);
        }
        n -= 1;
      }
    }
    dust.update(dt, scene.fog, renderer.domElement.height);

    updateCamera(dt, renderPos, renderQuat);
    sun.position.copy(renderPos).addScaledVector(sunDir, 120);
    sun.target.position.copy(renderPos);

    // HUD
    const kmh = Math.round(sp * 3.6);
    $('speed').textContent = kmh;
    $('gear').textContent = vehicle.gear < 0 ? 'R' : String(vehicle.gear);
    $('rpm-fill').style.width = `${Math.min(100, (vehicle.rpm / 7600) * 100)}%`;
    $('timer').textContent = formatTime(game.time);
    const total = stage.finishIndex - stage.startIndex;
    const done = Math.max(0, Math.min(total, ti - stage.startIndex));
    $('progress-fill').style.width = `${(done / total) * 100}%`;
    $('progress-label').textContent = `Noch ${((total - done) / 1000).toFixed(1).replace('.', ',')} km`;

    const onGravel = vehicle.wheelSurface.filter((s) => s === 'gravel').length >= 2;
    const slip = Math.max(...vehicle.wheelSlip);
    audio.update(vehicle.rpm, drive.throttle, vehicle.speed, slip, onGravel);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  $('loading').textContent = `Fehler: ${e.message}`;
});
