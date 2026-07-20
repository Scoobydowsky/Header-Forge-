/**
 * @typedef {'ADD' | 'SET' | 'REMOVE'} HeaderOperation
 */

/**
 * @typedef {'DEV' | 'TEST' | 'PROD' | 'LOCAL' | ''} ColorLabel
 */

/**
 * @typedef {Object} HeaderEntry
 * @property {string} id
 * @property {string} name
 * @property {string} value
 * @property {HeaderOperation} operation
 * @property {boolean} enabled
 */

/**
 * @typedef {Object} DomainRule
 * @property {string} id
 * @property {string} pattern
 * @property {boolean} enabled
 */

/**
 * @typedef {Object} Profile
 * @property {string} id
 * @property {string} name
 * @property {ColorLabel} color
 * @property {boolean} enabled
 * @property {HeaderEntry[]} headers
 * @property {DomainRule[]} rules
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/** Valid header operations. */
export const HEADER_OPERATIONS = /** @type {const} */ (['ADD', 'SET', 'REMOVE']);

/** Valid color labels for profiles. */
export const COLOR_LABELS = /** @type {const} */ (['DEV', 'TEST', 'PROD', 'LOCAL', '']);

/**
 * Normalize a header name (trim, collapse whitespace).
 *
 * @param {string} name
 * @returns {string}
 */
export function normalizeHeaderName(name) {
  return String(name ?? '').trim().replace(/\s+/g, '-');
}

/**
 * Check whether a header name looks valid (RFC 7230 token-ish).
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isValidHeaderName(name) {
  const normalized = normalizeHeaderName(name);
  if (!normalized) {
    return false;
  }

  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(normalized);
}

/**
 * Validate a single header entry before save.
 * Headers with ADD/SET require a non-empty value.
 *
 * @param {Partial<HeaderEntry>} header
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateHeader(header) {
  const name = normalizeHeaderName(header?.name ?? '');
  const operation = /** @type {HeaderOperation} */ (header?.operation ?? 'SET');
  const value = String(header?.value ?? '').trim();

  if (!name) {
    return { valid: false, error: 'Header name is required.' };
  }

  if (!isValidHeaderName(name)) {
    return { valid: false, error: 'Header name contains invalid characters.' };
  }

  if (!HEADER_OPERATIONS.includes(operation)) {
    return { valid: false, error: 'Invalid header operation.' };
  }

  if (operation !== 'REMOVE' && !value) {
    return { valid: false, error: `"${name}" requires a value for ${operation}.` };
  }

  return { valid: true };
}

/**
 * Validate a domain pattern (supports wildcards like *.example.com).
 *
 * @param {string} pattern
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateDomainPattern(pattern) {
  const trimmed = String(pattern ?? '').trim().toLowerCase();

  if (!trimmed) {
    return { valid: false, error: 'Domain pattern is required.' };
  }

  if (/\s/.test(trimmed)) {
    return { valid: false, error: 'Domain pattern cannot contain spaces.' };
  }

  // Allow localhost, IPs, hostnames, and single-level wildcards.
  const ok =
    trimmed === 'localhost' ||
    /^(\d{1,3}\.){3}\d{1,3}$/.test(trimmed) ||
    /^(\*\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(trimmed) ||
    /^(\*\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(trimmed);

  if (!ok) {
    return { valid: false, error: 'Invalid domain pattern. Use host, IP, or *.example.com.' };
  }

  return { valid: true };
}

/**
 * Validate a profile name.
 *
 * @param {string} name
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateProfileName(name) {
  const trimmed = String(name ?? '').trim();

  if (!trimmed) {
    return { valid: false, error: 'Profile name is required.' };
  }

  if (trimmed.length > 64) {
    return { valid: false, error: 'Profile name must be 64 characters or fewer.' };
  }

  return { valid: true };
}
