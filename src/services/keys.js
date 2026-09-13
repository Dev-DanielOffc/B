import { db } from '../db/index.js';
import { nanoidShort } from '../utils/ids.js';

const MAX_PREKEYS_PER_USER = 100;

export function uploadPrekeys(userId, prekeys) {
  if (!Array.isArray(prekeys) || prekeys.length === 0) {
    throw new Error('PREKEYS_REQUIRED');
  }

  const currentCount = db
    .prepare('SELECT COUNT(*) as total FROM one_time_prekeys WHERE user_id = ? AND used = 0')
    .get(userId).total;

  if (currentCount + prekeys.length > MAX_PREKEYS_PER_USER) {
    throw new Error('TOO_MANY_PREKEYS');
  }

  const now = Date.now();
  const insert = db.prepare(
    'INSERT INTO one_time_prekeys (id, user_id, key_id, public_key, used, created_at) VALUES (?, ?, ?, ?, 0, ?)'
  );

  const tx = db.transaction(() => {
    for (const prekey of prekeys) {
      if (!prekey.key_id || !prekey.public_key) continue;
      const id = 'pk_' + nanoidShort();
      insert.run(id, userId, prekey.key_id, prekey.public_key, now);
    }
  });

  tx();
}

export function countAvailablePrekeys(userId) {
  return db
    .prepare('SELECT COUNT(*) as total FROM one_time_prekeys WHERE user_id = ? AND used = 0')
    .get(userId).total;
}

export function consumePrekey(userId) {
  const prekey = db
    .prepare(
      'SELECT id, key_id, public_key FROM one_time_prekeys WHERE user_id = ? AND used = 0 ORDER BY created_at ASC LIMIT 1'
    )
    .get(userId);

  if (!prekey) return null;

  db.prepare('UPDATE one_time_prekeys SET used = 1 WHERE id = ?').run(prekey.id);
  return { key_id: prekey.key_id, public_key: prekey.public_key };
}

export function cleanUsedPrekeys(olderThanMs) {
  const threshold = Date.now() - olderThanMs;
  const result = db
    .prepare('DELETE FROM one_time_prekeys WHERE used = 1 AND created_at < ?')
    .run(threshold);
  return result.changes;
}