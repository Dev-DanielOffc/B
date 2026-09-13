import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const config = {
  port: parseInt(process.env.PORT || '3033', 10),
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },
  db: {
    path: path.resolve(rootDir, process.env.DB_PATH || './data/messageschat.db')
  },
  publicDir: path.resolve(rootDir, process.env.PUBLIC_DIR || './public'),
  uploads: {
    dir: path.resolve(rootDir, process.env.UPLOAD_DIR || './uploads'),
    avatarsDir: path.resolve(rootDir, process.env.UPLOAD_DIR || './uploads', 'avatars'),
    tempDir: path.resolve(rootDir, process.env.UPLOAD_DIR || './uploads', 'temp'),
    maxSize: parseInt(process.env.UPLOAD_MAX_SIZE || '5242880', 10)
  },
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:3033',
  rootDir
};