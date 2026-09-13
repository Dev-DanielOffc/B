import { authenticate } from '../middleware/auth.js';
import { getPresence, touchPresence } from '../services/presence.js';

export default async function presenceRoutes(fastify) {
  fastify.get('/:mcid', { preHandler: [authenticate] }, async (request, reply) => {
    const { db } = await import('../db/index.js');
    const user = db.prepare('SELECT id FROM users WHERE mcid = ?').get(request.params.mcid);
    if (!user) {
      return reply.code(404).send({ error: 'Usuario no encontrado' });
    }
    return reply.send(getPresence(user.id));
  });

  fastify.post('/touch', { preHandler: [authenticate] }, async (request, reply) => {
    touchPresence(request.userId);
    return reply.send({ ok: true });
  });
}