import { db } from '../db/index.js';
import { buildChatId } from '../utils/format.js';

export function getOrCreateChat(mcidA, mcidB) {
  const chatId = buildChatId(mcidA, mcidB);
  return { chat_id: chatId };
}

export function getChatHistory(userId, otherUserId, limit = 50, before = null) {
  const user = db.prepare('SELECT mcid FROM users WHERE id = ?').get(userId);
  const other = db.prepare('SELECT mcid FROM users WHERE id = ?').get(otherUserId);
  if (!user || !other) return [];

  const chatId = buildChatId(user.mcid, other.mcid);

  let query = `
    SELECT pm.id, pm.chat_id, pm.encrypted_blob, pm.message_type, pm.metadata, pm.created_at,
           u.mcid as from_mcid, u.display_name as from_display_name, u.avatar_url as from_avatar
    FROM pending_messages pm
    JOIN users u ON u.id = pm.from_user
    WHERE pm.chat_id = ? AND (pm.from_user = ? OR pm.to_user = ?)
  `;
  const params = [chatId, userId, userId];

  if (before) {
    query += ' AND pm.created_at < ?';
    params.push(before);
  }

  query += ' ORDER BY pm.created_at DESC LIMIT ?';
  params.push(limit);

  return db.prepare(query).all(...params);
}

export function listUserChats(userId, limit = 50) {
  const rows = db
    .prepare(
      `SELECT pm.chat_id,
              MAX(pm.created_at) as last_message_at,
              COUNT(*) as total_messages
       FROM pending_messages pm
       WHERE pm.from_user = ? OR pm.to_user = ?
       GROUP BY pm.chat_id
       ORDER BY last_message_at DESC
       LIMIT ?`
    )
    .all(userId, userId, limit);

  return rows;
}

export function getChatParticipants(chatId) {
  const parts = chatId.split(':');
  if (parts.length !== 2) return null;

  const a = db.prepare('SELECT id, mcid, display_name, avatar_url, last_seen FROM users WHERE mcid = ?').get(parts[0]);
  const b = db.prepare('SELECT id, mcid, display_name, avatar_url, last_seen FROM users WHERE mcid = ?').get(parts[1]);

  if (!a || !b) return null;
  return { a, b };
}