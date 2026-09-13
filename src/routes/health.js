import { db } from '../db/index.js';
import { hub } from '../ws/hub.js';

const startTime = Date.now();

export default async function healthRoutes(fastify) {
  fastify.get('/', async (request, reply) => {
    let dbStatus = 'ok';
    try {
      db.prepare('SELECT 1').get();
    } catch (err) {
      dbStatus = 'error';
    }

    return reply.send({
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      uptime_ms: Date.now() - startTime,
      db: dbStatus,
      online_users: hub.countOnline(),
      timestamp: Date.now()
    });
  });

  fastify.get('/stats', async (request, reply) => {
    const users = db.prepare('SELECT COUNT(*) as total FROM users WHERE is_active = 1').get().total;
    const pending = db.prepare('SELECT COUNT(*) as total FROM pending_messages').get().total;
    const sessions = db.prepare('SELECT COUNT(*) as total FROM sessions WHERE expires_at > ?').get(Date.now()).total;

    return reply.send({
      users,
      pending_messages: pending,
      active_sessions: sessions,
      online_users: hub.countOnline(),
      timestamp: Date.now()
    });
  });
}