PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  mcid TEXT UNIQUE NOT NULL,
  virtual_number TEXT UNIQUE NOT NULL,
  country_code TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  password_hash TEXT NOT NULL,
  pin_hash TEXT,
  pin_set_at INTEGER,
  onboarding_completed INTEGER DEFAULT 0,
  identity_key TEXT NOT NULL,
  signed_prekey TEXT NOT NULL,
  signed_prekey_signature TEXT NOT NULL,
  registration_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen INTEGER,
  is_active INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_users_mcid ON users(mcid);
CREATE INDEX IF NOT EXISTS idx_users_number ON users(virtual_number);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS one_time_prekeys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key_id INTEGER NOT NULL,
  public_key TEXT NOT NULL,
  used INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prekeys_user ON one_time_prekeys(user_id, used);

CREATE TABLE IF NOT EXISTS virtual_numbers (
  id TEXT PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  country_code TEXT NOT NULL,
  assigned INTEGER DEFAULT 0,
  user_id TEXT,
  created_at INTEGER NOT NULL,
  assigned_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_numbers_country ON virtual_numbers(country_code, assigned);

CREATE TABLE IF NOT EXISTS pending_registrations (
  id TEXT PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  country_code TEXT NOT NULL,
  pin_hash TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_expires ON pending_registrations(expires_at);

CREATE TABLE IF NOT EXISTS mcid_registry (
  id TEXT PRIMARY KEY,
  mcid TEXT UNIQUE NOT NULL,
  letter TEXT NOT NULL,
  generation INTEGER NOT NULL,
  user_id TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_mcid_letter ON mcid_registry(letter);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  device_info TEXT,
  ip_address TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS pending_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  encrypted_blob TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  metadata TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_to ON pending_messages(to_user, expires_at);
CREATE INDEX IF NOT EXISTS idx_pending_chat ON pending_messages(chat_id);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  uploader_id TEXT,
  filename TEXT UNIQUE NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_files_uploader ON files(uploader_id);

CREATE TABLE IF NOT EXISTS contacts (
  user_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  alias TEXT,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, contact_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (2, strftime('%s', 'now') * 1000);