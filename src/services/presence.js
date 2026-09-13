import { db } from '../db/index.js';
import { hub } from '../ws/hub.js';

export function getPresence(userId) {
  const user = db.prepare('SELECT id, last_seen, is_active FROM users WHERE id = ?').get(userId);
  if (!user) return { status: 'unknown' };
  if (!user.is_active) return { status: 'inactive' };
  if (hub.isOnline(userId)) return { status: 'online', last_seen: Date.now() };
  return { status: 'offline', last_seen: user.last_seen };
}

export function touchPresence(userId) {
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), userId);
}