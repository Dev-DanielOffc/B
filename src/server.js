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

const fastify = Fastify({
  logger: false,
  trustProxy: true,
  bodyLimit: 10485760
});

async function bootstrap() {
  if (!fs.existsSync(config.uploads.dir)) {
    fs.mkdirSync(config.uploads.dir, { recursive: true });
  }
  if (!fs.existsSync(config.uploads.avatarsDir)) {
    fs.mkdirSync(config.uploads.avatarsDir, { recursive: true });
  }
  if (!fs.existsSync(config.uploads.tempDir)) {
    fs.mkdirSync(config.uploads.tempDir, { recursive: true });
  }
  if (!fs.existsSync(config.publicDir)) {
    fs.mkdirSync(config.publicDir, { recursive: true });
  }

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
    timeWindow: '1 minute',
    allowList: []
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
    decorateReply: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.apk')) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      }
    }
  });

  fastify.get('/api/health', async () => {
    return { status: 'ok', timestamp: Date.now() };
  });

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

  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`MessagesChat backend online en puerto ${config.port}`);
  } catch (err) {
    console.error('Error al iniciar servidor:', err.message);
    process.exit(1);
  }
}

bootstrap();

export { fastify };