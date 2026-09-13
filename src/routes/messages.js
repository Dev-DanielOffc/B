import { db } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import { generateMessageId } from '../utils/ids.js';
import { hub } from '../ws/hub.js';

const MESSAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export default async function messagesRoutes(fastify) {
  fastify.post('/send', { preHandler: [authenticate] }, async (request, reply) => {
    const { to_mcid, encrypted_blob, message_type, metadata, temp_id } = request.body || {};

    if (!to_mcid || !encrypted_blob) {
      return reply.code(400).send({ error: 'Faltan campos obligatorios' });
    }

    if (typeof encrypted_blob !== 'string' || encrypted_blob.length > 100000) {
      return reply.code(400).send({ error: 'Payload invalido' });
    }

    const sender = db.prepare('SELECT id, mcid FROM users WHERE id = ?').get(request.userId);
    if (!sender) {
      return reply.code(404).send({ error: 'Emisor no encontrado' });
    }

    const receiver = db.prepare('SELECT id, mcid FROM users WHERE mcid = ? AND is_active = 1').get(to_mcid);
    if (!receiver) {
      return reply.code(404).send({ error: 'Destinatario no encontrado' });
    }

    if (receiver.id === sender.id) {
      return reply.code(400).send({ error: 'No puedes enviarte mensajes a ti mismo' });
    }

    const chatId = [sender.mcid, receiver.mcid].sort().join(':');
    const messageId = generateMessageId();
    const now = Date.now();
    const expiresAt = now + MESSAGE_TTL_MS;

    const metaJson = metadata ? JSON.stringify(metadata) : null;

    db.prepare(
      `INSERT INTO pending_messages
       (id, chat_id, from_user, to_user, encrypted_blob, message_type, metadata, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      messageId,
      chatId,
      sender.id,
      receiver.id,
      encrypted_blob,
      message_type || 'text',
      metaJson,
      now,
      expiresAt
    );

    const delivered = hub.sendToUser(receiver.id, {
      type: 'message',
      id: messageId,
      chat_id: chatId,
      from: sender.mcid,
      to: receiver.mcid,
      encrypted_blob,
      message_type: message_type || 'text',
      metadata: metadata || null,
      created_at: now,
      temp_id: temp_id || null
    });

    if (delivered) {
      db.prepare('DELETE FROM pending_messages WHERE id = ?').run(messageId);
    }

    return reply.code(201).send({
      id: messageId,
      chat_id: chatId,
      from: sender.mcid,
      to: receiver.mcid,
      status: delivered ? 'delivered' : 'sent',
      created_at: now,
      temp_id: temp_id || null
    });
  });

  fastify.get('/pending', { preHandler: [authenticate] }, async (request, reply) => {
    const now = Date.now();
    const rows = db
      .prepare(
        `SELECT pm.id, pm.chat_id, pm.encrypted_blob, pm.message_type, pm.metadata, pm.created_at,
                u.mcid as from_mcid, u.display_name as from_display_name, u.avatar_url as from_avatar
         FROM pending_messages pm
         JOIN users u ON u.id = pm.from_user
         WHERE pm.to_user = ? AND pm.expires_at > ?
         ORDER BY pm.created_at ASC
         LIMIT 500`
      )
      .all(request.userId, now);

    const messages = rows.map((row) => ({
      id: row.id,
      chat_id: row.chat_id,
      from: row.from_mcid,
      from_display_name: row.from_display_name,
      from_avatar: row.from_avatar,
      encrypted_blob: row.encrypted_blob,
      message_type: row.message_type,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      created_at: row.created_at
    }));

    return reply.send({ messages });
  });

  fastify.post('/ack', { preHandler: [authenticate] }, async (request, reply) => {
    const { message_ids } = request.body || {};
    if (!Array.isArray(message_ids) || message_ids.length === 0) {
      return reply.code(400).send({ error: 'message_ids requerido' });
    }

    const deleteStmt = db.prepare('DELETE FROM pending_messages WHERE id = ? AND to_user = ?');
    const deleteMany = db.transaction((ids) => {
      let count = 0;
      for (const id of ids) {
        const result = deleteStmt.run(id, request.userId);
        count += result.changes;
      }
      return count;
    });

    const deleted = deleteMany(message_ids);
    return reply.send({ deleted });
  });

  fastify.delete('/:messageId', { preHandler: [authenticate] }, async (request, reply) => {
    const result = db
      .prepare('DELETE FROM pending_messages WHERE id = ? AND from_user = ?')
      .run(request.params.messageId, request.userId);

    if (result.changes === 0) {
      return reply.code(404).send({ error: 'Mensaje no encontrado' });
    }

    return reply.send({ ok: true });
  });

  fastify.post('/receipt', { preHandler: [authenticate] }, async (request, reply) => {
    const { to_mcid, message_id, receipt_type } = request.body || {};
    if (!to_mcid || !message_id || !receipt_type) {
      return reply.code(400).send({ error: 'Faltan campos' });
    }
    if (!['delivered', 'read'].includes(receipt_type)) {
      return reply.code(400).send({ error: 'receipt_type invalido' });
    }

    const sender = db.prepare('SELECT id, mcid FROM users WHERE id = ?').get(request.userId);
    const receiver = db.prepare('SELECT id, mcid FROM users WHERE mcid = ?').get(to_mcid);
    if (!sender || !receiver) {
      return reply.code(404).send({ error: 'Usuario no encontrado' });
    }

    hub.sendToUser(receiver.id, {
      type: 'receipt',
      from: sender.mcid,
      message_id,
      receipt_type,
      created_at: Date.now()
    });

    return reply.send({ ok: true });
  });
}