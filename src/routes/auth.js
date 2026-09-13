import { db } from '../db/index.js';
import { hashPassword, verifyPassword, generateToken, hashToken } from '../utils/crypto.js';
import { generateUserId, generateSessionId } from '../utils/ids.js';
import { reserveVirtualNumber, assignVirtualNumber } from '../services/numbers.js';
import { reserveMcid, assignMcid } from '../services/mcid.js';
import { authenticate } from '../middleware/auth.js';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export default async function authRoutes(fastify) {
  fastify.post('/register', async (request, reply) => {
    const {
      country_code,
      username,
      password,
      display_name,
      identity_key,
      signed_prekey,
      signed_prekey_signature,
      registration_id,
      one_time_prekeys
    } = request.body || {};

    if (!country_code || !username || !password) {
      return reply.code(400).send({ error: 'Faltan campos obligatorios' });
    }
    if (typeof username !== 'string' || username.length < 3 || username.length > 20) {
      return reply.code(400).send({ error: 'Username debe tener entre 3 y 20 caracteres' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return reply.code(400).send({ error: 'Username solo permite letras, numeros y guion bajo' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return reply.code(400).send({ error: 'Password debe tener al menos 6 caracteres' });
    }
    if (!identity_key || !signed_prekey || !signed_prekey_signature || !registration_id) {
      return reply.code(400).send({ error: 'Faltan claves de cifrado' });
    }
    if (!Array.isArray(one_time_prekeys) || one_time_prekeys.length === 0) {
      return reply.code(400).send({ error: 'Se requieren one-time prekeys' });
    }

    const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUsername) {
      return reply.code(409).send({ error: 'Username ya registrado' });
    }

    let numberReservation;
    let mcidReservation;
    try {
      numberReservation = reserveVirtualNumber(country_code);
      mcidReservation = reserveMcid();
    } catch (err) {
      if (numberReservation) {
        db.prepare('DELETE FROM virtual_numbers WHERE id = ?').run(numberReservation.id);
      }
      return reply.code(500).send({ error: 'Error generando identificadores: ' + err.message });
    }

    const userId = generateUserId();
    const now = Date.now();
    const passwordHash = await hashPassword(password);
    const finalDisplayName = display_name && display_name.trim() ? display_name.trim() : username;

    const insertUser = db.transaction(() => {
      db.prepare(
        `INSERT INTO users (
          id, mcid, virtual_number, country_code, username, display_name,
          password_hash, identity_key, signed_prekey, signed_prekey_signature,
          registration_id, created_at, last_seen, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      ).run(
        userId,
        mcidReservation.mcid,
        numberReservation.number,
        country_code,
        username,
        finalDisplayName,
        passwordHash,
        identity_key,
        signed_prekey,
        signed_prekey_signature,
        registration_id,
        now,
        now
      );

      assignVirtualNumber(numberReservation.id, userId);
      assignMcid(mcidReservation.id, userId);

      const insertPrekey = db.prepare(
        'INSERT INTO one_time_prekeys (id, user_id, key_id, public_key, used, created_at) VALUES (?, ?, ?, ?, 0, ?)'
      );
      for (const prekey of one_time_prekeys) {
        if (!prekey.key_id || !prekey.public_key) continue;
        const prekeyId = 'pk_' + Math.random().toString(36).slice(2, 18);
        insertPrekey.run(prekeyId, userId, prekey.key_id, prekey.public_key, now);
      }
    });

    try {
      insertUser();
    } catch (err) {
      db.prepare('DELETE FROM virtual_numbers WHERE id = ?').run(numberReservation.id);
      db.prepare('DELETE FROM mcid_registry WHERE id = ?').run(mcidReservation.id);
      return reply.code(500).send({ error: 'Error creando usuario: ' + err.message });
    }

    const sessionToken = generateToken(32);
    const sessionId = generateSessionId();
    const expiresAt = now + SESSION_DURATION_MS;

    db.prepare(
      'INSERT INTO sessions (id, user_id, token_hash, device_info, ip_address, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      sessionId,
      userId,
      hashToken(sessionToken),
      request.headers['user-agent'] || null,
      request.ip || null,
      now,
      expiresAt
    );

    const jwtToken = fastify.jwt.sign({ id: userId, sid: sessionId });

    return reply.code(201).send({
      user: {
        id: userId,
        mcid: mcidReservation.mcid,
        virtual_number: numberReservation.number,
        country_code,
        username,
        display_name: finalDisplayName,
        avatar_url: null,
        bio: null
      },
      token: jwtToken,
      session_token: sessionToken,
      expires_at: expiresAt
    });
  });

  fastify.post('/login', async (request, reply) => {
    const { username, password } = request.body || {};

    if (!username || !password) {
      return reply.code(400).send({ error: 'Faltan credenciales' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return reply.code(401).send({ error: 'Credenciales invalidas' });
    }
    if (!user.is_active) {
      return reply.code(403).send({ error: 'Cuenta desactivada' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return reply.code(401).send({ error: 'Credenciales invalidas' });
    }

    const now = Date.now();
    const sessionToken = generateToken(32);
    const sessionId = generateSessionId();
    const expiresAt = now + SESSION_DURATION_MS;

    db.prepare(
      'INSERT INTO sessions (id, user_id, token_hash, device_info, ip_address, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      sessionId,
      user.id,
      hashToken(sessionToken),
      request.headers['user-agent'] || null,
      request.ip || null,
      now,
      expiresAt
    );

    db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(now, user.id);

    const jwtToken = fastify.jwt.sign({ id: user.id, sid: sessionId });

    return reply.send({
      user: {
        id: user.id,
        mcid: user.mcid,
        virtual_number: user.virtual_number,
        country_code: user.country_code,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        bio: user.bio
      },
      token: jwtToken,
      session_token: sessionToken,
      expires_at: expiresAt
    });
  });

  fastify.post('/logout', { preHandler: [authenticate] }, async (request, reply) => {
    const sessionId = request.user.sid;
    if (sessionId) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    }
    return reply.send({ ok: true });
  });

  fastify.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = db
      .prepare(
        'SELECT id, mcid, virtual_number, country_code, username, display_name, avatar_url, bio, created_at, last_seen FROM users WHERE id = ?'
      )
      .get(request.userId);

    if (!user) {
      return reply.code(404).send({ error: 'Usuario no encontrado' });
    }

    return reply.send({ user });
  });
}