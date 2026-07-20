/**
 * Persistence layer for HeaderForge.
 * All data stays in chrome.storage.local — no network I/O.
 */

import { createId } from '../utils/id.js';
import {
  COLOR_LABELS,
  HEADER_OPERATIONS,
  normalizeHeaderName,
  validateDomainPattern,
  validateHeader,
  validateProfileName,
} from '../utils/validate.js';

/** Storage schema version. */
export const STORAGE_VERSION = 2;

/** Primary storage key. */
export const STORAGE_KEY = 'headerforge';

/**
 * Domains skipped while All sites is on (streaming / media break easily).
 * Users can add/remove more from the popup.
 *
 * @type {readonly string[]}
 */
export const DEFAULT_EXCLUDED_DOMAINS = Object.freeze([
  'music.youtube.com',
  'youtube.com',
  'www.youtube.com',
  'googlevideo.com',
  'ytimg.com',
  'spotify.com',
  'open.spotify.com',
]);

/**
 * @typedef {Object} AppState
 * @property {number} version
 * @property {boolean} enabled
 * @property {boolean} applyToAllSites
 * @property {string[]} excludedDomains
 * @property {string | null} activeProfileId
 * @property {string[]} recentProfileIds
 * @property {import('../utils/validate.js').Profile[]} profiles
 * @property {object | null} backup
 * @property {number | null} lastBackupAt
 * @property {boolean} onboarded
 */

/**
 * Create a blank application state — one empty Default workspace, no sample data.
 *
 * @returns {AppState}
 */
export function createDefaultState() {
  const profile = createEmptyProfile('Default', '');

  return {
    version: STORAGE_VERSION,
    enabled: true,
    applyToAllSites: true,
    excludedDomains: [...DEFAULT_EXCLUDED_DOMAINS],
    activeProfileId: profile.id,
    recentProfileIds: [profile.id],
    profiles: [profile],
    backup: null,
    lastBackupAt: null,
    onboarded: false,
  };
}

/**
 * Create a blank profile.
 *
 * @param {string} [name='Default']
 * @param {import('../utils/validate.js').ColorLabel} [color='']
 * @returns {import('../utils/validate.js').Profile}
 */
