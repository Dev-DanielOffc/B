import { db } from '../db/index.js';
import { hashPassword, verifyPassword, generateToken, hashToken, hashPin, verifyPin } from '../utils/crypto.js';
import { generateUserId, generateSessionId } from '../utils/ids.js';
import { reserveVirtualNumber, assignVirtualNumber } from '../services/numbers.js';
import { reserveMcid, assignMcid } from '../services/mcid.js';
import { authenticate } from '../middleware/auth.js';
import {
  createPendingRegistration,
  getPendingRegistration,
  getPendingRegistrationByNumber,
  updatePendingPin,
  deletePendingRegistration,
  findNumberInVirtualNumbers
} from '../services/registration.js';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function createSession(fastify, request, userId) {
  const now = Date.now();
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

  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(now, userId);

  return {
    jwt: fastify.jwt.sign({ id: userId, sid: sessionId }),
    sessionToken,
    expiresAt
  };
}

export default async function authRoutes(fastify) {
  fastify.post('/request-number', async (request, reply) => {
    const { country_code } = request.body || {};
    if (!country_code) {
      return reply.code(400).send({ error: 'Falta country_code' });
    }

    let reservation;
    try {
      reservation = reserveVirtualNumber(country_code);
    } catch (err) {
      if (err.message === 'COUNTRY_NOT_SUPPORTED') {
        return reply.code(400).send({ error: 'Pais no soportado' });
      }
      return reply.code(500).send({ error: 'Error generando numero' });
    }

    const pending = createPendingRegistration(reservation.number, country_code, null, null);

    return reply.send({
      temp_id: pending.id,
      number: reservation.number,
      country_code,
      expires_at: pending.expires_at
    });
  });

  fastify.post('/set-temp-pin', async (request, reply) => {
    const { temp_id, pin } = request.body || {};
    if (!temp_id || !pin) {
      return reply.code(400).send({ error: 'Faltan campos' });
    }
    if (typeof pin !== 'string' || pin.length < 4 || pin.length > 6) {
      return reply.code(400).send({ error: 'PIN debe tener entre 4 y 6 digitos' });
    }
    if (!/^\d+$/.test(pin)) {
      return reply.code(400).send({ error: 'PIN solo permite numeros' });
    }

    const pending = getPendingRegistration(temp_id);
    if (!pending) {
      return reply.code(404).send({ error: 'Registro pendiente no encontrado o expirado' });
    }

    const pinHash = await hashPin(pin);
    updatePendingPin(temp_id, pinHash);

    return reply.send({ ok: true });
  });

  fastify.post('/check-number', async (request, reply) => {
    const { number } = request.body || {};
    if (!number) {
      return reply.code(400).send({ error: 'Falta number' });
    }

    const user = db.prepare('SELECT id, pin_hash FROM users WHERE virtual_number = ? AND is_active = 1').get(number);
    if (user) {
      return reply.send({
        exists: true,
        has_pin: !!user.pin_hash,
        user_id: user.id
      });
    }

    const pending = getPendingRegistrationByNumber(number);
    if (pending) {
      return reply.send({
        exists: false,
        pending: true,
        temp_id: pending.id,
        has_pin: !!pending.pin_hash
      });
    }

    return reply.send({ exists: false, pending: false });
  });

  fastify.post('/verify-pin', async (request, reply) => {
    const { number, pin } = request.body || {};
    if (!number || !pin) {
      return reply.code(400).send({ error: 'Faltan campos' });
    }

    const user = db.prepare('SELECT * FROM users WHERE virtual_number = ? AND is_active = 1').get(number);
    if (!user) {
      return reply.code(404).send({ error: 'Numero no registrado' });
    }
    if (!user.pin_hash) {
      return reply.code(400).send({ error: 'Este numero no tiene PIN configurado' });
    }

    const valid = await verifyPin(pin, user.pin_hash);
    if (!valid) {
      return reply.code(401).send({ error: 'PIN incorrecto' });
    }

    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

    const session = createSession(fastify, request, user.id);

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
      token: session.jwt,
      session_token: session.sessionToken,
      expires_at: session.expiresAt
    });
  });

  fastify.post('/complete-registration', async (request, reply) => {
    const {
      temp_id,
      username,
      password,
      display_name,
      avatar_url,
      identity_key,
      signed_prekey,
      signed_prekey_signature,
      registration_id,
      one_time_prekeys
    } = request.body || {};

    if (!temp_id || !username || !password || !display_name) {
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

    const pending = getPendingRegistration(temp_id);
    if (!pending) {
      return reply.code(404).send({ error: 'Registro pendiente no encontrado o expirado' });
    }
    if (!pending.pin_hash) {
      return reply.code(400).send({ error: 'Debes configurar un PIN primero' });
    }

    const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUsername) {
      return reply.code(409).send({ error: 'Username ya registrado' });
    }

    let mcidReservation;
    try {
      mcidReservation = reserveMcid();
    } catch (err) {
      return reply.code(500).send({ error: 'Error generando MCID' });
    }

    const userId = generateUserId();
    const now = Date.now();
    const passwordHash = await hashPassword(password);

    const finalAvatar = avatar_url || pending.avatar_url || null;

    const insertUser = db.transaction(() => {
      db.prepare(
        `INSERT INTO users (
          id, mcid, virtual_number, country_code, username, display_name, avatar_url,
          password_hash, pin_hash, pin_set_at, onboarding_completed,
          identity_key, signed_prekey, signed_prekey_signature, registration_id,
          created_at, last_seen, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 1)`
      ).run(
        userId,
        mcidReservation.mcid,
        pending.number,
        pending.country_code,
        username,
        display_name.trim(),
        finalAvatar,
        passwordHash,
        pending.pin_hash,
        now,
        identity_key,
        signed_prekey,
        signed_prekey_signature,
        registration_id,
        now,
        now
      );

      const numberRow = findNumberInVirtualNumbers(pending.number);
      if (numberRow) {
        db.prepare('UPDATE virtual_numbers SET assigned = 1, user_id = ?, assigned_at = ? WHERE id = ?')
          .run(userId, now, numberRow.id);
      }

      assignMcid(mcidReservation.id, userId);

      const insertPrekey = db.prepare(
        'INSERT INTO one_time_prekeys (id, user_id, key_id, public_key, used, created_at) VALUES (?, ?, ?, ?, 0, ?)'
      );
      for (const prekey of one_time_prekeys) {
        if (!prekey.key_id || !prekey.public_key) continue;
        const prekeyId = 'pk_' + Math.random().toString(36).slice(2, 18);
        insertPrekey.run(prekeyId, userId, prekey.key_id, prekey.public_key, now);
      }

      deletePendingRegistration(temp_id);
    });

    try {
      insertUser();
    } catch (err) {
      db.prepare('DELETE FROM mcid_registry WHERE id = ?').run(mcidReservation.id);
      return reply.code(500).send({ error: 'Error creando usuario: ' + err.message });
    }

    const session = createSession(fastify, request, userId);

    return reply.code(201).send({
      user: {
        id: userId,
        mcid: mcidReservation.mcid,
        virtual_number: pending.number,
        country_code: pending.country_code,
        username,
        display_name: display_name.trim(),
        avatar_url: finalAvatar,
        bio: null
      },
      token: session.jwt,
      session_token: session.sessionToken,
      expires_at: session.expiresAt
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

    const session = createSession(fastify, request, user.id);

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
      token: session.jwt,
      session_token: session.sessionToken,
      expires_at: session.expiresAt
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