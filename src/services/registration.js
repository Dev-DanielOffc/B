import { db } from '../db/index.js';
import { nanoidShort } from '../utils/ids.js';

const PENDING_TTL_MS = 30 * 60 * 1000;

export function createPendingRegistration(number, countryCode, pinHash, avatarUrl) {
  const id = nanoidShort();
  const now = Date.now();
  const expiresAt = now + PENDING_TTL_MS;

  db.prepare(
    'INSERT INTO pending_registrations (id, number, country_code, pin_hash, avatar_url, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, number, countryCode, pinHash || null, avatarUrl || null, now, expiresAt);

  return { id, number, country_code: countryCode, expires_at: expiresAt };
}

export function getPendingRegistration(id) {
  const now = Date.now();
  return db
    .prepare('SELECT * FROM pending_registrations WHERE id = ? AND expires_at > ?')
    .get(id, now);
}

export function getPendingRegistrationByNumber(number) {
  const now = Date.now();
  return db
    .prepare('SELECT * FROM pending_registrations WHERE number = ? AND expires_at > ?')
    .get(number, now);
}

export function updatePendingPin(id, pinHash) {
  db.prepare('UPDATE pending_registrations SET pin_hash = ? WHERE id = ?').run(pinHash, id);
}

export function updatePendingAvatar(id, avatarUrl) {
  db.prepare('UPDATE pending_registrations SET avatar_url = ? WHERE id = ?').run(avatarUrl, id);
}

export function deletePendingRegistration(id) {
  db.prepare('DELETE FROM pending_registrations WHERE id = ?').run(id);
}

export function cleanupExpiredPending() {
  const now = Date.now();
  const result = db.prepare('DELETE FROM pending_registrations WHERE expires_at <= ?').run(now);
  return result.changes;
}

export function findNumberInVirtualNumbers(number) {
  return db.prepare('SELECT * FROM virtual_numbers WHERE number = ?').get(number) || null;
}