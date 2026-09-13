import { db } from '../db/index.js';

export function blockUser(userId, targetUserId) {
  if (userId === targetUserId) {
    throw new Error('CANNOT_BLOCK_SELF');
  }
  db.prepare(
    'INSERT OR IGNORE INTO contacts (user_id, contact_id, alias, added_at) VALUES (?, ?, ?, ?)'
  ).run(userId, targetUserId, null, Date.now());
}

export function isBlocked(userId, targetUserId) {
  const row = db
    .prepare("SELECT user_id FROM contacts WHERE user_id = ? AND contact_id = ? AND alias = '__blocked__'")
    .get(userId, targetUserId);
  return !!row;
}

export function getBlockList(userId) {
  return db
    .prepare(
      `SELECT c.contact_id, u.mcid, u.display_name, u.avatar_url
       FROM contacts c
       JOIN users u ON u.id = c.contact_id
       WHERE c.user_id = ? AND c.alias = '__blocked__'`
    )
    .all(userId);
}