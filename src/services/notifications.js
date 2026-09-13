import { db } from '../db/index.js';
import { hub } from '../ws/hub.js';

export function notifyUser(userId, payload) {
  return hub.sendToUser(userId, {
    ...payload,
    notification_at: Date.now()
  });
}

export function notifyNewMessage(userId, message) {
  return notifyUser(userId, {
    type: 'new_message',
    message
  });
}

export function notifyReceipt(userId, receipt) {
  return notifyUser(userId, {
    type: 'receipt_update',
    receipt
  });
}

export function notifyTyping(userId, fromMcid, state) {
  return notifyUser(userId, {
    type: 'typing',
    from: fromMcid,
    state
  });
}

export function getUnreadCount(userId) {
  const row = db
    .prepare('SELECT COUNT(*) as total FROM pending_messages WHERE to_user = ? AND expires_at > ?')
    .get(userId, Date.now());
  return row ? row.total : 0;
}