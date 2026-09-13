import { authenticate } from '../middleware/auth.js';
import { getChatHistory, listUserChats, getChatParticipants } from '../services/chat.js';
import { db } from '../db/index.js';

export default async function chatRoutes(fastify) {
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const chats = listUserChats(request.userId);
    const enriched = chats.map((chat) => {
      const participants = getChatParticipants(chat.chat_id);
      const other = participants
        ? participants.a.id === request.userId
          ? participants.b
          : participants.a
        : null;
      return {
        chat_id: chat.chat_id,
        other_user: other,
        last_message_at: chat.last_message_at,
        total_messages: chat.total_messages
      };
    });
    return reply.send({ chats: enriched });
  });

  fastify.get('/:mcid/history', { preHandler: [authenticate] }, async (request, reply) => {
    const other = db.prepare('SELECT id FROM users WHERE mcid = ?').get(request.params.mcid);
    if (!other) {
      return reply.code(404).send({ error: 'Usuario no encontrado' });
    }

    const limit = Math.min(parseInt(request.query.limit || '50', 10), 100);
    const before = request.query.before ? parseInt(request.query.before, 10) : null;

    const messages = getChatHistory(request.userId, other.id, limit, before);
    return reply.send({ messages: messages.reverse() });
  });

  fastify.get('/:mcid/participants', { preHandler: [authenticate] }, async (request, reply) => {
    const user = db.prepare('SELECT mcid FROM users WHERE id = ?').get(request.userId);
    const other = db.prepare('SELECT mcid FROM users WHERE mcid = ?').get(request.params.mcid);
    if (!user || !other) {
      return reply.code(404).send({ error: 'Usuario no encontrado' });
    }

    const chatId = [user.mcid, other.mcid].sort().join(':');
    const participants = getChatParticipants(chatId);
    if (!participants) {
      return reply.code(404).send({ error: 'Chat no encontrado' });
    }

    return reply.send({ participants });
  });
}