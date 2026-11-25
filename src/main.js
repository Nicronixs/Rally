import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { generateStage } from './track.js';
import { buildTerrain } from './terrain.js';
import { buildRoad, buildTrees, buildGates } from './road.js';
import { Vehicle, TUNING } from './vehicle.js';
import { buildCarModel } from './carModel.js';
import { loadModels, makeEnvMap } from './models.js';
import { Dust } from './effects.js';
import { CarAudio } from './audio.js';
import { Input } from './input.js';
import { buildPacenotes } from './pacenotes.js';
import { PacenoteUI } from './pacenoteUI.js';
import { hostRoom, joinRoom, normalizeCode, NAT_MESSAGE } from './net.js';
import { getEnvironment } from './environments.js';
import { getCar } from './cars.js';
import { leaderboardReady, isoWeek, weeklyStage, fetchWeekly, submitWeekly, NAME_KEY } from './leaderboard.js';
import {
  RALLIES, RESET_PENALTY, OFF_TRACK_MARGIN, CUT_MIN_GAIN, CUT_PENALTIES, CUT_REF_SPEED, JUMP_START_PENALTIES,
  RETIRE_PENALTY, OFF_RESET_TIME, OFF_RESET_PENALTY, bestRivalTime, SERVICE_MINUTES, loadChampionship, saveChampionship, newChampionship,
  stageSeed, referenceTime, recordStage, repairCost,
} from './championship.js';
import {
  formatTime, menuScreen, champIntroScreen, champResultScreen, serviceScreen, finalScreen, barColor,
  weeklyTable, weeklyResultScreen,
} from './screens.js';

const $ = (id) => document.getElementById(id);
// let the loading text paint; the timeout keeps loading going in background tabs (no animation frames there)
const nextFrame = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 60); });
const params = new URLSearchParams(location.search);
const AUTOPILOT = params.has('autopilot');
const JOIN = params.get('join');

// ---------- what to load: championship stage, free drive or co-driver view ----------
const CHAMP = params.has('champ') ? loadChampionship() : null;
const champActive = !!(CHAMP && !CHAMP.finished) && !JOIN;
const WEEK = isoWeek();
const WEEKLY = weeklyStage(WEEK);
const weeklyActive = params.has('weekly') && !JOIN;
let SEED, ENV, CAR;
if (weeklyActive) {
  SEED = WEEKLY.seed;
  ENV = getEnvironment(WEEKLY.env);
  CAR = getCar(params.get('car') || localStorage.getItem('rally.car') || 'falke');
} else if (champActive) {
  SEED = stageSeed(CHAMP);
  ENV = getEnvironment(RALLIES[CHAMP.rally].env);
  CAR = getCar(CHAMP.car);
} else {
  SEED = Number(params.get('seed')) || 7;
  ENV = getEnvironment(params.get('env') || 'forest');
  CAR = getCar(params.get('car') || localStorage.getItem('rally.car') || 'falke');
}
const MODE = JOIN ? 'codriver' : weeklyActive ? 'weekly' : champActive ? 'champ' : params.has('champ') && CHAMP && CHAMP.finished ? 'final' : 'free';

