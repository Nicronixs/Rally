// Achievements with prize money. Stored in the player profile:
// p.ach = { done: { id: ISO date }, stats: { km, stages, coop, cleanStreak, rallies: {}, surfaces: {}, weeks: {} } }.
import { addMoney, saveProfile, formatMoney, ownsCar, upgradeLevel, UPGRADES, LIVERIES, ownsLivery, tunedOverrides } from './profile.js';
import { CARS } from './cars.js';
import { TUNING } from './vehicle.js';
import { rateCar } from './ratings.js';

export const ACHIEVEMENTS = [
  // driving
  { id: 'first_stage', icon: '🏁', name: 'Erste Prüfung', text: 'Bring eine Prüfung ins Ziel.', reward: 2000 },
  { id: 'stages_10', icon: '🔟', name: 'Stammfahrer', text: 'Beende 10 Prüfungen.', reward: 5000, stat: 'stages', goal: 10 },
  { id: 'stages_50', icon: '📅', name: 'Routinier', text: 'Beende 50 Prüfungen.', reward: 20000, stat: 'stages', goal: 50 },
  { id: 'km_25', icon: '🛣️', name: 'Warmgefahren', text: 'Fahr insgesamt 25 km.', reward: 5000, stat: 'km', goal: 25 },
  { id: 'km_100', icon: '🗺️', name: 'Kilometerfresser', text: 'Fahr insgesamt 100 km.', reward: 15000, stat: 'km', goal: 100 },
  { id: 'km_500', icon: '🌐', name: 'Langstrecke', text: 'Fahr insgesamt 500 km.', reward: 40000, stat: 'km', goal: 500 },
  { id: 'world', icon: '🧭', name: 'Weltenbummler', text: 'Beende eine Prüfung auf jedem Untergrund: Schotter, Schnee, Asphalt und Sand.', reward: 8000, stat: 'surfaces', goal: 4 },
  { id: 'speed_200', icon: '💨', name: 'Tempo 200', text: 'Erreiche 200 km/h.', reward: 5000 },
  { id: 'speed_230', icon: '🚀', name: 'Tempo 230', text: 'Erreiche 230 km/h.', reward: 10000 },
  { id: 'manual', icon: '🕹️', name: 'Handschalter', text: 'Beende eine Prüfung mit manueller Schaltung.', reward: 5000 },
  { id: 'drift', icon: '🌀', name: 'Quertreiber', text: 'Drifte 2 Sekunden am Stück quer über 40 km/h.', reward: 5000 },
  { id: 'drift_long', icon: '🌪️', name: 'Drift-König', text: 'Drifte 4 Sekunden am Stück quer über 40 km/h.', reward: 15000 },
  { id: 'wreck', icon: '💥', name: 'Bruchpilot', text: 'Bau einen richtig heftigen Unfall.', reward: 2000 },
  // championship
  { id: 'clean', icon: '🧼', name: 'Saubere Fahrt', text: 'Beende eine Meisterschaftsprüfung ohne Strafe und ohne Schaden.', reward: 8000 },
  { id: 'clean_3', icon: '✨', name: 'Fehlerlos', text: 'Beende drei Meisterschaftsprüfungen hintereinander ohne Strafe.', reward: 12000, stat: 'cleanStreak', goal: 3 },
  { id: 'stage_win', icon: '🥇', name: 'Bestzeit', text: 'Gewinne eine Meisterschaftsprüfung.', reward: 10000 },
  { id: 'podium', icon: '🥉', name: 'Podium', text: 'Beende eine Rallye unter den ersten drei.', reward: 8000 },
  { id: 'rally_win', icon: '🏆', name: 'Rallyesieger', text: 'Gewinne eine Rallye.', reward: 20000 },
  { id: 'hattrick', icon: '🎩', name: 'Hattrick', text: 'Gewinne alle drei Prüfungen einer Rallye.', reward: 25000 },
  { id: 'underdog', icon: '🦊', name: 'Underdog', text: 'Gewinne eine Rallye mit dem Fuchs R2.', reward: 15000 },
  { id: 'surfaces', icon: '🌍', name: 'Allrounder', text: 'Beende je eine Rallye auf Schotter, Schnee, Asphalt und Sand.', reward: 15000, stat: 'rallies', goal: 4 },
  { id: 'champion', icon: '👑', name: 'Meister', text: 'Gewinne die Meisterschaft.', reward: 50000 },
  { id: 'dragon_champ', icon: '🐉', name: 'Königsklasse', text: 'Gewinne die Meisterschaft mit dem Drache Hybrid.', reward: 30000 },
  { id: 'sweep', icon: '💯', name: 'Durchmarsch', text: 'Gewinne alle vier Rallyes einer Meisterschaft.', reward: 75000 },
  // garage
  { id: 'buy_car', icon: '🚗', name: 'Neues Auto', text: 'Kauf dir ein Auto.', reward: 5000 },
  { id: 'first_upgrade', icon: '🔩', name: 'Feintuning', text: 'Bau dein erstes Tuning-Teil ein.', reward: 2000 },
  { id: 'livery', icon: '🎨', name: 'Neuer Look', text: 'Kauf eine Lackierung.', reward: 3000 },
  { id: 'all_liveries', icon: '🖌️', name: 'Modezar', text: 'Kauf alle Lackierungen für ein Auto.', reward: 15000 },
  { id: 'full_tune', icon: '🔧', name: 'Voll getunt', text: 'Bring alle vier Teile eines Autos auf Stufe 3.', reward: 20000 },
  { id: 'class_s', icon: '⭐', name: 'S-Klasse', text: 'Besitze ein Auto mit mindestens 801 PI (Klasse S1).', reward: 10000 },
  { id: 'savings', icon: '🐷', name: 'Sparschwein', text: 'Hab 250.000 € auf dem Konto.', reward: 10000, stat: 'money', goal: 250000 },
  { id: 'collector', icon: '🏎️', name: 'Sammler', text: 'Besitze alle acht Autos.', reward: 100000, stat: 'cars', goal: 8 },
  // online
  { id: 'weekly', icon: '⏱️', name: 'In der Rangliste', text: 'Trag eine Zeit bei der Strecke der Woche ein.', reward: 5000 },
  { id: 'weekly_3', icon: '📆', name: 'Stammgast', text: 'Trag in drei verschiedenen Wochen eine Zeit ein.', reward: 15000, stat: 'weeks', goal: 3 },
  { id: 'coop', icon: '👥', name: 'Teamwork', text: 'Beende eine Prüfung im Koop – als Fahrer oder Beifahrer.', reward: 10000 },
  { id: 'coop_10', icon: '🤝', name: 'Eingespieltes Team', text: 'Beende 10 Prüfungen im Koop.', reward: 20000, stat: 'coop', goal: 10 },
];

const BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

function state(p) {
  if (!p.ach) p.ach = { done: {}, stats: {} };
  const s = p.ach.stats;
  for (const k of ['rallies', 'surfaces', 'weeks']) s[k] = s[k] || {};
  for (const k of ['km', 'stages', 'coop', 'cleanStreak']) s[k] = s[k] || 0;
  return p.ach;
}

export const isDone = (p, id) => !!state(p).done[id];

// current value of a progress achievement
export function progress(p, a) {
  const s = state(p).stats;
  switch (a.stat) {
    case 'cars': return Object.keys(CARS).filter((id) => ownsCar(p, id)).length;
    case 'money': return p.money;
    case 'rallies': case 'surfaces': case 'weeks': return Object.keys(s[a.stat]).length;
    default: return s[a.stat] || 0;
  }
}

// Unlocks an achievement once and pays its reward; returns it if new (for the popup), else null.
export function unlock(p, id) {
  const a = BY_ID[id];
  if (!a || isDone(p, id)) return null;
  state(p).done[id] = new Date().toISOString();
  addMoney(p, a.reward); // also saves the profile
  notify(a);
  checkGoals(p); // the reward may reach the savings goal
  return a;
}

// progress achievements whose goal is now reached
export function checkGoals(p) {
  for (const a of ACHIEVEMENTS) if (a.goal && !isDone(p, a.id) && progress(p, a) >= a.goal) unlock(p, a.id);
}

function bump(p, fn) {
  fn(state(p).stats);
  saveProfile(p);
  checkGoals(p);
}

// kilometres are saved in steps of 100 m
let kmPending = 0;
export function addKm(p, km) {
  kmPending += km;
  if (kmPending < 0.1) return;
  const add = kmPending;
  kmPending = 0;
  bump(p, (s) => { s.km += add; });
}

// any finished stage: count, surface, co-op
export function stageFinished(p, envId, coop) {
  bump(p, (s) => {
    s.stages += 1;
    s.surfaces[envId] = true;
    if (coop) s.coop += 1;
  });
}

// championship stage: penalty-free streak
export function champStage(p, penaltyFree) {
  bump(p, (s) => { s.cleanStreak = penaltyFree ? s.cleanStreak + 1 : 0; });
}

export function rallyFinished(p, rallyId) {
  bump(p, (s) => { s.rallies[rallyId] = true; });
}

export function weeklySubmitted(p, weekId) {
  bump(p, (s) => { s.weeks[weekId] = true; });
}

// after any garage purchase
export function checkGarage(p, carId) {
  if (Object.keys(UPGRADES).some((part) => upgradeLevel(p, carId, part) > 0)) unlock(p, 'first_upgrade');
  if (Object.keys(UPGRADES).every((part) => upgradeLevel(p, carId, part) >= 3)) unlock(p, 'full_tune');
  if (LIVERIES.every((l) => ownsLivery(p, carId, l.id))) unlock(p, 'all_liveries');
  if (ownsCar(p, carId) && rateCar({ ...TUNING, ...tunedOverrides(p, carId, TUNING) }).pi >= 801) unlock(p, 'class_s');
  checkGoals(p);
}

// ---------- popup ----------
const queue = [];
let showing = false;

function notify(a) {
  queue.push(a);
  if (!showing) next();
}

function next() {
  const a = queue.shift();
  if (!a) { showing = false; return; }
  showing = true;
  let el = document.getElementById('ach-pop');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ach-pop';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="ach-icon">${a.icon}</div><div><div class="ach-head">Erfolg freigeschaltet</div>
    <div class="ach-name">${a.name}</div><div class="ach-reward">+${formatMoney(a.reward)}</div></div>`;
  el.classList.remove('show');
  void el.offsetWidth; // restart the animation
  el.classList.add('show');
  setTimeout(() => { el.classList.remove('show'); setTimeout(next, 400); }, 3800);
}
