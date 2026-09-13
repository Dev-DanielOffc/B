import { db } from '../db/index.js';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

let cleanupTimer = null;

function runCleanup() {
  const now = Date.now();
  try {
    const result = db.prepare('DELETE FROM pending_messages WHERE expires_at <= ?').run(now);
    if (result.changes > 0) {
      console.log(`Cleanup: ${result.changes} mensajes expirados eliminados`);
    }

    const expiredSessions = db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    if (expiredSessions.changes > 0) {
      console.log(`Cleanup: ${expiredSessions.changes} sesiones expiradas eliminadas`);
    }
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