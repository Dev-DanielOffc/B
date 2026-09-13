import { authenticate } from '../middleware/auth.js';
import { uploadPrekeys, countAvailablePrekeys } from '../services/keys.js';

export default async function keysRoutes(fastify) {
  fastify.post('/prekeys', { preHandler: [authenticate] }, async (request, reply) => {
    const { prekeys } = request.body || {};
    try {
      uploadPrekeys(request.userId, prekeys);
      const remaining = countAvailablePrekeys(request.userId);
      return reply.send({ ok: true, remaining });
    } catch (err) {
      if (err.message === 'PREKEYS_REQUIRED') {
        return reply.code(400).send({ error: 'Se requieren prekeys' });
      }
      if (err.message === 'TOO_MANY_PREKEYS') {
        return reply.code(400).send({ error: 'Demasiadas prekeys' });
      }
      return reply.code(500).send({ error: 'Error guardando prekeys' });
    }
  });

  fastify.get('/prekeys/count', { preHandler: [authenticate] }, async (request, reply) => {
    const count = countAvailablePrekeys(request.userId);
    return reply.send({ count });
  });
}