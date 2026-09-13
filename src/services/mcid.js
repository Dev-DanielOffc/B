import { db } from '../db/index.js';
import { nanoidShort, generateRandomUpper } from '../utils/ids.js';

const MCID_DOMAIN = 'mcid.do';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const BASE_AMOUNT = 10;

function getGenerationAmount(index) {
  return BASE_AMOUNT * Math.pow(2, index);
}

function getCurrentLetter() {
  const rows = db
    .prepare(
      `SELECT letter, COUNT(*) as total
       FROM mcid_registry
       GROUP BY letter
       ORDER BY letter ASC`
    )
    .all();

  if (rows.length === 0) {
    return { letter: LETTERS[0], index: 0, used: 0, capacity: getGenerationAmount(0) };
  }

  const usedByLetter = {};
  for (const row of rows) {
    usedByLetter[row.letter] = row.total;
  }

  for (let i = 0; i < LETTERS.length; i++) {
    const letter = LETTERS[i];
    const capacity = getGenerationAmount(i);
    const used = usedByLetter[letter] || 0;
    if (used < capacity) {
      return { letter, index: i, used, capacity };
    }
  }

  return { letter: null, index: LETTERS.length, used: 0, capacity: 0 };
}

function existsInDb(mcid) {
  const row = db.prepare('SELECT id FROM mcid_registry WHERE mcid = ?').get(mcid);
  return !!row;
}

export function generateMcid() {
  const current = getCurrentLetter();

  if (current.letter) {
    let attempts = 0;
    while (attempts < 100) {
      const suffix = generateRandomUpper(4);
      const mcid = `${current.letter}${suffix}@${MCID_DOMAIN}`;
      if (!existsInDb(mcid)) {
        return {
          mcid,
          letter: current.letter,
          generation: current.index + 1
        };
      }
      attempts++;
    }
    throw new Error('MCID_GENERATION_FAILED');
  }

  let attempts = 0;
  while (attempts < 100) {
    const random = nanoidShort().toUpperCase().slice(0, 5);
    const mcid = `${random}@${MCID_DOMAIN}`;
    if (!existsInDb(mcid)) {
      return {
        mcid,
        letter: null,
        generation: LETTERS.length + 1
      };
    }
    attempts++;
  }
  throw new Error('MCID_GENERATION_FAILED');
}

export function reserveMcid() {
  const result = generateMcid();
  const id = nanoidShort();
  const now = Date.now();
  db.prepare(
    'INSERT INTO mcid_registry (id, mcid, letter, generation, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, result.mcid, result.letter || '', result.generation, now);
  return { id, ...result };
}

export function assignMcid(mcidId, userId) {
  const result = db
    .prepare('UPDATE mcid_registry SET user_id = ? WHERE id = ? AND user_id IS NULL')
    .run(userId, mcidId);
  return result.changes > 0;
}

export function getMcidInfo(mcid) {
  const row = db.prepare('SELECT * FROM mcid_registry WHERE mcid = ?').get(mcid);
  return row || null;
}

export function getRegistryStats() {
  const total = db.prepare('SELECT COUNT(*) as total FROM mcid_registry').get();
  const byLetter = db
    .prepare(
      `SELECT letter, COUNT(*) as total
       FROM mcid_registry
       GROUP BY letter
       ORDER BY letter ASC`
    )
    .all();
  return {
    total: total.total,
    byLetter
  };
}