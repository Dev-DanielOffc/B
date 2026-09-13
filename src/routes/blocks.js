import { db } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import { blockUser, isBlocked, getBlockList } from '../services/blocks.js';

export default async function blocksRoutes(fastify) {
  fastify.post('/:mcid', { preHandler: [authenticate] }, async (request, reply) => {
    const target = db.prepare('SELECT id FROM users WHERE mcid = ? AND is_active = 1').get(request.params.mcid);
    if (!target) {
      return reply.code(404).send({ error: 'Usuario no encontrado' });
    }
    if (target.id === request.userId) {
      return reply.code(400).send({ error: 'No puedes bloquearte a ti mismo' });
    }
    try {
      db.prepare('INSERT OR IGNORE INTO contacts (user_id, contact_id, alias, added_at) VALUES (?, ?, ?, ?)')
        .run(request.userId, target.id, '__blocked__', Date.now());
      return reply.send({ ok: true });
    } catch (err) {
      return reply.code(500).send({ error: 'Error bloqueando usuario' });
    }
  });

  fastify.delete('/:mcid', { preHandler: [authenticate] }, async (request, reply) => {
    const target = db.prepare('SELECT id FROM users WHERE mcid = ?').get(request.params.mcid);
    if (!target) {
      return reply.code(404).send({ error: 'Usuario no encontrado' });
    }
    db.prepare("DELETE FROM contacts WHERE user_id = ? AND contact_id = ? AND alias = '__blocked__'")
      .run(request.userId, target.id);
    return reply.send({ ok: true });
  });

  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const list = getBlockList(request.userId);
    return reply.send({ blocked: list });
  });

  fastify.get('/check/:mcid', { preHandler: [authenticate] }, async (request, reply) => {
    const target = db.prepare('SELECT id FROM users WHERE mcid = ?').get(request.params.mcid);
    if (!target) {
      return reply.code(404).send({ error: 'Usuario no encontrado' });
    }
    return reply.send({ blocked: isBlocked(request.userId, target.id) });
  });
}