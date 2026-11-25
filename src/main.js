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
import { buildPacenotes } from './pacenotes.js';
import { PacenoteUI } from './pacenoteUI.js';
import { hostRoom, joinRoom, normalizeCode } from './net.js';

const $ = (id) => document.getElementById(id);
// let the loading text paint; the timeout keeps loading going in background tabs (no animation frames there)
const nextFrame = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 60); });
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
  const pacenotes = buildPacenotes(stage);
  const notebook = new PacenoteUI(pacenotes);

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
    camMode: Number(localStorage.getItem('rally.cam') || 0), // 0 cockpit, 1 chase, 2 bonnet
    role: 'solo', // solo, driver, codriver
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
    notebook.sync(i);
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
    if (game.role === 'driver' && link) link.send({ t: 'restart' });
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
    if (game.role === 'driver' && link) link.send({ t: 'finish', time: t, line });
    showResult(t, line);
  }

  function showResult(t, line) {
    setTimeout(() => {
      if (game.state !== 'finished') return;
      $('intro').classList.add('hidden');
      $('loading').classList.add('hidden');
      const r = $('result');
      r.innerHTML = `<p class="sub">Etappe beendet</p><div class="result-time">${formatTime(t)}</div>
        <div class="result-best">${line}</div><p class="small">${game.role === 'codriver' ? 'Der Fahrer startet die nächste Fahrt' : game.role === 'driver' ? 'Enter = nochmal fahren' : 'Enter = nochmal fahren · N = neue Strecke'}</p>`;
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

  // ---------- menu & co-op ----------
  let link = null;
  const remote = { buf: [], offset: null, lastSplits: 0, lastState: null, prevState: null };
  const setError = (msg) => { $('menu-error').textContent = msg || ''; };
  const busy = (on) => ['btn-solo', 'btn-host', 'btn-join'].forEach((id) => { $(id).disabled = on; });

  function startSolo() {
    if (game.state !== 'intro' || game.role !== 'solo') return;
    audio.start();
    restart();
  }

  function setCoopStatus() {
    const el = $('coop-status');
    if (game.role === 'solo') { el.textContent = ''; return; }
    const ping = link && link.ping != null ? ` · ${Math.round(link.ping)} ms` : '';
    if (game.role === 'driver') {
      el.textContent = link && link.open ? `👥 Beifahrer verbunden${ping}` : `👥 Warte auf Beifahrer · Code ${game.roomCode || '…'}`;
    } else {
      el.textContent = link && link.open ? `📖 Beifahrer · verbunden${ping}` : '📖 Verbindung zum Fahrer verloren';
    }
  }

  function hostGame() {
    setError('');
    busy(true);
    $('lobby').classList.remove('hidden');
    $('lobby-status').textContent = 'Raum wird erstellt…';
    game.role = 'driver';
    notebook.setRole('driver');
    hostRoom({
      onCode: (code) => {
        game.roomCode = code;
        $('room-code').textContent = code;
        $('lobby-status').textContent = 'Gib deinem Beifahrer diesen Code. Warte auf Beifahrer…';
      },
      onGuest: (l) => {
        link = l;
        link.send({ t: 'hello', seed: SEED });
        link.onClose(() => setCoopStatus());
        if (game.state === 'intro') {
          $('lobby-status').textContent = 'Beifahrer verbunden! Bereit?';
          $('btn-start').classList.remove('hidden');
        } else if (game.state === 'finished') {
          link.send({ t: 'finish', time: game.time, line: '' });
        }
      },
      onError: (e) => { setError(e.message); },
    });
  }

  async function joinGame(code) {
    code = normalizeCode(code);
    if (code.length !== 5) { setError('Der Code hat 5 Zeichen.'); return; }
    setError('');
    busy(true);
    $('lobby').classList.remove('hidden');
    $('room-code').textContent = code;
    $('lobby-status').textContent = 'Verbinde mit dem Fahrer…';
    try {
      const l = await joinRoom(code);
      const hello = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Der Fahrer antwortet nicht.')), 8000);
        l.on('hello', (m) => { clearTimeout(timer); resolve(m); });
      });
      if (hello.seed !== SEED) {
        // load the driver's stage, then join again automatically
        l.close();
        location.search = `?seed=${hello.seed}&join=${code}`;
        return;
      }
      link = l;
      game.roomCode = code;
      becomeCodriver();
    } catch (e) {
      busy(false);
      $('lobby').classList.add('hidden');
      setError(e.message);
    }
  }

  function becomeCodriver() {
    game.role = 'codriver';
    game.camMode = 0;
    document.body.classList.add('codriver');
    notebook.setRole('codriver');
    $('overlay').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('message').textContent = 'Warte auf den Start…';
    link.on('s', (m) => {
      const off = performance.now() - m.ts;
      // smallest observed delay = best estimate of the clock offset (drifts up slowly)
      remote.offset = remote.offset === null ? off : Math.min(remote.offset + 0.05, off);
      remote.buf.push(m);
      if (remote.buf.length > 30) remote.buf.shift();
    });
    link.on('restart', () => {
      remote.buf.length = 0; // drop states from the previous run
      remote.lastSplits = 0;
      $('splits').innerHTML = '';
      $('result').classList.add('hidden');
      $('overlay').classList.add('hidden');
      notebook.sync(stage.startIndex - 4);
    });
    link.on('finish', (m) => { $('message').textContent = 'ZIEL!'; showResult(m.time, m.line || ''); });
    link.onClose(() => {
      setCoopStatus();
      $('intro').classList.add('hidden');
      const r = $('result');
      r.innerHTML = '<p class="sub">Verbindung zum Fahrer verloren</p><button class="btn primary" id="btn-rejoin">Neu verbinden</button>';
      r.classList.remove('hidden');
      $('overlay').classList.remove('hidden');
      $('btn-rejoin').onclick = () => { location.search = `?seed=${SEED}&join=${game.roomCode}`; };
    });
    // sound needs a click or key press in this tab
    const unlock = () => {
      audio.start();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  $('btn-solo').onclick = startSolo;
  $('btn-host').onclick = hostGame;
  $('btn-join').onclick = () => joinGame($('join-code').value);
  $('join-code').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') joinGame($('join-code').value);
  });
  $('btn-start').onclick = () => { audio.start(); restart(); };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && game.state === 'intro' && game.role === 'solo' && document.activeElement !== $('join-code')) startSolo();
  });
  if (params.get('join')) { $('join-code').value = params.get('join'); joinGame(params.get('join')); }
  else if (AUTOPILOT) startSolo();
  setInterval(setCoopStatus, 500);

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

  const cockpitQuat = new THREE.Quaternion();
  let cockpitInit = false;
  let lookYaw = 0;
  const qBase = new THREE.Quaternion(), qTmp = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const headLocal = new THREE.Vector3();

  function updateCamera(dt, pos, quat) {
    const fwd = tmpV.set(1, 0, 0).applyQuaternion(quat);
    const carYaw = Math.atan2(fwd.z, fwd.x);
    const speed = Math.abs(vehicle.speed);
    car.setCockpitView(game.camMode === 0);
    if (game.camMode === 1) {
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
      cockpitInit = false;
    } else {
      // driver's eyes (cockpit) or bonnet camera, rigidly attached to the car
      // but with slightly smoothed rotation so bumps don't make the view jittery
      if (!cockpitInit) { cockpitQuat.copy(quat); cockpitInit = true; }
      cockpitQuat.slerp(quat, 1 - Math.exp(-dt * 22));
      if (game.camMode === 0) {
        headLocal.copy(car.headPosition);
        if (game.role === 'codriver') headLocal.z = -headLocal.z; // passenger seat
      }
      else headLocal.set(1.25, 0.5, 0);
      headLocal.y -= 0.02;
      camera.position.copy(headLocal).applyQuaternion(quat).add(pos);
      if (game.camMode === 0) {
        // gravel vibration
        const shake = Math.min(1, speed / 30) * 0.006;
        camera.position.y += (Math.random() - 0.5) * shake;
      }
      // look a little into the corner the car is steering into
      lookYaw += (vehicle.steer * 0.5 - lookYaw) * (1 - Math.exp(-dt * 4));
      euler.set(game.camMode === 0 ? -0.05 : -0.04, -Math.PI / 2 + (game.camMode === 0 ? lookYaw : 0), 0, 'YXZ');
      qBase.setFromEuler(euler);
      camera.quaternion.copy(qTmp.copy(cockpitQuat).multiply(qBase));
      camInit = false;
    }
    car.steeringWheel.rotation.x = -(vehicle.steer / TUNING.steerLow) * 2.2;
    const fovBase = game.camMode === 0 ? 72 : 62;
    const fov = fovBase + Math.min(game.camMode === 0 ? 8 : 14, speed * (game.camMode === 0 ? 0.12 : 0.22));
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

  window.__rally = { vehicle, stage, game, TUNING, restart, pacenotes, notebook, getLink: () => link, renderer, scene, camera, sun, world, autopilot, surfaceAt, placeAtIndex };

  // ---------- network state (driver sends, co-driver shows) ----------
  let sendTick = 0;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  function sendState() {
    const t = vehicle.body.translation(), q = vehicle.body.rotation(), v = vehicle.body.linvel();
    let contacts = 0, surf = 0;
    for (let i = 0; i < 4; i++) {
      if (vehicle.vc.wheelIsInContact(i)) contacts |= 1 << i;
      if (vehicle.wheelSurface[i] === 'gravel') surf |= 1 << i;
    }
    link.send({
      t: 's', ts: performance.now(),
      p: [r3(t.x), r3(t.y), r3(t.z)], q: [r3(q.x), r3(q.y), r3(q.z), r3(q.w)], lv: [r3(v.x), r3(v.y), r3(v.z)],
      v: r3(vehicle.speed), st: r3(vehicle.steer), r: Math.round(vehicle.rpm), g: vehicle.gear, th: r3(vehicle.throttle || 0),
      i: game.trackIndex, tm: r3(game.time), gs: game.state, cd: r3(game.countdown),
      w: [0, 1, 2, 3].map((i) => r3(vehicle.vc.wheelSuspensionLength(i) ?? TUNING.restLength)),
      c: contacts, sf: surf, sl: vehicle.wheelSlip.map(r3), sp: game.splits,
    });
  }

  remote.susp = [TUNING.restLength, TUNING.restLength, TUNING.restLength, TUNING.restLength];
  remote.vel = { x: 0, y: 0, z: 0 };
  remote.contacts = 15;
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  function applyRemote(now) {
    const buf = remote.buf;
    if (!buf.length) return;
    // show the car ~100 ms in the past so there are always two states to blend between
    const target = now - remote.offset - 100;
    let a = buf[0], b = buf[buf.length - 1];
    for (let k = 0; k < buf.length - 1; k++) {
      if (buf[k].ts <= target && buf[k + 1].ts >= target) { a = buf[k]; b = buf[k + 1]; break; }
    }
    if (target > b.ts) a = b;
    const f = b.ts > a.ts ? Math.min(1, Math.max(0, (target - a.ts) / (b.ts - a.ts))) : 1;
    renderPos.set(a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f, a.p[2] + (b.p[2] - a.p[2]) * f);
    qa.set(a.q[0], a.q[1], a.q[2], a.q[3]);
    qb.set(b.q[0], b.q[1], b.q[2], b.q[3]);
    renderQuat.slerpQuaternions(qa, qb, f);
    const s = f < 0.5 ? a : b;
    vehicle.speed = a.v + (b.v - a.v) * f;
    vehicle.steer = a.st + (b.st - a.st) * f;
    vehicle.rpm = s.r; vehicle.gear = s.g; vehicle.throttle = s.th;
    remote.susp = s.w; remote.contacts = s.c;
    remote.vel = { x: s.lv[0], y: s.lv[1], z: s.lv[2] };
    for (let i = 0; i < 4; i++) {
      vehicle.wheelSlip[i] = s.sl[i];
      vehicle.wheelSurface[i] = s.sf & (1 << i) ? 'gravel' : 'grass';
    }
    // progress, time and state come from the newest message
    const latest = buf[buf.length - 1];
    game.trackIndex = latest.i;
    game.time = latest.tm;
    game.countdown = latest.cd;
    remote.prevState = remote.lastState;
    remote.lastState = latest.gs;
    game.state = latest.gs === 'intro' ? 'countdown' : latest.gs;
    if (latest.sp.length < remote.lastSplits) { remote.lastSplits = 0; $('splits').innerHTML = ''; }
    while (remote.lastSplits < latest.sp.length) {
      const k = remote.lastSplits++;
      $('splits').insertAdjacentHTML('beforeend', `<div>Split ${k + 1}: ${formatTime(latest.sp[k])}</div>`);
    }
  }

  function updateCodriverMessages() {
    const gs = remote.lastState;
    if (!gs) return;
    if (gs === 'countdown') {
      const n = Math.ceil(game.countdown);
      $('message').textContent = n > 3 ? '' : n > 0 ? String(n) : '';
    } else if (gs === 'running' && remote.prevState === 'countdown') {
      $('message').textContent = 'LOS!';
      setTimeout(() => { if ($('message').textContent === 'LOS!') $('message').textContent = ''; }, 900);
    } else if (gs === 'running' && $('message').textContent === 'Warte auf den Start…') {
      $('message').textContent = '';
    }
  }

  const wheelTmp = new THREE.Vector3();
  function wheelGroundPoint(i) {
    car.wheels[i].steerGroup.getWorldPosition(wheelTmp);
    wheelTmp.y -= TUNING.wheelRadius;
    return wheelTmp;
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const inp = input.read(dt);

    // one-shot actions
    if (inp.actions.has('KeyM')) audio.toggleMute();
    if (inp.actions.has('KeyB') && game.role !== 'codriver') notebook.toggleBook();
    if (inp.actions.has('KeyV') && game.role === 'solo') notebook.toggleVoice();
    if (inp.actions.has('KeyC')) {
      game.camMode = (game.camMode + 1) % 3;
      localStorage.setItem('rally.cam', String(game.camMode));
    }
    const isCo = game.role === 'codriver';
    if (inp.actions.has('KeyN') && game.role === 'solo') { location.search = `?seed=${Math.floor(Math.random() * 99999) + 1}`; return; }
    if (inp.actions.has('Enter') && game.state !== 'intro' && !isCo) restart();
    if (!isCo && inp.actions.has('KeyR') && (game.state === 'running' || game.state === 'countdown')) {
      placeAtIndex(Math.max(stage.startIndex - 4, game.trackIndex - 3));
    }

    let drive = AUTOPILOT && game.state === 'running' ? autopilot() : inp;
    if (game.state === 'intro' || game.state === 'countdown') drive = { throttle: 0, brake: 0, steer: inp.steer, handbrake: true };
    if (game.state === 'finished') drive = { throttle: 0, brake: 0.6, steer: 0, handbrake: false };

    if (isCo) {
      applyRemote(now);
    } else {
      acc += dt;
      while (acc >= STEP) {
        vehicle.step(STEP, drive, surfaceAt);
        world.step();
        snapshot();
        acc -= STEP;
        if (game.state === 'running') game.time += STEP;
        if (game.role === 'driver' && link && link.open && ++sendTick % 3 === 0) sendState();
      }
    }

    // track progress
    const p = isCo ? renderPos : vehicle.body.translation();
    if (!isCo) game.trackIndex = stage.nearestTracked(p.x, p.z, game.trackIndex);
    const ti = game.trackIndex;
    const distFromRoad = Math.hypot(stage.xs[ti] - p.x, stage.zs[ti] - p.z);

    if (isCo) {
      updateCodriverMessages();
    } else if (game.state === 'countdown') {
      game.countdown -= dt;
      const n = Math.ceil(game.countdown);
      $('message').textContent = n > 3 ? '' : n > 0 ? String(n) : '';
      if (game.countdown <= 0) {
        game.state = 'running';
        $('message').textContent = 'LOS!';
        setTimeout(() => { if ($('message').textContent === 'LOS!') $('message').textContent = ''; }, 900);
      }
    }
    if (game.state === 'running' && !isCo) {
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

    notebook.update(ti, vehicle.speed, game.state === 'running');

    // stuck / off-road helpers
    const up = isCo ? { y: 1 } : vehicle.up();
    if (up.y < 0.25 && Math.abs(vehicle.speed) < 2) game.flipTimer += dt; else game.flipTimer = 0;
    if (!isCo && (game.flipTimer > 2.5 || p.y < -200)) placeAtIndex(game.trackIndex);
    let hint = '';
    if (game.state === 'running' && !isCo) {
      if (game.flipTimer > 0.6) hint = 'Überschlagen – gleich geht’s weiter';
      else if (distFromRoad > 35) hint = 'Weit weg von der Strecke – R drücken';
    }
    $('hint').textContent = hint;

    // visuals
    if (!isCo) {
      const alpha = acc / STEP;
      renderPos.lerpVectors(prevPos, currPos, alpha);
      renderQuat.slerpQuaternions(prevQuat, currQuat, alpha);
    }
    car.root.position.copy(renderPos);
    car.root.quaternion.copy(renderQuat);
    for (let i = 0; i < 4; i++) {
      const w = car.wheels[i];
      const wp = vehicle.wheelPositions[i];
      const len = isCo ? remote.susp[i] : vehicle.vc.wheelSuspensionLength(i) ?? TUNING.restLength;
      w.steerGroup.position.set(wp.x, wp.y - len, wp.z);
      w.steerGroup.rotation.y = i < 2 ? vehicle.steer : 0;
      if (isCo) vehicle.wheelSpin[i] += (vehicle.speed * dt) / TUNING.wheelRadius;
      w.spin.rotation.z = -vehicle.wheelSpin[i];
    }

    // dust
    const vel = isCo ? remote.vel : vehicle.body.linvel();
    const sp = Math.abs(vehicle.speed);
    for (let i = 0; i < 4; i++) {
      if (isCo ? !(remote.contacts & (1 << i)) : !vehicle.vc.wheelIsInContact(i)) continue;
      const grass = vehicle.wheelSurface[i] === 'grass';
      const amount = Math.min(1, sp / 28) * (grass ? 0.25 : 0.6) + vehicle.wheelSlip[i] * Math.min(1, sp / 6) * 0.9;
      let n = amount * dt * 55;
      const cp = isCo ? wheelGroundPoint(i) : vehicle.vc.wheelContactPoint(i, contact);
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
    audio.update(vehicle.rpm, isCo ? vehicle.throttle : drive.throttle, vehicle.speed, slip, onGravel);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  $('loading').textContent = `Fehler: ${e.message}`;
});
