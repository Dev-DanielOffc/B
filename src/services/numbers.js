import { db } from '../db/index.js';
import { nanoidShort, generateRandomDigits } from '../utils/ids.js';

const COUNTRY_PREFIXES = {
  DO: { code: '1', virtual: '839', digits: 7 },
  CU: { code: '53', virtual: '536', digits: 7 },
  PR: { code: '1', virtual: '788', digits: 7 },
  US: { code: '1', virtual: '999', digits: 10 },
  UY: { code: '598', virtual: '599', digits: 8 },
  PY: { code: '595', virtual: '596', digits: 9 },
  MX: { code: '52', virtual: '53', digits: 10 },
  PE: { code: '51', virtual: '52', digits: 9 },
  EC: { code: '593', virtual: '594', digits: 9 },
  VE: { code: '58', virtual: '59', digits: 10 },
  CO: { code: '57', virtual: '58', digits: 10 },
  CL: { code: '56', virtual: '57', digits: 9 },
  AR: { code: '54', virtual: '55', digits: 10 },
  BR: { code: '55', virtual: '56', digits: 11 },
  PT: { code: '351', virtual: '352', digits: 9 },
  CA: { code: '1', virtual: '998', digits: 10 },
  HN: { code: '504', virtual: '505', digits: 8 },
  GT: { code: '502', virtual: '503', digits: 8 },
  SV: { code: '503', virtual: '504', digits: 8 },
  NI: { code: '505', virtual: '506', digits: 8 },
  CR: { code: '506', virtual: '507', digits: 8 },
  PA: { code: '507', virtual: '508', digits: 8 },
  BO: { code: '591', virtual: '592', digits: 8 },
  GY: { code: '592', virtual: '593', digits: 7 },
  SR: { code: '597', virtual: '598', digits: 7 },
  BZ: { code: '501', virtual: '502', digits: 7 }
};

export function getSupportedCountries() {
  return Object.keys(COUNTRY_PREFIXES).map((code) => ({
    code,
    prefix: '+' + COUNTRY_PREFIXES[code].code,
    virtualPrefix: '+' + COUNTRY_PREFIXES[code].code + COUNTRY_PREFIXES[code].virtual
  }));
}

export function isCountrySupported(countryCode) {
  return Object.prototype.hasOwnProperty.call(COUNTRY_PREFIXES, countryCode);
}

function buildNumber(countryCode, digits) {
  const info = COUNTRY_PREFIXES[countryCode];
  return info.code + info.virtual + digits;
}

function existsInDb(number) {
  const row = db.prepare('SELECT id FROM virtual_numbers WHERE number = ?').get(number);
  return !!row;
}

export function generateVirtualNumber(countryCode) {
  if (!isCountrySupported(countryCode)) {
    throw new Error('COUNTRY_NOT_SUPPORTED');
  }
  const info = COUNTRY_PREFIXES[countryCode];
  let attempts = 0;
  while (attempts < 50) {
    const digits = generateRandomDigits(info.digits);
    const number = buildNumber(countryCode, digits);
    if (!existsInDb(number)) {
      return number;
    }
    attempts++;
  }
  throw new Error('NUMBER_GENERATION_FAILED');
}

export function reserveVirtualNumber(countryCode) {
  const number = generateVirtualNumber(countryCode);
  const id = nanoidShort();
  const now = Date.now();
  db.prepare(
    'INSERT INTO virtual_numbers (id, number, country_code, assigned, created_at) VALUES (?, ?, ?, 0, ?)'
  ).run(id, number, countryCode, now);
  return { id, number, countryCode };
}

export function assignVirtualNumber(numberId, userId) {
  const now = Date.now();
  const result = db
    .prepare('UPDATE virtual_numbers SET assigned = 1, user_id = ?, assigned_at = ? WHERE id = ? AND assigned = 0')
    .run(userId, now, numberId);
  return result.changes > 0;
}

export function getNumberInfo(number) {
  const row = db.prepare('SELECT * FROM virtual_numbers WHERE number = ?').get(number);
  return row || null;
}