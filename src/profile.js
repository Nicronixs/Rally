// Player profile: prize money, owned cars, tuning and liveries (saved in the browser).
import { CARS } from './cars.js';

const KEY = 'rally.profile';
export const START_CAR = 'fuchs';
export const START_MONEY = 15000;

export const CAR_PRICES = {
  fuchs: 0, bison: 40000, falke: 70000, luchs: 100000, wolf: 150000, adler: 220000, panther: 320000, drache: 450000,
};

// Prize money by finishing position (1st … 8th)
export const RALLY_PRIZES = [25000, 18000, 15000, 12000, 10000, 8000, 6000, 4000];
export const CHAMPION_PRIZES = [100000, 60000, 40000, 25000, 15000, 10000, 5000, 2000];

// Tuning: 3 levels per part. effect() turns a level into physics overrides relative to the car's own values.
export const UPGRADES = {
  engine: {
    name: 'Motor', text: 'Mehr Leistung und Zugkraft', prices: [8000, 16000, 30000],
    effect: (t, l) => ({ power: t.power * (1 + 0.06 * l), maxDriveForce: t.maxDriveForce * (1 + 0.04 * l) }),
  },
  brakes: {
    name: 'Bremsen', text: 'Stärkere Bremsen', prices: [6000, 12000, 22000],
    effect: (t, l) => ({ brakeImpulse: t.brakeImpulse * (1 + 0.1 * l) }),
  },
  suspension: {
    name: 'Fahrwerk', text: 'Stabiler, weniger Schaden', prices: [7000, 14000, 26000],
    effect: (t, l) => ({ yawHold: t.yawHold * (1 + 0.08 * l), rollDamping: t.rollDamping * (1 + 0.1 * l), damageResist: 1 - 0.15 * l }),
  },
  tyres: {
    name: 'Reifen', text: 'Mehr Grip auf jedem Untergrund', prices: [8000, 16000, 30000],
    effect: (t, l) => ({ frontGrip: t.frontGrip * (1 + 0.03 * l), rearGrip: t.rearGrip * (1 + 0.03 * l) }),
  },
};

// Tuning costs more on dearer cars: factor 0.8 (start car) up to about 3 (450.000 € car).
export const upgradeFactor = (carId) => 0.8 + (CAR_PRICES[carId] ?? 0) / 200000;

// price of the given level (0-based) of a part for a car, rounded to 500 €; undefined = maxed out
export function upgradePrice(carId, part, level) {
  const base = UPGRADES[part].prices[level];
  return base === undefined ? undefined : Math.round((base * upgradeFactor(carId)) / 500) * 500;
}

// Liveries: the factory one is free; the others replace paint, stripe, accent and rim colours.
export const LIVERIES = [
  { id: 'werk', name: 'Werkslackierung', price: 0 },
  { id: 'mitternacht', name: 'Mitternacht', price: 10000, colors: { color: 0x14213d, stripe: 0xfca311, accent: 0xe5e5e5, rim: 0x2a2a2a } },
  { id: 'gletscher', name: 'Gletscher', price: 12000, colors: { color: 0xe8f4fa, stripe: 0x00a6d6, accent: 0x0b3c5d, rim: 0xffffff } },
  { id: 'feuer', name: 'Feuer', price: 15000, colors: { color: 0xd62828, stripe: 0xfcbf49, accent: 0x141414, rim: 0xf77f00 } },
  { id: 'gold', name: 'Schwarz-Gold', price: 25000, colors: { color: 0x161616, stripe: 0xd4af37, accent: 0xd4af37, rim: 0xd4af37 } },
];

function fresh() {
  return { version: 1, money: START_MONEY, cars: [START_CAR], upgrades: {}, liveries: {}, earned: 0 };
}

export function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (p && p.version === 1) return p;
  } catch { /* broken save: start over */ }
  const p = fresh();
  saveProfile(p);
  return p;
}

export function saveProfile(p) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export const formatMoney = (v) => `${Math.round(v).toLocaleString('de-DE')} €`;

export const ownsCar = (p, carId) => p.cars.includes(carId);

export function addMoney(p, amount) {
  p.money += amount;
  p.earned = (p.earned || 0) + amount;
  saveProfile(p);
}

function pay(p, price) {
  if (p.money < price) return false;
  p.money -= price;
  return true;
}

export function buyCar(p, carId) {
  if (ownsCar(p, carId) || !pay(p, CAR_PRICES[carId] ?? Infinity)) return false;
  p.cars.push(carId);
  saveProfile(p);
  return true;
}

export const upgradeLevel = (p, carId, part) => (p.upgrades[carId] && p.upgrades[carId][part]) || 0;

export function buyUpgrade(p, carId, part) {
  const level = upgradeLevel(p, carId, part);
  const price = upgradePrice(carId, part, level);
  if (!ownsCar(p, carId) || price === undefined || !pay(p, price)) return false;
  p.upgrades[carId] = { ...(p.upgrades[carId] || {}), [part]: level + 1 };
  saveProfile(p);
  return true;
}

function liveryState(p, carId) {
  if (!p.liveries[carId]) p.liveries[carId] = { owned: ['werk'], selected: 'werk' };
  return p.liveries[carId];
}

export const ownsLivery = (p, carId, id) => liveryState(p, carId).owned.includes(id);
export const selectedLivery = (p, carId) => liveryState(p, carId).selected;

export function buyLivery(p, carId, id) {
  const l = LIVERIES.find((x) => x.id === id);
  if (!l || !ownsCar(p, carId) || ownsLivery(p, carId, id) || !pay(p, l.price)) return false;
  liveryState(p, carId).owned.push(id);
  liveryState(p, carId).selected = id;
  saveProfile(p);
  return true;
}

export function selectLivery(p, carId, id) {
  if (!ownsLivery(p, carId, id)) return false;
  liveryState(p, carId).selected = id;
  saveProfile(p);
  return true;
}

// Car livery with a chosen design applied (the race number stays).
export function liveryColors(carId, liveryId) {
  const car = CARS[carId] || CARS.falke;
  const l = LIVERIES.find((x) => x.id === liveryId);
  return { ...car.livery, ...(l && l.colors ? l.colors : {}) };
}

// Physics overrides for a car with the player's tuning (base = TUNING merged with the car's own tuning).
export function tunedOverrides(p, carId, base) {
  const car = CARS[carId] || CARS.falke;
  const t = { ...base, ...car.tuning };
  let out = { ...car.tuning };
  for (const [part, u] of Object.entries(UPGRADES)) {
    const level = p ? upgradeLevel(p, carId, part) : 0;
    if (level > 0) out = { ...out, ...u.effect(t, level) };
  }
  return out;
}