function go(query) { location.search = query; }
function freeQuery(seed, env, car, start) { return `?seed=${seed}&env=${env}&car=${car}${start ? '&go=1' : ''}`; }

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
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const horizon = new THREE.Color(ENV.sky.horizon);
  scene.background = horizon;
  scene.fog = new THREE.Fog(horizon, ENV.sky.fogNear, ENV.sky.fogFar);
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 5000);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(3000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(ENV.sky.top) }, bottom: { value: horizon } },
      vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vPos; void main(){ float h = clamp(normalize(vPos).y * 2.2, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.7)), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    }));
  sky.renderOrder = -1;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(ENV.light.sky, ENV.light.ground, ENV.light.hemi));
  const sun = new THREE.DirectionalLight(ENV.light.sun, ENV.light.sunIntensity);
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
  const events = new RAPIER.EventQueue(true);
  $('loading').textContent = 'Modelle werden geladen…';
  const models = await loadModels();
  const stage = generateStage(SEED, ENV);
  $('loading').textContent = 'Gelände wird gebaut…';
  await nextFrame();
  const terrain = buildTerrain(stage, world, scene);
  buildRoad(stage, scene, ENV);
  $('loading').textContent = 'Landschaft wird gestaltet…';
  await nextFrame();
  buildTrees(stage, terrain, world, scene, ENV, models);
  buildGates(stage, scene, world, models);

  const vehicle = new Vehicle(world, CAR.tuning);
  const car = buildCarModel(models, CAR.livery, makeEnvMap(renderer, ENV));
  scene.add(car.root);
  if (champActive) vehicle.setDamage(CHAMP.damage);
  car.setDamage(vehicle.damage);
  const dust = new Dust(scene);
  const audio = new CarAudio();
  const input = new Input();
  const padStatus = (connected) => {
    const el = $('pad-status');
    if (el) el.textContent = connected ? '🎮 Controller verbunden – Steuerkreuz/Stick wählen, A bestätigen, B zurück' : '';
  };
  input.onPadChange = (connected) => {
    padStatus(connected);
    toast(connected ? '🎮 Controller verbunden' : 'Controller getrennt', 2);
    if (connected && !$('overlay').classList.contains('hidden') && !padFocus) setPadFocus(defaultFocus());
  };
  const pacenotes = buildPacenotes(stage);
  const notebook = new PacenoteUI(pacenotes);
  const stageKm = ((stage.finishIndex - stage.startIndex) / 1000).toFixed(2).replace('.', ',');

  // ---------- game state ----------
  const bestKey = `rally.best.${ENV.id}.${CAR.id}.${SEED}`;
  const game = {
    state: 'intro', // intro, countdown, running, finished
    time: 0,
    penalty: 0,
    off: false, // beyond the road edge margin right now
    exitIndex: 0, // where the car left the road
    offPath: 0, // metres driven while off the road
    offLast: null,
    cuts: 0, // corner cuts penalised on this stage
    jumped: false, // jump start already penalised on this stage
    startPos: null,
    jumpStarts: 0, // free drive: jump starts this session (championship keeps its own count)
    countdown: 0,
    trackIndex: stage.startIndex,
    splits: [],
    flipTimer: 0,
    camMode: Number(localStorage.getItem('rally.cam') || 0), // 0 cockpit, 1 chase, 2 bonnet
    manual: localStorage.getItem('rally.gearbox') !== 'auto', // manual gearbox unless switched to automatic
    role: 'solo', // solo, driver, codriver
    best: Number(localStorage.getItem(bestKey)) || null,
    roomCode: sessionStorage.getItem('rally.hostCode'),
  };

  function placeAtIndex(i) {
    i = Math.max(2, Math.min(stage.count - 3, i));
    const yaw = Math.atan2(-stage.tz[i], stage.tx[i]);
    vehicle.place(stage.xs[i], stage.ys[i] + 0.85, stage.zs[i], yaw);
    game.trackIndex = i;
    snapshot();
    copySnapshot();
    notebook.sync(i);
    game.off = false; // a recovery never counts as rejoining after a cut
  }

  let fullscreenHintShown = false;
  function restart() {
    placeAtIndex(stage.startIndex - 4);
    if (game.manual && !document.fullscreenElement && !fullscreenHintShown && !AUTOPILOT) {
      fullscreenHintShown = true;
      setTimeout(() => toast('Tipp: F = Vollbild, dann schließt Strg+W nicht aus Versehen den Tab', 4), 300);
    }
    game.state = 'countdown';
    game.countdown = 3.5;
    game.time = 0;
    game.penalty = 0;
    game.cuts = 0;
    game.jumped = false;
    const sp0 = vehicle.body.translation();
    game.startPos = { x: sp0.x, z: sp0.z };
    game.splits = [];
    if (MODE === 'free' || MODE === 'weekly') vehicle.setDamage({});
    car.setDamage(vehicle.damage);
    $('splits').innerHTML = '';
    hideOverlay();
    $('hud').classList.remove('hidden');
    if (link) link.send({ t: 'restart' });
  }

  // Retiring from a championship stage: like Art. 54 the stage counts with its best time + 10 minutes.
  function retire() {
    game.state = 'finished';
    $('message').textContent = 'AUFGEGEBEN';
    const rally = CHAMP.rally, stg = CHAMP.stage;
    const ref = referenceTime(stage, ENV);
    const t = bestRivalTime(CHAMP, ref) + RETIRE_PENALTY;
    const { rallyDone } = recordStage(CHAMP, t, ref, vehicle.damage);
    const res = champResultScreen(CHAMP, rally, stg, rallyDone, 0, 'Aufgegeben – Bestzeit + 10 Minuten');
    if (link) link.send({ t: 'finish', time: t, line: 'Aufgegeben – Bestzeit + 10 Minuten' });
    setTimeout(() => showChampResult(res.html, rallyDone), 1200);
  }

  function finish() {
    game.state = 'finished';
    const t = game.time + game.penalty;
    if (MODE === 'champ') {
      const rally = CHAMP.rally, stg = CHAMP.stage;
      const ref = referenceTime(stage, ENV);
      const { rallyDone } = recordStage(CHAMP, t, ref, vehicle.damage);
      const res = champResultScreen(CHAMP, rally, stg, rallyDone, game.penalty);
      if (link) link.send({ t: 'finish', time: t, line: `Platz ${res.pos} auf dieser Prüfung` });
      setTimeout(() => showChampResult(res.html, rallyDone), 1800);
      return;
    }
    if (MODE === 'weekly') {
      if (link) link.send({ t: 'finish', time: t, line: 'Strecke der Woche' });
      setTimeout(() => showWeeklyResult(t), 1800);
      return;
    }
    let line;
    if (game.best === null || t < game.best) {
      line = game.best === null ? 'Erste Zeit mit diesem Auto auf dieser Strecke!' : `Neue Bestzeit! (−${(game.best - t).toFixed(2)} s)`;
      game.best = t;
      localStorage.setItem(bestKey, String(t));
    } else {
      line = `Bestzeit ${formatTime(game.best)} (+${(t - game.best).toFixed(2)} s)`;
    }
    if (game.penalty > 0) line += ` · inkl. ${game.penalty.toFixed(1).replace('.', ',')} s Strafe`;
    if (link) link.send({ t: 'finish', time: t, line });
    setTimeout(() => showResult(t, line), 1800);
  }

  // ---------- screens ----------
  function showOverlay(html) {
    $('loading').classList.add('hidden');
    $('screen').innerHTML = html;
    $('screen').classList.remove('hidden');
    $('overlay').classList.remove('hidden');
    padFocus = null;
    if (input.pad) setTimeout(() => setPadFocus(defaultFocus()), 0); // a controller needs something selected
  }

  // ---------- controller navigation in menus ----------
  let padFocus = null;
  function focusables() {
    return [...$('overlay').querySelectorAll('button, input[type=checkbox], summary')]
      .filter((el) => !el.disabled && el.offsetParent !== null);
  }
  function defaultFocus() {
    const list = focusables();
    return list.find((el) => el.classList.contains('primary') && el.offsetParent !== null) || list[0] || null;
  }
  function setPadFocus(el) {
    if (padFocus) padFocus.classList.remove('pad-focus');
    padFocus = el;
    if (!el) return;
    el.classList.add('pad-focus');
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
  }
  const NAV_VECTORS = { NavUp: [0, -1], NavDown: [0, 1], NavLeft: [-1, 0], NavRight: [1, 0] };
  function handleMenuNav(actions) {
    const list = focusables();
    if (!list.length) {
      if (actions.has('NavStart') || actions.has('NavOK')) enterAction && enterAction();
      return;
    }
    if (!padFocus || !list.includes(padFocus)) {
      if ([...actions].some((a) => a.startsWith('Nav'))) setPadFocus(defaultFocus());
      if (actions.has('NavStart') && enterAction) enterAction();
      return;
    }
    for (const [name, [vx, vy]] of Object.entries(NAV_VECTORS)) {
      if (!actions.has(name)) continue;
      // nearest element in that direction, preferring ones straight ahead
      const r = padFocus.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let best = null, bestScore = Infinity;
      for (const el of list) {
        if (el === padFocus) continue;
        const e = el.getBoundingClientRect();
        const dx = e.left + e.width / 2 - cx, dy = e.top + e.height / 2 - cy;
        const along = dx * vx + dy * vy;
        if (along <= 4) continue;
        const across = Math.abs(dx * vy - dy * vx);
        const score = along + across * 2.5;
        if (score < bestScore) { bestScore = score; best = el; }
      }
      if (best) setPadFocus(best);
    }
    if (actions.has('NavOK')) padFocus.click();
    if (actions.has('NavStart')) (enterAction || (() => padFocus.click()))();
    if (actions.has('NavBack')) {
      const back = $('c-menu') || $('j-menu') || $('f-menu');
      if (back) back.click();
    }
  }
  function hideOverlay() { $('overlay').classList.add('hidden'); }
  let enterAction = null; // what Enter does on the current screen

  function showResult(t, line) {
    if (game.state !== 'finished') return;
    const co = game.role === 'codriver';
    const buttons = co ? '<p class="small">Der Fahrer startet die nächste Fahrt</p>'
      : `<button class="btn primary" id="f-again">Nochmal fahren <span class="small">(Enter)</span></button>
         <button class="btn" id="f-new-stage">Neue Strecke <span class="small">(N)</span></button>
         <button class="btn ghost" id="f-menu">Hauptmenü <span class="small">(Esc)</span></button>`;
    showOverlay(`<p class="sub">Etappe beendet</p><div class="result-time">${formatTime(t)}</div>
      <div class="result-best">${line}</div>${buttons}`);
    enterAction = co ? null : restart;
    if (!co) {
      $('f-again').onclick = restart;
      $('f-new-stage').onclick = () => go(freeQuery(Math.floor(Math.random() * 99999) + 1, ENV.id, CAR.id, true));
      $('f-menu').onclick = () => go('');
    }
  }

  function showChampResult(html, rallyDone) {
    showOverlay(html);
    const next = () => {
      if (CHAMP.finished) go('?champ=1');
      else if (rallyDone) go('?champ=1'); // service only between rallies (shown on load, see serviceDue)
      else go('?champ=1'); // next stage of the same rally, with the damage
    };
    $('r-next').onclick = next;
    enterAction = next;
  }

  function showService() {
    showOverlay(serviceScreen(CHAMP));
    const cost = repairCost(CHAMP.damage);
    const boxes = [...document.querySelectorAll('#screen input[data-part]')];
    const update = () => {
      const used = boxes.filter((b) => b.checked).reduce((s, b) => s + cost[b.dataset.part], 0);
      const el = $('svc-budget');
      el.textContent = `Benötigt: ${used} von ${SERVICE_MINUTES} Minuten`;
      el.classList.toggle('over', used > SERVICE_MINUTES);
      $('s-go').disabled = used > SERVICE_MINUTES;
      return used <= SERVICE_MINUTES;
    };
    boxes.forEach((b) => { b.onchange = update; });
    // pre-select what fits, most important first
    let budget = SERVICE_MINUTES;
    for (const b of boxes) { b.checked = cost[b.dataset.part] <= budget; if (b.checked) budget -= cost[b.dataset.part]; }
    update();
    const goOn = () => {
      if (!update()) return;
      boxes.forEach((b) => { if (b.checked) CHAMP.damage[b.dataset.part] = 0; });
      CHAMP.serviceDue = false;
      saveChampionship(CHAMP);
      go('?champ=1');
    };
    $('s-go').onclick = goOn;
    enterAction = goOn;
  }

  function wireCards(root, onPick) {
    root.querySelectorAll('[data-car]').forEach((el) => {
      el.onclick = () => {
        root.querySelectorAll('[data-car]').forEach((x) => x.classList.toggle('selected', x.dataset.car === el.dataset.car));
        onPick(el.dataset.car);
      };
    });
  }

  // ---------- Strecke der Woche ----------
  const weeklyBestKey = `rally.weeklyBest.${WEEK.id}`;
  async function loadWeeklyList(myName) {
    const el = $('weekly-list');
    if (!el) return;
    if (!leaderboardReady) { el.innerHTML = '<p class="small">Die Online-Rangliste ist noch nicht eingerichtet.</p>'; return; }
    try {
      el.innerHTML = weeklyTable(await fetchWeekly(WEEK.id), myName);
    } catch (e) {
      el.innerHTML = `<p class="small">${e.message}</p>`;
    }
  }

  function showWeeklyResult(t) {
    if (game.state !== 'finished') return;
    const prevBest = Number(localStorage.getItem(weeklyBestKey)) || null;
    if (prevBest === null || t < prevBest) localStorage.setItem(weeklyBestKey, String(t));
    const name = localStorage.getItem(NAME_KEY) || '';
    showOverlay(weeklyResultScreen(t, game.penalty, name, Math.min(t, prevBest ?? t), leaderboardReady));
    $('w-again').onclick = restart;
    $('w-menu').onclick = () => go('?menu=weekly');
    enterAction = restart;
    loadWeeklyList(name);
    if (!leaderboardReady) return;
    const input = $('w-name');
    let sent = false;
    const send = async () => {
      const n = input.value.trim();
      if (n.length < 2) { $('w-status').textContent = 'Bitte einen Namen mit mindestens 2 Zeichen eingeben.'; input.focus(); return; }
      if (sent) return;
      sent = true;
      $('w-submit').disabled = true;
      $('w-status').textContent = 'Wird eingetragen …';
      localStorage.setItem(NAME_KEY, n);
      try {
        await submitWeekly({ week: WEEK.id, name: n, timeMs: t * 1000, penaltyMs: game.penalty * 1000, car: CAR.id });
        $('w-status').textContent = 'Eingetragen!';
        loadWeeklyList(n);
      } catch (e) {
        sent = false;
        $('w-submit').disabled = false;
        $('w-status').textContent = e.message;
      }
    };
    $('w-submit').onclick = send;
    // typing a name must not trigger game keys (N = new stage, M = sound …)
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') send(); });
  }

  function showMenu() {
    let pickCar = CAR.id, pickEnv = ENV.id, pickSeed = SEED;
    const saved = loadChampionship();
    showOverlay(menuScreen({ champ: saved, car: pickCar, env: pickEnv, seed: pickSeed, hostCode: game.role === 'driver' ? game.roomCode : null, weekly: { ...WEEKLY, week: WEEK } }));
    loadWeeklyList(localStorage.getItem(NAME_KEY));
    $('help').classList.remove('hidden');
    const scr = $('screen');
    scr.querySelectorAll('.tab').forEach((t) => {
      t.onclick = () => {
        scr.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
        scr.querySelectorAll('section[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== t.dataset.tab));
        sessionStorage.setItem('rally.tab', t.dataset.tab);
      };
    });
    const lastTab = sessionStorage.getItem('rally.tab');
    if (lastTab) { const t = scr.querySelector(`.tab[data-tab="${lastTab}"]`); if (t) t.onclick(); }
    wireCards(scr, (id) => { pickCar = id; localStorage.setItem('rally.car', id); scr.querySelectorAll('[data-car]').forEach((x) => x.classList.toggle('selected', x.dataset.car === id)); });
    scr.querySelectorAll('[data-env]').forEach((el) => {
      el.onclick = () => {
        pickEnv = el.dataset.env;
        scr.querySelectorAll('[data-env]').forEach((x) => x.classList.toggle('selected', x === el));
      };
    });
    const startFree = () => {
      if (pickEnv === ENV.id && pickCar === CAR.id && pickSeed === SEED && MODE === 'free') { audio.start(); restart(); }
      else go(freeQuery(pickSeed, pickEnv, pickCar, true));
    };
    $('m-free-go').onclick = startFree;
    const startWeekly = () => go(`?weekly=1&car=${pickCar}&go=1`);
    $('m-weekly-go').onclick = startWeekly;
    $('m-free-random').onclick = () => go(freeQuery(Math.floor(Math.random() * 99999) + 1, pickEnv, pickCar, false) + '&menu=free');
    $('m-champ-new').onclick = () => {
      if (saved && !saved.finished && !confirm('Die laufende Meisterschaft wird überschrieben. Neu starten?')) return;
      newChampionship(pickCar);
      go('?champ=1');
    };
    if ($('m-champ-continue')) $('m-champ-continue').onclick = () => go('?champ=1');
    if ($('m-host')) $('m-host').onclick = () => { startHosting(null); };
    if ($('m-host-stop')) $('m-host-stop').onclick = () => { sessionStorage.removeItem('rally.hostCode'); location.reload(); };
    $('btn-join').onclick = () => joinGame($('join-code').value);
    $('join-code').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') joinGame($('join-code').value); });
    enterAction = () => {
      const tab = scr.querySelector('.tab.active').dataset.tab;
      if (tab === 'free') startFree();
      else if (tab === 'weekly') startWeekly();
      else if (tab === 'champ') ($('m-champ-continue') || $('m-champ-new')).click();
    };
  }

  function showChampIntro() {
    showOverlay(champIntroScreen(CHAMP, CAR.name, `${ENV.name} (${ENV.surfaceName})`, stageKm));
    $('help').classList.remove('hidden');
    const start = () => { audio.start(); restart(); };
    $('c-go').onclick = start;
    $('c-menu').onclick = () => go('');
    enterAction = start;
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

  const onRoad = { grip: ENV.grip.road, rolling: 0, kind: 'gravel' };
  const offRoad = { grip: ENV.grip.off, rolling: ENV.grip.offRolling, kind: 'grass' };
  function surfaceAt(x, z) {
    const i = stage.nearestTracked(x, z, game.trackIndex);
    const d = i >= 0 ? Math.hypot(stage.xs[i] - x, stage.zs[i] - z) : 99;
    return d < stage.halfWidth + 0.4 ? onRoad : offRoad;
  }

  function autopilot() {
    const t = vehicle.body.translation();
    const look = Math.min(stage.count - 1, game.trackIndex + 12 + Math.floor(Math.abs(vehicle.speed) * 0.6));
    const dx = stage.xs[look] - t.x, dz = stage.zs[look] - t.z;
    const f = vehicle.forward();
    const cross = f.x * dz - f.z * dx;
    const ang = Math.atan2(-cross, f.x * dx + f.z * dz);
    let maxC = 0;
    for (let k = game.trackIndex; k < Math.min(stage.count, game.trackIndex + 60); k++) maxC = Math.max(maxC, Math.abs(stage.curv[k]));
    const safe = Math.sqrt((0.85 * ENV.grip.road * 9.81) / Math.max(maxC, 0.003));
    const v = vehicle.speed;
    return { throttle: v < safe ? 1 : 0, brake: v > safe + 3 ? 1 : 0, steer: Math.max(-1, Math.min(1, ang * 2.2)), handbrake: false };
  }

  // ---------- co-op ----------
  let link = null;
  const remote = { buf: [], offset: null, lastSplits: 0, lastState: null, prevState: null };
  const setError = (msg) => { if ($('menu-error')) $('menu-error').textContent = msg || ''; };

  function setCoopStatus() {
    const el = $('coop-status');
    if (game.role === 'solo') { el.textContent = ''; return; }
    const ping = link && link.ping != null ? ` · ${Math.round(link.ping)} ms` : '';
    if (game.role === 'driver') {
      el.textContent = link && link.open ? `👥 Beifahrer verbunden${ping}` : `👥 Warte auf Beifahrer · Code ${game.roomCode || '…'}`;
    } else {
      el.textContent = link && link.open ? `📖 Beifahrer · verbunden${ping}` : '📖 Verbinde mit dem Fahrer…';
    }
  }

  function hello() { return { t: 'hello', seed: SEED, env: ENV.id, car: CAR.id, damage: vehicle.damage }; }

  function startHosting(preferredCode) {
    game.role = 'driver';
    notebook.setRole('driver');
    hostRoom({
      preferredCode,
      onCode: (code) => {
        game.roomCode = code;
        sessionStorage.setItem('rally.hostCode', code);
        if ($('m-host')) showMenu(); // show the code in the menu
      },
      onGuest: (l) => {
        link = l;
        link.send(hello());
        link.onClose(() => setCoopStatus());
        if (game.state === 'finished') link.send({ t: 'finish', time: game.time + game.penalty, line: '' });
      },
      onGuestFailed: () => {
        setError(NAT_MESSAGE);
        $('coop-status').textContent = '👥 Beifahrer kommt nicht durch (Netzwerk blockiert)';
      },
      onError: (e) => setError(e.message),
    });
  }

  async function joinGame(code, retries = 0) {
    code = normalizeCode(code);
    if (code.length !== 5) { setError('Der Code hat 5 Zeichen.'); return; }
    setError('');
    game.roomCode = code;
    if (!JOIN) { go(`?seed=${SEED}&env=${ENV.id}&car=${CAR.id}&join=${code}`); return; }
    $('loading').classList.remove('hidden');
    $('loading').textContent = retries ? `Warte auf den Fahrer… (${retries})` : 'Verbinde mit dem Fahrer…';
    try {
      const l = await joinRoom(code);
      const h = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Der Fahrer antwortet nicht.')), 8000);
        l.on('hello', (m) => { clearTimeout(timer); resolve(m); });
      });
      if (h.seed !== SEED || h.env !== ENV.id || h.car !== CAR.id) {
        l.close();
        go(`?seed=${h.seed}&env=${h.env}&car=${h.car}&join=${code}`);
        return;
      }
      link = l;
      vehicle.setDamage(h.damage || {});
      car.setDamage(vehicle.damage);
      becomeCodriver();
    } catch (e) {
      // the driver may be loading the next stage: keep trying for a while,
      // but a wrong code or blocked networks will not fix themselves
      const final = e.kind === 'nat' || (e.kind === 'not-found' && retries >= 3);
      if (!final && retries < 20) { setTimeout(() => joinGame(code, retries + 1), 2000); return; }
      showOverlay(`<p class="sub">${e.message}</p><button class="btn primary" id="j-retry">Nochmal versuchen</button><button class="btn ghost" id="j-menu">Hauptmenü</button>`);
      $('j-retry').onclick = () => location.reload();
      $('j-menu').onclick = () => go('');
    }
  }

  function becomeCodriver() {
    game.role = 'codriver';
    game.camMode = 0;
    document.body.classList.add('codriver');
    notebook.setRole('codriver');
    hideOverlay();
    $('hud').classList.remove('hidden');
    $('message').textContent = 'Warte auf den Start…';
    link.on('s', (m) => {
      const off = performance.now() - m.ts;
      remote.offset = remote.offset === null ? off : Math.min(remote.offset + 0.05, off);
      remote.buf.push(m);
      if (remote.buf.length > 30) remote.buf.shift();
    });
    link.on('restart', () => {
      remote.buf.length = 0;
      remote.lastSplits = 0;
      $('splits').innerHTML = '';
      hideOverlay();
      notebook.sync(stage.startIndex - 4);
    });
    link.on('finish', (m) => {
      $('message').textContent = 'ZIEL!';
      game.state = 'finished';
      showResult(m.time, m.line || '');
    });
    link.onClose(() => {
      // usually the driver is loading the next stage; reconnect
      setCoopStatus();
      $('message').textContent = '';
      showOverlay('<p class="sub">Verbindung zum Fahrer unterbrochen – verbinde neu…</p>');
      setTimeout(() => location.reload(), 2500);
    });
    const unlock = () => {
      audio.start();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  // ---------- start-up ----------
  $('loading').textContent = '';
  placeAtIndex(stage.startIndex - 4);
  // sound can only start after a key press or click
  const unlockAudio = () => { audio.start(); };
  window.addEventListener('keydown', unlockAudio, { once: true });
  window.addEventListener('pointerdown', unlockAudio, { once: true });

  if (JOIN) {
    joinGame(JOIN);
  } else {
    if (game.roomCode) startHosting(game.roomCode);
    if (MODE === 'final') {
      showOverlay(finalScreen(CHAMP));
      $('f-new').onclick = () => go('');
      enterAction = () => go('');
    } else if (MODE === 'champ') {
      if (CHAMP.serviceDue) showService();
      else if (params.has('go')) { hideOverlay(); restart(); } else showChampIntro();
    } else if (params.has('go') || AUTOPILOT) {
      hideOverlay();
      restart();
    } else {
      if (params.get('menu')) sessionStorage.setItem('rally.tab', params.get('menu'));
      showMenu();
    }
  }
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
  let shakeTime = 0;

  function updateCamera(dt, pos, quat) {
    const fwd = tmpV.set(1, 0, 0).applyQuaternion(quat);
    const carYaw = Math.atan2(fwd.z, fwd.x);
    const speed = Math.abs(vehicle.speed);
    car.setView(game.role, game.camMode === 0);
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
      // driver's/passenger's eyes or bonnet camera, attached to the car with slightly smoothed rotation
      if (!cockpitInit) { cockpitQuat.copy(quat); cockpitInit = true; }
      cockpitQuat.slerp(quat, 1 - Math.exp(-dt * 22));
      if (game.camMode === 0) {
        headLocal.copy(car.headPosition);
        if (game.role === 'codriver') headLocal.z = -headLocal.z; // passenger seat
      } else headLocal.set(1.3, 0.32, 0);
      camera.position.copy(headLocal).applyQuaternion(quat).add(pos);
      if (game.camMode === 0) {
        const shake = Math.min(1, speed / 30) * 0.006 * (ENV.id === 'tarmac' ? 0.4 : 1) + (shakeTime > 0 ? 0.05 * shakeTime : 0);
        camera.position.y += (Math.random() - 0.5) * shake;
        camera.position.x += (Math.random() - 0.5) * (shakeTime > 0 ? 0.05 * shakeTime : 0);
      }
      lookYaw += (vehicle.steer * 0.5 - lookYaw) * (1 - Math.exp(-dt * 4));
      euler.set(game.camMode === 0 ? -0.05 : -0.04, -Math.PI / 2 + (game.camMode === 0 ? lookYaw : 0), 0, 'YXZ');
      qBase.setFromEuler(euler);
      camera.quaternion.copy(qTmp.copy(cockpitQuat).multiply(qBase));
      camInit = false;
    }
    shakeTime = Math.max(0, shakeTime - dt * 2);
    car.steeringWheel.rotation.x = -(vehicle.steer / TUNING.steerLow) * 2.2;
    const fovBase = game.camMode === 0 ? 72 : 62;
    const fov = fovBase + Math.min(game.camMode === 0 ? 8 : 14, speed * (game.camMode === 0 ? 0.12 : 0.22));
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
    sky.position.copy(camera.position);
  }

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
    const d = vehicle.damage;
    link.send({
      t: 's', ts: performance.now(),
      p: [r3(t.x), r3(t.y), r3(t.z)], q: [r3(q.x), r3(q.y), r3(q.z), r3(q.w)], lv: [r3(v.x), r3(v.y), r3(v.z)],
      v: r3(vehicle.speed), st: r3(vehicle.steer), r: Math.round(vehicle.rpm), g: vehicle.gear, th: r3(vehicle.throttle || 0),
      i: game.trackIndex, tm: r3(game.time + game.penalty), gs: game.state, cd: r3(game.countdown),
      w: [0, 1, 2, 3].map((i) => r3(vehicle.vc.wheelSuspensionLength(i) ?? TUNING.restLength)),
      c: contacts, sf: surf, sl: vehicle.wheelSlip.map(r3), sp: game.splits,
      dm: [r3(d.engine), r3(d.suspension), r3(d.body)],
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
    const latest = buf[buf.length - 1];
    if (latest.dm) {
      const [e, su, bo] = latest.dm;
      if (bo > vehicle.damage.body + 0.03) shakeTime = 1; // the driver hit something
      vehicle.setDamage({ engine: e, suspension: su, body: bo });
    }
    game.trackIndex = latest.i;
    game.time = latest.tm;
    game.countdown = latest.cd;
    remote.prevState = remote.lastState;
    remote.lastState = latest.gs;
    if (game.state !== 'finished' || latest.gs !== 'finished') game.state = latest.gs === 'intro' ? 'countdown' : latest.gs;
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

  let toastTimer = 0;
  let rumbleTimer = 0;
  function toast(text, secs = 1.6) { $('toast').textContent = text; toastTimer = secs; }

  // Fullscreen with keyboard lock: the only way a page may keep Ctrl+W (close tab) for itself.
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return; }
      await document.documentElement.requestFullscreen();
      if (navigator.keyboard && navigator.keyboard.lock) await navigator.keyboard.lock();
      toast('Vollbild – Esc gedrückt halten zum Verlassen', 2.5);
    } catch { toast('Vollbild nicht möglich', 1.5); }
  }

  function onImpact(sev) {
    if (sev <= 0) return;
    car.setDamage(vehicle.damage);
    audio.crash(Math.min(1, sev * 2));
    input.rumble(0.4 + sev * 2, 0.7, 180 + sev * 500);
    shakeTime = Math.min(1.2, 0.4 + sev * 2);
    if (sev > 0.04) toast('Schaden!');
  }

  // ---------- main loop ----------
  const STEP = 1 / 60;
  let acc = 0;
  let last = performance.now();
  const smokeColor = { r: 0.32, g: 0.32, b: 0.34 };
  const renderPos = new THREE.Vector3(), renderQuat = new THREE.Quaternion();
  const contact = { x: 0, y: 0, z: 0 };
  const smokePoint = new THREE.Vector3();

  window.__rally = { vehicle, stage, game, TUNING, restart, pacenotes, notebook, getLink: () => link, renderer, scene, camera, sun, world, autopilot, surfaceAt, placeAtIndex, events, onImpact, ENV, CAR, CHAMP };

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const overlayOpen = !$('overlay').classList.contains('hidden');
    input.menuOpen = overlayOpen;
    const inp = input.read(dt);
    const isCo = game.role === 'codriver';
    if (overlayOpen) handleMenuNav(inp.actions);

    // one-shot actions
    if (inp.actions.has('KeyM')) audio.toggleMute();
    if (inp.actions.has('KeyF')) toggleFullscreen();
    if (!isCo && inp.actions.has('KeyG')) {
      game.manual = !game.manual;
      localStorage.setItem('rally.gearbox', game.manual ? 'manual' : 'auto');
      toast(game.manual ? 'Schaltung: manuell (Umschalt / Strg)' : 'Schaltung: Automatik', 2);
    }
    vehicle.manual = game.manual && !AUTOPILOT && !isCo;
    const canShift = !isCo && vehicle.manual && (game.state === 'running' || game.state === 'countdown');
    if (canShift && (inp.actions.has('ShiftLeft') || inp.actions.has('ShiftRight'))) vehicle.shiftUp();
    if (canShift && (inp.actions.has('ControlLeft') || inp.actions.has('ControlRight'))) {
      if (!vehicle.shiftDown() && vehicle.gear > 1) toast('Drehzahl zu hoch zum Runterschalten', 1);
    }
    if (inp.actions.has('KeyB') && !isCo) notebook.toggleBook();
    if (inp.actions.has('KeyV') && game.role === 'solo') notebook.toggleVoice();
    if (inp.actions.has('KeyC')) {
      game.camMode = (game.camMode + 1) % 3;
      localStorage.setItem('rally.cam', String(game.camMode));
    }
    if (inp.actions.has('Enter') && overlayOpen && enterAction) enterAction();
    else if (inp.actions.has('Enter') && (MODE === 'free' || MODE === 'weekly') && !isCo && game.state !== 'intro') restart();
    if (inp.actions.has('KeyN') && MODE === 'free' && !isCo && !overlayOpen) { go(freeQuery(Math.floor(Math.random() * 99999) + 1, ENV.id, CAR.id, true)); return; }
    // in fullscreen the browser wants Esc held to leave it, so Esc does not open the menu there
    if (inp.actions.has('Escape') && !document.fullscreenElement && !isCo && game.state !== 'intro') {
      if (MODE === 'champ' && (game.state === 'running' || game.state === 'countdown')) {
        if (confirm('Prüfung aufgeben? Wie bei einer echten Rallye bekommst du die Bestzeit dieser Prüfung plus 10 Minuten – die Rallye geht weiter.')) retire();
      } else go('');
    }
    if (!isCo && inp.actions.has('KeyR') && (game.state === 'running' || game.state === 'countdown')) {
      placeAtIndex(Math.max(stage.startIndex - 4, game.trackIndex - 3));
      if (MODE === 'champ' && game.state === 'running') { game.penalty += RESET_PENALTY; toast(`Bergung +${RESET_PENALTY} s`); }
    }

    let drive = AUTOPILOT && game.state === 'running' ? autopilot() : inp;
    if (game.state === 'intro') drive = { throttle: 0, brake: 0, steer: inp.steer, handbrake: true };
    // at the start line the brakes hold the car until you press the throttle: going before "LOS!" is a jump start
    if (game.state === 'countdown') drive = { throttle: inp.throttle, brake: 0, hold: inp.throttle <= 0.05, steer: inp.steer, handbrake: false };
    if (game.state === 'finished') drive = { throttle: 0, brake: 0.6, steer: 0, handbrake: false };

    if (isCo) {
      applyRemote(now);
    } else {
      acc += dt;
      while (acc >= STEP) {
        vehicle.step(STEP, drive, surfaceAt);
        world.step(events);
        events.drainContactForceEvents((e) => {
          if (vehicle.colliders.has(e.collider1()) || vehicle.colliders.has(e.collider2())) onImpact(vehicle.applyImpact(e.maxForceDirection()));
        });
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
      // jump start (Art. 48.6): 10 s, then 1 min, then 3 min
      if (!game.jumped && game.startPos && Math.hypot(p.x - game.startPos.x, p.z - game.startPos.z) > 0.6) {
        game.jumped = true;
        const n = MODE === 'champ' ? (CHAMP.jumpStarts = (CHAMP.jumpStarts || 0) + 1) : ++game.jumpStarts;
        if (MODE === 'champ') saveChampionship(CHAMP);
        const pen = JUMP_START_PENALTIES[Math.min(n, JUMP_START_PENALTIES.length) - 1];
        game.penalty += pen;
        toast(`FRÜHSTART +${pen >= 60 ? `${pen / 60} min` : `${pen} s`}`, 3);
      }
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
        game.splits.push(game.time + game.penalty);
        $('splits').insertAdjacentHTML('beforeend', `<div>Split ${k + 1}: ${formatTime(game.time + game.penalty)}</div>`);
      }
      if (ti >= stage.finishIndex && distFromRoad < 25) {
        $('message').textContent = 'ZIEL!';
        finish();
      }
      // leaving the route is free, cutting it is not: compare the road skipped with the distance driven off it
      if (!game.off && distFromRoad > stage.halfWidth + OFF_TRACK_MARGIN) {
        game.off = true;
        game.exitIndex = game.lastOnRoad ?? ti;
        game.offPath = 0;
        game.offTime = 0;
        game.offLast = { x: p.x, z: p.z };
      } else if (game.off) {
        game.offPath += Math.hypot(p.x - game.offLast.x, p.z - game.offLast.z);
        game.offLast = { x: p.x, z: p.z };
        game.offTime += dt;
        if (game.offTime > OFF_RESET_TIME) {
          // too long off the route: back onto the road where the car left it
          placeAtIndex(Math.max(stage.startIndex - 4, game.exitIndex - 3));
          game.penalty += OFF_RESET_PENALTY;
          toast(`Zurück auf die Strecke gesetzt +${OFF_RESET_PENALTY} s`, 2.5);
        } else if (distFromRoad < stage.halfWidth + 1.5) {
          game.off = false;
          const gain = (ti - game.exitIndex) - game.offPath;
          if (gain > CUT_MIN_GAIN) {
            const step = CUT_PENALTIES[Math.min(game.cuts, CUT_PENALTIES.length - 1)];
            const pen = Math.max(step, Math.ceil((gain / CUT_REF_SPEED) * 1.5));
            game.cuts++;
            game.penalty += pen;
            toast(`Abgekürzt (${Math.round(gain)} m) +${pen} s`, 2.5);
          }
        }
      }
      if (!game.off && distFromRoad < stage.halfWidth + 1.5) game.lastOnRoad = ti;
    }

    notebook.update(ti, vehicle.speed, game.state === 'running');

    // stuck / off-road helpers
    const up = isCo ? { y: 1 } : vehicle.up();
    if (up.y < 0.25 && Math.abs(vehicle.speed) < 2) game.flipTimer += dt; else game.flipTimer = 0;
    if (!isCo && (game.flipTimer > 2.5 || p.y < -200)) {
      placeAtIndex(game.trackIndex);
      if (MODE === 'champ' && game.state === 'running') { game.penalty += RESET_PENALTY; toast(`Bergung +${RESET_PENALTY} s`); }
    }
    let hint = '';
    if (game.state === 'running' && !isCo) {
      if (game.flipTimer > 0.6) hint = 'Überschlagen – gleich geht’s weiter';
      else if (game.off) {
        const left = Math.max(0, OFF_RESET_TIME - game.offTime).toFixed(1).replace('.', ',');
        hint = `Abseits der Route – zurück auf die Straße! Sonst Zurücksetzen +${OFF_RESET_PENALTY} s in ${left} s`;
      }
    }
    const pen = isCo ? 0 : game.penalty;
    $('penalty').textContent = pen > 0.05 ? `Strafe +${pen.toFixed(1).replace('.', ',')} s` : '';
    $('hint').textContent = hint;
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').textContent = ''; }

    // visuals
    if (!isCo) {
      const alpha = acc / STEP;
      renderPos.lerpVectors(prevPos, currPos, alpha);
      renderQuat.slerpQuaternions(prevQuat, currQuat, alpha);
    }
    car.root.position.copy(renderPos);
    car.root.quaternion.copy(renderQuat);
    const dmg = vehicle.damage;
    for (let i = 0; i < 4; i++) {
      const w = car.wheels[i];
      const wp = vehicle.wheelPositions[i];
      const len = isCo ? remote.susp[i] : vehicle.vc.wheelSuspensionLength(i) ?? TUNING.restLength;
      w.steerGroup.position.set(wp.x, wp.y - len, wp.z);
      w.steerGroup.rotation.y = i < 2 ? vehicle.steer : 0;
      // bent suspension: one front wheel leans
      w.steerGroup.rotation.x = i === (vehicle.pull > 0 ? 1 : 0) ? dmg.suspension * 0.25 * vehicle.pull : 0;
      if (isCo) vehicle.wheelSpin[i] += (vehicle.speed * dt) / TUNING.wheelRadius;
      w.spin.rotation.z = -vehicle.wheelSpin[i];
    }

    // dust / snow spray and engine smoke
    const vel = isCo ? remote.vel : vehicle.body.linvel();
    const sp = Math.abs(vehicle.speed);
    for (let i = 0; i < 4; i++) {
      if (isCo ? !(remote.contacts & (1 << i)) : !vehicle.vc.wheelIsInContact(i)) continue;
      const offRoadWheel = vehicle.wheelSurface[i] === 'grass';
      const base = offRoadWheel ? 0.3 : 0.6 * ENV.dust.amount;
      const amount = Math.min(1, sp / 28) * base + vehicle.wheelSlip[i] * Math.min(1, sp / 6) * 0.9 * Math.max(0.3, ENV.dust.amount);
      let n = amount * dt * 55;
      const cp = isCo ? wheelGroundPoint(i) : vehicle.vc.wheelContactPoint(i, contact);
      if (!cp) continue;
      const color = offRoadWheel ? { r: ENV.dust.color.r * 0.75, g: ENV.dust.color.g * 0.75, b: ENV.dust.color.b * 0.7 } : ENV.dust.color;
      while (n > 0) {
        if (n >= 1 || Math.random() < n) dust.emit(cp.x, cp.y + 0.15, cp.z, vel.x * 0.25, 0.4, vel.z * 0.25, amount, color);
        n -= 1;
      }
    }
    if (dmg.engine > 0.45 && Math.random() < (dmg.engine - 0.35) * dt * 30) {
      smokePoint.copy(car.smokePoint).applyQuaternion(renderQuat).add(renderPos);
      dust.emit(smokePoint.x, smokePoint.y, smokePoint.z, vel.x * 0.6, 1.2, vel.z * 0.6, 0.6, smokeColor);
    }
    dust.update(dt, scene.fog, renderer.domElement.height);

    updateCamera(dt, renderPos, renderQuat);
    sun.position.copy(renderPos).addScaledVector(sunDir, 120);
    sun.target.position.copy(renderPos);

    // HUD
    $('speed').textContent = Math.round(sp * 3.6);
    $('gear').textContent = vehicle.gear < 0 ? 'R' : vehicle.gear === 0 ? 'N' : String(vehicle.gear);
    $('gear-mode').textContent = vehicle.manual ? 'MAN' : 'AUTO';
    $('rpm-fill').style.width = `${Math.min(100, (vehicle.rpm / 7800) * 100)}%`;
    $('rpm-text').textContent = `${(vehicle.rpm / 1000).toFixed(1)}`;
    // shift light: yellow from 6500 rpm, flashing red at the limiter
    const shiftLight = vehicle.rpm > 7300 ? (Math.floor(now / 80) % 2 ? 'hot' : 'flash') : vehicle.rpm > 6500 ? 'warn' : '';
    $('speedo').dataset.shift = shiftLight;
    $('timer').textContent = formatTime(isCo ? game.time : game.time + game.penalty);
    const total = stage.finishIndex - stage.startIndex;
    const done = Math.max(0, Math.min(total, ti - stage.startIndex));
    $('progress-fill').style.width = `${(done / total) * 100}%`;
    $('progress-label').textContent = `Noch ${((total - done) / 1000).toFixed(1).replace('.', ',')} km`;
    const anyDamage = dmg.engine + dmg.suspension + dmg.body > 0.01;
    $('damage').classList.toggle('hidden', !anyDamage);
    if (anyDamage) {
      for (const part of ['engine', 'suspension', 'body']) {
        const el = $(`dmg-${part}`);
        el.style.width = `${Math.round(dmg[part] * 100)}%`;
        el.style.background = barColor(dmg[part]);
      }
    }

    const onGravel = vehicle.wheelSurface.filter((s) => s === 'gravel').length >= 2 && ENV.id !== 'tarmac';
    // controller: light road feel, stronger off the road, buzz at the rev limiter
    rumbleTimer -= dt;
    if (input.pad && rumbleTimer <= 0 && !overlayOpen && game.state === 'running') {
      rumbleTimer = 0.12;
      const offroad = vehicle.wheelSurface.some((s) => s === 'grass');
      const road = Math.min(1, sp / 30) * (offroad ? 0.35 : onGravel ? 0.12 : 0.04);
      const weak = road + Math.max(...vehicle.wheelSlip) * 0.15 + (vehicle.limiter ? 0.18 : 0);
      if (weak > 0.03) input.rumble(offroad ? road * 0.6 : 0, weak, 140);
    }
    const slip = Math.max(...vehicle.wheelSlip);
    audio.update(vehicle.rpm, isCo ? vehicle.throttle : drive.throttle, vehicle.speed, slip, onGravel);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // testing aid: run frames by hand (hidden tabs get no animation frames)
  window.__rally.tick = (n = 1) => { for (let k = 0; k < n; k++) { last -= 1000 / 60; frame(performance.now()); } };
}

main().catch((e) => {
  console.error(e);
  $('loading').classList.remove('hidden');
  $('loading').textContent = `Fehler: ${e.message}`;
});

