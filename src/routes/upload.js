import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { authenticate } from '../middleware/auth.js';
import { saveTempFile, isAllowedMime } from '../services/storage.js';
import { generateFileId, nanoidShort } from '../utils/ids.js';
import { db } from '../db/index.js';
import { getPendingRegistration, updatePendingAvatar } from '../services/registration.js';

const ALLOWED_AVATAR_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_AVATAR_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

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

  fastify.post('/temp-avatar', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No se envio archivo' });
    }

    const tempId = data.fields && data.fields.temp_id ? data.fields.temp_id.value : null;
    if (!tempId) {
      return reply.code(400).send({ error: 'Falta temp_id' });
    }

    const pending = getPendingRegistration(tempId);
    if (!pending) {
      return reply.code(404).send({ error: 'Registro pendiente no encontrado o expirado' });
    }

    const ext = path.extname(data.filename || '').toLowerCase();
    if (!ALLOWED_AVATAR_EXTS.includes(ext)) {
      return reply.code(400).send({ error: 'Extension no permitida' });
    }
    if (!ALLOWED_AVATAR_MIMES.includes(data.mimetype)) {
      return reply.code(400).send({ error: 'Tipo MIME no permitido' });
    }

    const fileId = generateFileId();
    const filename = `${nanoidShort()}${ext}`;
    const destPath = path.join(config.uploads.avatarsDir, filename);

    await new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(destPath);
      data.file.pipe(stream);
      data.file.on('end', resolve);
      stream.on('error', reject);
    });

    const stats = fs.statSync(destPath);
    const now = Date.now();
    const avatarUrl = `/u/avatars/${filename}`;

    db.prepare(
      'INSERT INTO files (id, uploader_id, filename, original_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(fileId, null, filename, data.filename || filename, data.mimetype, stats.size, now);

    updatePendingAvatar(tempId, avatarUrl);

    return reply.send({ avatar_url: avatarUrl });
  });
}