export function isString(value) {
  return typeof value === 'string';
}

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isArray(value) {
  return Array.isArray(value);
}

export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isEmail(value) {
  if (!isString(value)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isUsername(value) {
  if (!isString(value)) return false;
  return /^[a-zA-Z0-9_]{3,20}$/.test(value);
}

export function isMcid(value) {
  if (!isString(value)) return false;
  return /^[A-Z0-9]{5,10}@mcid\.do$/.test(value);
}

export function isVirtualNumber(value) {
  if (!isString(value)) return false;
  return /^[0-9]{7,15}$/.test(value);
}

export function isUuid(value) {
  if (!isString(value)) return false;
  return /^[a-zA-Z0-9_-]{8,40}$/.test(value);
}

export function isBase64(value) {
  if (!isString(value)) return false;
  if (value.length === 0) return false;
  if (value.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

export function inRange(value, min, max) {
  return isNumber(value) && value >= min && value <= max;
}

export function lengthBetween(value, min, max) {
  return isString(value) && value.length >= min && value.length <= max;
}

export function sanitizeString(value, maxLength = 500) {
  if (!isString(value)) return '';
  return value.trim().slice(0, maxLength);
}