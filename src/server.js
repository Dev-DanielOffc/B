import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import './db/index.js';
import { startCleanup } from './services/cleanup.js';
import { registerWebSocket } from './ws/handler.js';
import { errorHandler } from './utils/errors.js';

import authRoutes from './routes/auth.js';
import numbersRoutes from './routes/numbers.js';
import mcidRoutes from './routes/mcid.js';
import usersRoutes from './routes/users.js';
import messagesRoutes from './routes/messages.js';
import keysRoutes from './routes/keys.js';
import presenceRoutes from './routes/presence.js';
import healthRoutes from './routes/health.js';
import chatRoutes from './routes/chat.js';
import blocksRoutes from './routes/blocks.js';
import uploadRoutes from './routes/upload.js';

const fastify = Fastify({
  logger: false,
  trustProxy: true,
  bodyLimit: 10485760
});

async function bootstrap() {
  if (!fs.existsSync(config.uploads.dir)) fs.mkdirSync(config.uploads.dir, { recursive: true });
  if (!fs.existsSync(config.uploads.avatarsDir)) fs.mkdirSync(config.uploads.avatarsDir, { recursive: true });
  if (!fs.existsSync(config.uploads.tempDir)) fs.mkdirSync(config.uploads.tempDir, { recursive: true });
  if (!fs.existsSync(config.publicDir)) fs.mkdirSync(config.publicDir, { recursive: true });

  await fastify.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
  });

  await fastify.register(jwt, {
    secret: config.jwt.secret,
    sign: { expiresIn: config.jwt.expiresIn }
  });

  await fastify.register(multipart, {
    limits: { fileSize: config.uploads.maxSize }
  });

  await fastify.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute'
  });

  await fastify.register(websocket, {
    options: { maxPayload: 1048576 }
  });

  await fastify.register(staticFiles, {
    root: config.publicDir,
    prefix: '/',
    wildcard: false,
    decorateReply: true
  });

  await fastify.register(staticFiles, {
    root: config.uploads.dir,
    prefix: '/u/',
    decorateReply: false
  });

  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(numbersRoutes, { prefix: '/api/numbers' });
  await fastify.register(mcidRoutes, { prefix: '/api/mcid' });
  await fastify.register(usersRoutes, { prefix: '/api/users' });
  await fastify.register(messagesRoutes, { prefix: '/api/messages' });
  await fastify.register(keysRoutes, { prefix: '/api/keys' });
  await fastify.register(presenceRoutes, { prefix: '/api/presence' });
  await fastify.register(healthRoutes, { prefix: '/api/health' });
  await fastify.register(chatRoutes, { prefix: '/api/chat' });
  await fastify.register(blocksRoutes, { prefix: '/api/blocks' });
  await fastify.register(uploadRoutes, { prefix: '/api/upload' });

  registerWebSocket(fastify);

  fastify.setErrorHandler(errorHandler);

  fastify.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Endpoint no encontrado' });
    }
    const notFound = path.join(config.publicDir, '404.html');
    if (fs.existsSync(notFound)) {
      return reply.sendFile('404.html');
    }
    return reply.code(404).send({ error: 'Not found' });
  });

  fastify.addHook('onRequest', async (request, reply) => {
    const url = request.raw.url;
    if (url.endsWith('.html') && !url.startsWith('/u/')) {
      const clean = url.replace(/\.html$/, '');
      return reply.redirect(301, clean === '' ? '/' : clean);
    }
  });

  startCleanup();

  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`MessagesChat backend online en puerto ${config.port}`);
  } catch (err) {
    console.error('Error al iniciar servidor:', err.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  fastify.close().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
  fastify.close().then(() => process.exit(0));
});

bootstrap();

export { fastify };