import { customAlphabet } from 'nanoid';

const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const UPPER = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const nanoid = customAlphabet(ALPHANUMERIC, 21);
export const nanoidShort = customAlphabet(ALPHANUMERIC, 12);
export const nanoidTiny = customAlphabet(ALPHANUMERIC, 8);

export function generateUserId() {
  return 'usr_' + customAlphabet(ALPHANUMERIC, 16)();
}

export function generateMessageId() {
  return 'msg_' + customAlphabet(ALPHANUMERIC, 16)();
}

export function generateFileId() {
  return 'fil_' + customAlphabet(ALPHANUMERIC, 16)();
}

export function generateSessionId() {
  return 'ses_' + customAlphabet(ALPHANUMERIC, 16)();
}

export function generateTempId() {
  return 'tmp_' + customAlphabet(ALPHANUMERIC, 12)();
}

export function generateRandomDigits(length) {
  return customAlphabet(DIGITS, length)();
}

export function generateRandomUpper(length) {
  return customAlphabet(UPPER, length)();
}

export function generateRegistrationId() {
  return Math.floor(Math.random() * 16380) + 1;
}