export function createEmptyProfile(name = 'Default', color = '') {
  const now = Date.now();

  return {
    id: createId(),
    name,
    color,
    enabled: true,
    headers: [],
    rules: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Deep-clone a profile with new ids (clone / duplicate).
 *
 * @param {import('../utils/validate.js').Profile} profile
 * @param {string} [nameSuffix=' (copy)']
 * @returns {import('../utils/validate.js').Profile}
 */
export function cloneProfile(profile, nameSuffix = ' (copy)') {
  const now = Date.now();

  return {
    id: createId(),
    name: `${profile.name}${nameSuffix}`,
    color: profile.color,
    enabled: profile.enabled,
    headers: profile.headers.map((header) => ({
      ...header,
      id: createId(),
    })),
    rules: profile.rules.map((rule) => ({
      ...rule,
      id: createId(),
    })),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Read the full application state from chrome.storage.local.
 *
 * @returns {Promise<AppState>}
 */
export async function loadState() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY];

  if (!stored || typeof stored !== 'object') {
    const defaults = createDefaultState();
    await saveState(defaults);
    return defaults;
  }

  // v1 shipped with demo profiles — reset to a clean empty Default workspace.
  if (typeof stored.version !== 'number' || stored.version < STORAGE_VERSION) {
    const fresh = createDefaultState();
    await saveState(fresh);
    return fresh;
  }

  return normalizeState(stored);
}

/**
 * Persist application state and refresh the automatic backup snapshot.
 *
 * @param {AppState} state
 * @returns {Promise<AppState>}
 */
export async function saveState(state) {
  const normalized = normalizeState(state);
  const withBackup = {
    ...normalized,
    backup: createBackupSnapshot(normalized),
    lastBackupAt: Date.now(),
  };

  await chrome.storage.local.set({ [STORAGE_KEY]: withBackup });
  return withBackup;
}

/**
 * Partial update helper.
 *
 * @param {Partial<AppState>} patch
 * @returns {Promise<AppState>}
 */
export async function updateState(patch) {
  const current = await loadState();
  return saveState({ ...current, ...patch });
}

/**
 * Build a backup snapshot (profiles + flags, no nested backup).
 *
 * @param {AppState} state
 * @returns {object}
 */
export function createBackupSnapshot(state) {
  return {
    version: state.version,
    enabled: state.enabled,
    applyToAllSites: state.applyToAllSites,
    excludedDomains: [...state.excludedDomains],
    activeProfileId: state.activeProfileId,
    recentProfileIds: [...state.recentProfileIds],
    profiles: structuredClone(state.profiles),
    createdAt: Date.now(),
  };
}

/**
 * Restore from the automatic backup if present.
 *
 * @returns {Promise<AppState | null>}
 */
export async function restoreFromBackup() {
  const state = await loadState();

  if (!state.backup || typeof state.backup !== 'object') {
    return null;
  }

  const restored = normalizeState({
    ...state.backup,
    backup: state.backup,
    lastBackupAt: state.lastBackupAt,
    onboarded: state.onboarded,
  });

  return saveState(restored);
}

/**
 * Export profiles as a portable JSON document.
 *
 * @param {AppState} state
 * @param {string[]} [profileIds]
 * @returns {object}
 */
export function buildExportDocument(state, profileIds) {
  const profiles =
    profileIds && profileIds.length > 0
      ? state.profiles.filter((profile) => profileIds.includes(profile.id))
      : state.profiles;

  return {
    format: 'headerforge',
    version: STORAGE_VERSION,
    exportedAt: new Date().toISOString(),
    enabled: state.enabled,
    activeProfileId: state.activeProfileId,
    profiles: structuredClone(profiles),
  };
}

/**
 * Parse and validate an import document.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, profiles: import('../utils/validate.js').Profile[] } | { ok: false, error: string }}
 */
export function parseImportDocument(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Import file must be a JSON object.' };
  }

  const doc = /** @type {Record<string, unknown>} */ (raw);
  const list = Array.isArray(doc.profiles) ? doc.profiles : Array.isArray(doc) ? doc : null;

  if (!list) {
    return { ok: false, error: 'Import file must contain a "profiles" array.' };
  }

  /** @type {import('../utils/validate.js').Profile[]} */
  const profiles = [];

  for (const item of list) {
    const normalized = normalizeProfile(item);
    if (!normalized) {
      return { ok: false, error: 'One or more profiles in the import file are invalid.' };
    }
    profiles.push(normalized);
  }

  return { ok: true, profiles };
}

/**
 * Merge imported profiles into state (new ids to avoid collisions).
 *
 * @param {AppState} state
 * @param {import('../utils/validate.js').Profile[]} imported
 * @returns {AppState}
 */
export function mergeImportedProfiles(state, imported) {
  const fresh = imported.map((profile) => {
    const now = Date.now();
    return {
      id: createId(),
      name: profile.name,
      color: profile.color,
      enabled: profile.enabled,
      headers: profile.headers.map((header) => ({ ...header, id: createId() })),
      rules: profile.rules.map((rule) => ({ ...rule, id: createId() })),
      createdAt: now,
      updatedAt: now,
    };
  });

  return {
    ...state,
    profiles: [...state.profiles, ...fresh],
    recentProfileIds: [
      ...fresh.map((profile) => profile.id),
      ...state.recentProfileIds,
    ].slice(0, 8),
  };
}

/**
 * Track a profile as recently used.
 *
 * @param {AppState} state
 * @param {string} profileId
 * @returns {AppState}
 */
export function touchRecent(state, profileId) {
  const recent = [profileId, ...state.recentProfileIds.filter((id) => id !== profileId)].slice(
    0,
    8,
  );

  return {
    ...state,
    recentProfileIds: recent,
  };
}

/**
 * Aggregate counters for UI badges.
 *
 * @param {AppState} state
 * @returns {{ profiles: number, headers: number, domains: number, activeHeaders: number }}
 */
export function getCounters(state) {
  const active = state.profiles.find((profile) => profile.id === state.activeProfileId);
  const headers = active?.headers.length ?? 0;
  const activeHeaders = active?.headers.filter((header) => header.enabled).length ?? 0;
  const domains = active?.rules.filter((rule) => rule.enabled).length ?? 0;

  return {
    profiles: state.profiles.length,
    headers,
    domains,
    activeHeaders,
  };
}

/**
 * Search profiles by name, domain pattern, or header name/value.
 *
 * @param {AppState} state
 * @param {string} query
 * @returns {import('../utils/validate.js').Profile[]}
 */
export function searchProfiles(state, query) {
  const q = String(query ?? '').trim().toLowerCase();

  if (!q) {
    return state.profiles;
  }

  return state.profiles.filter((profile) => {
    if (profile.name.toLowerCase().includes(q)) {
      return true;
    }

    if (profile.color && profile.color.toLowerCase().includes(q)) {
      return true;
    }

    if (profile.rules.some((rule) => rule.pattern.toLowerCase().includes(q))) {
      return true;
    }

    return profile.headers.some(
      (header) =>
        header.name.toLowerCase().includes(q) || header.value.toLowerCase().includes(q),
    );
  });
}

/**
 * Normalize unknown storage payload into a safe AppState.
 *
 * @param {unknown} raw
 * @returns {AppState}
 */
function normalizeState(raw) {
  const defaults = createDefaultState();
  const data = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};

  const profiles = Array.isArray(data.profiles)
    ? data.profiles.map(normalizeProfile).filter(Boolean)
    : defaults.profiles;

  /** @type {import('../utils/validate.js').Profile[]} */
  const safeProfiles = /** @type {import('../utils/validate.js').Profile[]} */ (profiles);

  const activeProfileId =
    typeof data.activeProfileId === 'string' &&
    safeProfiles.some((profile) => profile.id === data.activeProfileId)
      ? data.activeProfileId
      : safeProfiles[0]?.id ?? null;

  const recentProfileIds = Array.isArray(data.recentProfileIds)
    ? data.recentProfileIds.filter(
        (id) => typeof id === 'string' && safeProfiles.some((profile) => profile.id === id),
      )
    : [];

  return {
    version: STORAGE_VERSION,
    enabled: data.enabled !== false,
    applyToAllSites: data.applyToAllSites !== false,
    excludedDomains: normalizeExcludedDomains(data.excludedDomains),
    activeProfileId,
    recentProfileIds: recentProfileIds.length > 0 ? recentProfileIds : activeProfileId ? [activeProfileId] : [],
    profiles: safeProfiles.length > 0 ? safeProfiles : defaults.profiles,
    backup: data.backup && typeof data.backup === 'object' ? data.backup : null,
    lastBackupAt: typeof data.lastBackupAt === 'number' ? data.lastBackupAt : null,
    onboarded: Boolean(data.onboarded),
  };
}

