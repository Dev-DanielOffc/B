import { authenticate } from '../middleware/auth.js';
import { saveTempFile, isAllowedMime } from '../services/storage.js';

export default async function uploadRoutes(fastify) {
  fastify.post('/temp', { preHandler: [authenticate] }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No se envio archivo' });
    }

    if (!isAllowedMime(data.mimetype)) {
      return reply.code(400).send({ error: 'Tipo de archivo no permitido' });
    }

    try {
      const result = await saveTempFile(data.file, data.filename, data.mimetype, request.userId);
      return reply.send(result);
    } catch (err) {
      return reply.code(500).send({ error: 'Error guardando archivo' });
    }
  });
}