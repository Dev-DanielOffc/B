import { db } from '../db/index.js';
import { hashToken } from '../utils/crypto.js';

export async function authenticate(request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.code(401).send({ error: 'Token invalido o expirado' });
  }

  const userId = request.user.id;
  const user = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(userId);

  if (!user) {
    return reply.code(401).send({ error: 'Usuario no encontrado' });
  }

  if (!user.is_active) {
    return reply.code(403).send({ error: 'Cuenta desactivada' });
  }

  request.userId = user.id;
}

export function optionalAuth(request, reply, done) {
  const authHeader = request.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    request.userId = null;
    return done();
  }
  request.jwtVerify()
    .then((payload) => {
      request.userId = payload.id;
      done();
    })
    .catch(() => {
      request.userId = null;
      done();
    });
}

export function verifySession(token) {
  const hash = hashToken(token);
  const now = Date.now();
  const session = db
    .prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .get(hash, now);
  return session || null;
}