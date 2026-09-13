import { authenticate } from '../middleware/auth.js';
import { getSupportedCountries, reserveVirtualNumber, getNumberInfo } from '../services/numbers.js';

export default async function numbersRoutes(fastify) {
  fastify.get('/countries', async (request, reply) => {
    return reply.send({ countries: getSupportedCountries() });
  });

  fastify.post('/reserve', { preHandler: [authenticate] }, async (request, reply) => {
    const { country_code } = request.body || {};
    if (!country_code) {
      return reply.code(400).send({ error: 'Falta country_code' });
    }
    try {
      const result = reserveVirtualNumber(country_code);
      return reply.send(result);
    } catch (err) {
      if (err.message === 'COUNTRY_NOT_SUPPORTED') {
        return reply.code(400).send({ error: 'Pais no soportado' });
      }
      return reply.code(500).send({ error: 'Error generando numero' });
    }
  });

  fastify.get('/info/:number', { preHandler: [authenticate] }, async (request, reply) => {
    const info = getNumberInfo(request.params.number);
    if (!info) {
      return reply.code(404).send({ error: 'Numero no encontrado' });
    }
    return reply.send({ number: info });
  });
}