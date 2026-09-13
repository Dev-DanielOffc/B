import { db } from '../db/index.js';
import { hub } from './hub.js';

const HEARTBEAT_INTERVAL_MS = 30000;

const aliveSockets = new WeakMap();

export function registerWebSocket(fastify) {
  fastify.get('/ws', { websocket: true }, (socket, request) => {
    const url = new URL(request.url, 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      socket.close(1008, 'Token requerido');
      return;
    }

    let payload;
    try {
      payload = fastify.jwt.verify(token);
    } catch (err) {
      socket.close(1008, 'Token invalido');
      return;
    }

    const userId = payload.id;
    const user = db.prepare('SELECT id, mcid, is_active FROM users WHERE id = ?').get(userId);
    if (!user || !user.is_active) {
      socket.close(1008, 'Usuario no valido');
      return;
    }

    hub.add(userId, socket);
    aliveSockets.set(socket, true);

    db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), userId);

    socket.send(JSON.stringify({
      type: 'connected',
      user_id: userId,
      mcid: user.mcid,
      online_count: hub.countOnline()
    }));

    socket.on('pong', () => {
      aliveSockets.set(socket, true);
    });

    socket.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (err) {
        return;
      }

      if (msg.type === 'ping') {
        aliveSockets.set(socket, true);
        socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        return;
      }

      if (msg.type === 'typing') {
        const target = db.prepare('SELECT id FROM users WHERE mcid = ?').get(msg.to);
        if (target) {
          hub.sendToUser(target.id, {
            type: 'typing',
            from: user.mcid,
            state: msg.state === 'typing' ? 'typing' : 'paused'
          });
        }
        return;
      }

      if (msg.type === 'presence') {
        hub.sendToUser(userId, { type: 'presence', state: 'online' });
        return;
      }
    });

    socket.on('close', () => {
      hub.remove(userId, socket);
      aliveSockets.delete(socket);
      db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), userId);
    });

    socket.on('error', () => {
      hub.remove(userId, socket);
      aliveSockets.delete(socket);
    });
  });

  const interval = setInterval(() => {
    for (const set of new Set([...hub.countOnline() ? [] : []])) {
      void set;
    }
  }, HEARTBEAT_INTERVAL_MS);
  if (interval.unref) interval.unref();
}