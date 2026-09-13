import { db } from '../db/index.js';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

let cleanupTimer = null;

function runCleanup() {
  const now = Date.now();
  try {
    const expiredMessages = db.prepare('DELETE FROM pending_messages WHERE expires_at <= ?').run(now);
    const expiredSessions = db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    const expiredPending = db.prepare('DELETE FROM pending_registrations WHERE expires_at <= ?').run(now);

    if (expiredMessages.changes > 0) console.log(`Cleanup: ${expiredMessages.changes} mensajes expirados`);
    if (expiredSessions.changes > 0) console.log(`Cleanup: ${expiredSessions.changes} sesiones expiradas`);
    if (expiredPending.changes > 0) console.log(`Cleanup: ${expiredPending.changes} registros pendientes expirados`);
  } catch (err) {
    console.error('Error en cleanup:', err.message);
  }
}

export function startCleanup() {
  if (cleanupTimer) return;
  runCleanup();
  cleanupTimer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  if (cleanupTimer.unref) cleanupTimer.unref();
}

export function stopCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}