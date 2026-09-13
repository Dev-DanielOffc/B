import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { generateFileId, nanoidShort } from '../utils/ids.js';
import { db } from '../db/index.js';

const ALLOWED_GENERAL_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/zip',
  'text/plain',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'video/mp4',
  'video/webm'
];

export function isAllowedMime(mime) {
  return ALLOWED_GENERAL_MIMES.includes(mime);
}

export async function saveTempFile(stream, filename, mimetype, uploaderId) {
  const ext = path.extname(filename || '').toLowerCase() || '';
  const storedName = `${nanoidShort()}${ext}`;
  const destPath = path.join(config.uploads.tempDir, storedName);

  await new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(destPath);
    stream.pipe(writeStream);
    stream.on('end', resolve);
    writeStream.on('error', reject);
  });

  const stats = fs.statSync(destPath);
  const fileId = generateFileId();
  const now = Date.now();

  db.prepare(
    'INSERT INTO files (id, uploader_id, filename, original_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(fileId, uploaderId, storedName, filename || storedName, mimetype, stats.size, now);

  return {
    id: fileId,
    filename: storedName,
    original_name: filename,
    mime_type: mimetype,
    size_bytes: stats.size,
    url: `/u/temp/${storedName}`
  };
}

export function deleteFileByFilename(filename) {
  const paths = [
    path.join(config.uploads.tempDir, filename),
    path.join(config.uploads.avatarsDir, filename),
    path.join(config.uploads.dir, filename)
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch (err) {
        continue;
      }
    }
  }
}

export function cleanupOldTempFiles(maxAgeMs) {
  const threshold = Date.now() - maxAgeMs;
  const rows = db
    .prepare('SELECT id, filename FROM files WHERE created_at < ?')
    .all(threshold);

  let removed = 0;
  for (const row of rows) {
    const filePath = path.join(config.uploads.tempDir, row.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        continue;
      }
    }
    db.prepare('DELETE FROM files WHERE id = ?').run(row.id);
    removed++;
  }
  return removed;
}