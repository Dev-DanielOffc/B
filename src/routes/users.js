import fs from 'fs';
import path from 'path';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { authenticate } from '../middleware/auth.js';
import { generateFileId, nanoidShort } from '../utils/ids.js';

const ALLOWED_AVATAR_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_AVATAR_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

export default async function usersRoutes(fastify) {
  fastify.get('/search/:query', { preHandler: [authenticate] }, async (request, reply) => {
    const q = String(request.params.query || '').trim();
    if (!q || q.length < 2) {
      return reply.code(400).send({ error: 'Busqueda muy corta' });
    }

    const like = `%${q}%`;
    const rows = db
      .prepare(
        `SELECT id, mcid, virtual_number, username, display_name, avatar_url, bio, last_seen
         FROM users
         WHERE is_active = 1
           AND id != ?
           AND (username LIKE ? OR mcid LIKE ? OR display_name LIKE ? OR virtual_number LIKE ?)
         LIMIT 25`
      )
      .all(request.userId, like, like, like, like);

    return reply.send({ results: rows });
  });

  fastify.get('/profile/:mcid', { preHandler: [authenticate] }, async (request, reply) => {
    const user = db
      .prepare(
        `SELECT id, mcid, virtual_number, country_code, username, display_name, avatar_url, bio, created_at, last_seen
         FROM users WHERE mcid = ? AND is_active = 1`
      )
      .get(request.params.mcid);

    if (!user) {
      return reply.code(404).send({ error: 'Usuario no encontrado' });
    }

    return reply.send({ user });
  });

  fastify.patch('/me', { preHandler: [authenticate] }, async (request, reply) => {
    const { display_name, bio } = request.body || {};
    const updates = [];
    const values = [];

    if (typeof display_name === 'string') {
      const trimmed = display_name.trim();
      if (trimmed.length === 0 || trimmed.length > 50) {
        return reply.code(400).send({ error: 'Nombre invalido (1-50 caracteres)' });
      }
      updates.push('display_name = ?');
      values.push(trimmed);
    }

    if (typeof bio === 'string') {
      const trimmed = bio.trim();
      if (trimmed.length > 200) {
        return reply.code(400).send({ error: 'Bio muy larga (max 200)' });
      }
      updates.push('bio = ?');
      values.push(trimmed);
    }

    if (updates.length === 0) {
      return reply.code(400).send({ error: 'Nada que actualizar' });
    }

    values.push(request.userId);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const user = db
      .prepare(
        'SELECT id, mcid, virtual_number, country_code, username, display_name, avatar_url, bio FROM users WHERE id = ?'
      )
      .get(request.userId);

    return reply.send({ user });
  });

  fastify.post('/me/avatar', { preHandler: [authenticate] }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No se envio archivo' });
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

    const tx = db.transaction(() => {
      db.prepare(
        'INSERT INTO files (id, uploader_id, filename, original_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(fileId, request.userId, filename, data.filename || filename, data.mimetype, stats.size, now);

      db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, request.userId);
    });

    tx();

    return reply.send({ avatar_url: avatarUrl });
  });

  fastify.delete('/me/avatar', { preHandler: [authenticate] }, async (request, reply) => {
    const user = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(request.userId);
    if (!user || !user.avatar_url) {
      return reply.code(404).send({ error: 'No tienes avatar' });
    }

    const relPath = user.avatar_url.replace(/^\/u\//, '');
    const fullPath = path.join(config.uploads.dir, relPath);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (err) {
        return reply.code(500).send({ error: 'Error eliminando archivo' });
      }
    }

    db.prepare('UPDATE users SET avatar_url = NULL WHERE id = ?').run(request.userId);
    return reply.send({ ok: true });
  });

  fastify.get('/me/keys', { preHandler: [authenticate] }, async (request, reply) => {
    const user = db
      .prepare('SELECT identity_key, signed_prekey, signed_prekey_signature, registration_id FROM users WHERE id = ?')
      .get(request.userId);

    if (!user) {
      return reply.code(404).send({ error: 'Usuario no encontrado' });
    }

    return reply.send({ keys: user });
  });

  fastify.get('/:mcid/keys', { preHandler: [authenticate] }, async (request, reply) => {
    const user = db
      .prepare(
        'SELECT id, identity_key, signed_prekey, signed_prekey_signature, registration_id FROM users WHERE mcid = ? AND is_active = 1'
      )
      .get(request.params.mcid);

    if (!user) {
      return reply.code(404).send({ error: 'Usuario no encontrado' });
    }

    const prekeys = db
      .prepare('SELECT key_id, public_key FROM one_time_prekeys WHERE user_id = ? AND used = 0 ORDER BY created_at ASC LIMIT 1')
      .all(user.id);

    let oneTimePrekey = null;
    if (prekeys.length > 0) {
      oneTimePrekey = prekeys[0];
      db.prepare('UPDATE one_time_prekeys SET used = 1 WHERE user_id = ? AND key_id = ?').run(
        user.id,
        oneTimePrekey.key_id
      );
    }

    return reply.send({
      user_id: user.id,
      identity_key: user.identity_key,
      signed_prekey: user.signed_prekey,
      signed_prekey_signature: user.signed_prekey_signature,
      registration_id: user.registration_id,
      one_time_prekey: oneTimePrekey
    });
  });
}