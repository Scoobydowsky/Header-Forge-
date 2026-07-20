/**
 * Generate a unique identifier.
 * Prefers crypto.randomUUID when available.
 *
 * @returns {string}
 */
export function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `hf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
