export function formatTimestamp(ts) {
  if (!ts) return null;
  return new Date(ts).toISOString();
}

export function nowMs() {
  return Date.now();
}

export function daysFromNow(days) {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

export function formatPhoneParts(countryCode, number) {
  return {
    countryCode,
    full: `+${number}`,
    withoutPlus: number
  };
}

export function parseChatId(chatId) {
  const parts = chatId.split(':');
  return { a: parts[0], b: parts[1] };
}

export function buildChatId(mcidA, mcidB) {
  return [mcidA, mcidB].sort().join(':');
}

export function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch (err) {
    return fallback;
  }
}

export function safeJsonStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (err) {
    return null;
  }
}