/**
 * Normalize excluded domain list. If missing (upgrades), seed defaults.
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeExcludedDomains(raw) {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_EXCLUDED_DOMAINS];
  }

  const cleaned = raw
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return [...new Set(cleaned)];
}

/**
 * Normalize a profile object.
 *
 * @param {unknown} raw
 * @returns {import('../utils/validate.js').Profile | null}
 */
function normalizeProfile(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = /** @type {Record<string, unknown>} */ (raw);
  const nameCheck = validateProfileName(String(data.name ?? ''));

  if (!nameCheck.valid) {
    return null;
  }

  const colorRaw = String(data.color ?? '');
  const color = /** @type {import('../utils/validate.js').ColorLabel} */ (
    COLOR_LABELS.includes(/** @type {any} */ (colorRaw)) ? colorRaw : ''
  );

  const headers = Array.isArray(data.headers)
    ? data.headers.map(normalizeHeader).filter(Boolean)
    : [];

  const rules = Array.isArray(data.rules)
    ? data.rules.map(normalizeRule).filter(Boolean)
    : [];

  return {
    id: typeof data.id === 'string' && data.id ? data.id : createId(),
    name: String(data.name).trim(),
    color,
    enabled: data.enabled !== false,
    headers: /** @type {import('../utils/validate.js').HeaderEntry[]} */ (headers),
    rules: /** @type {import('../utils/validate.js').DomainRule[]} */ (rules),
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
  };
}

/**
 * Normalize a header entry.
 *
 * @param {unknown} raw
 * @returns {import('../utils/validate.js').HeaderEntry | null}
 */
function normalizeHeader(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = /** @type {Record<string, unknown>} */ (raw);
  const operationRaw = String(data.operation ?? 'SET').toUpperCase();
  const operation = /** @type {import('../utils/validate.js').HeaderOperation} */ (
    HEADER_OPERATIONS.includes(/** @type {any} */ (operationRaw)) ? operationRaw : 'SET'
  );

  const header = {
    id: typeof data.id === 'string' && data.id ? data.id : createId(),
    name: normalizeHeaderName(String(data.name ?? '')),
    value: String(data.value ?? ''),
    operation,
    enabled: data.enabled !== false,
  };

  const check = validateHeader(header);
  if (!check.valid && operation !== 'REMOVE') {
    // Keep REMOVE-only invalids out; allow incomplete disabled drafts out of storage.
    if (!header.name) {
      return null;
    }
  }

  if (!header.name) {
    return null;
  }

  return header;
}

/**
 * Normalize a domain rule.
 *
 * @param {unknown} raw
 * @returns {import('../utils/validate.js').DomainRule | null}
 */
function normalizeRule(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = /** @type {Record<string, unknown>} */ (raw);
  const pattern = String(data.pattern ?? '').trim().toLowerCase();
  const check = validateDomainPattern(pattern);

  if (!check.valid) {
    return null;
  }

  return {
    id: typeof data.id === 'string' && data.id ? data.id : createId(),
    pattern,
    enabled: data.enabled !== false,
  };
}
