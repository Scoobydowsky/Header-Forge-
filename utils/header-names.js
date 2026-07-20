/**
 * Common HTTP request header names for autocomplete suggestions.
 * Offline-only — no network lookups.
 */

/** @type {readonly string[]} */
export const COMMON_HEADER_NAMES = Object.freeze([
  'Accept',
  'Accept-Charset',
  'Accept-Encoding',
  'Accept-Language',
  'Access-Control-Request-Headers',
  'Access-Control-Request-Method',
  'Authorization',
  'Cache-Control',
  'Connection',
  'Content-Encoding',
  'Content-Language',
  'Content-Length',
  'Content-Type',
  'Cookie',
  'DNT',
  'Forwarded',
  'From',
  'Host',
  'If-Match',
  'If-Modified-Since',
  'If-None-Match',
  'If-Range',
  'If-Unmodified-Since',
  'Max-Forwards',
  'Origin',
  'Pragma',
  'Proxy-Authorization',
  'Range',
  'Referer',
  'TE',
  'Upgrade',
  'User-Agent',
  'Via',
  'Warning',
  'X-API-Key',
  'X-Auth-Token',
  'X-CSRF-Token',
  'X-Debug',
  'X-Environment',
  'X-Forwarded-For',
  'X-Forwarded-Host',
  'X-Forwarded-Proto',
  'X-Request-ID',
  'X-Request-Source',
  'X-Requested-With',
]);

/** Shared datalist id used across popup / options. */
export const HEADER_NAME_DATALIST_ID = 'hf-header-names';

/**
 * Ensure a shared datalist of common header names exists in the document.
 *
 * @param {string} [id=HEADER_NAME_DATALIST_ID]
 * @returns {HTMLDataListElement}
 */
export function ensureHeaderNameDatalist(id = HEADER_NAME_DATALIST_ID) {
  const existing = document.getElementById(id);
  if (existing instanceof HTMLDataListElement) {
    return existing;
  }

  const list = document.createElement('datalist');
  list.id = id;

  for (const name of COMMON_HEADER_NAMES) {
    const option = document.createElement('option');
    option.value = name;
    list.appendChild(option);
  }

  document.body.appendChild(list);
  return list;
}

/**
 * If the typed name uniquely prefixes a known header, expand it.
 * Example: "Accept-Langu" → "Accept-Language"
 *
 * @param {string} name
 * @returns {string}
 */
export function autocompleteHeaderName(name) {
  const normalized = String(name ?? '').trim();
  if (!normalized) {
    return normalized;
  }

  const lower = normalized.toLowerCase();
  const exact = COMMON_HEADER_NAMES.find((item) => item.toLowerCase() === lower);
  if (exact) {
    return exact;
  }

  const prefixMatches = COMMON_HEADER_NAMES.filter((item) =>
    item.toLowerCase().startsWith(lower),
  );

  if (prefixMatches.length === 1) {
    return prefixMatches[0];
  }

  return normalized;
}
