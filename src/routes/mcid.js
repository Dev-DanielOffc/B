import { authenticate } from '../middleware/auth.js';
import { reserveMcid, getMcidInfo, getRegistryStats } from '../services/mcid.js';

export default async function mcidRoutes(fastify) {
  fastify.post('/reserve', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const result = reserveMcid();
      return reply.send(result);
    } catch (err) {
      return reply.code(500).send({ error: 'Error generando MCID' });
    }
  });

  fastify.get('/info/:mcid', { preHandler: [authenticate] }, async (request, reply) => {
    const info = getMcidInfo(request.params.mcid);
    if (!info) {
      return reply.code(404).send({ error: 'MCID no encontrado' });
    }
    return reply.send({ mcid: info });
  });

  fastify.get('/stats', { preHandler: [authenticate] }, async (request, reply) => {
    return reply.send(getRegistryStats());
  });
}