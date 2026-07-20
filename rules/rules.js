/**
 * declarativeNetRequest rule builders and sync helpers.
 * Converts HeaderForge profiles into Chrome DNR dynamic rules.
 */

import { normalizeHeaderName } from '../utils/validate.js';

/** Reserved rule id range start for HeaderForge dynamic rules. */
export const RULE_ID_BASE = 1000;

/** Allow-rule ids that skip header mods on excluded domains (higher priority). */
export const EXCLUDE_RULE_ID_BASE = 8000;

/** Origins matching host_permissions / all-sites mode. */
export const ALL_SITES_ORIGINS = Object.freeze(['http://*/*', 'https://*/*']);

/**
 * Map HeaderForge operations to DNR header operations.
 *
 * @param {'ADD' | 'SET' | 'REMOVE'} operation
 * @returns {'append' | 'set' | 'remove'}
 */
export function toDnrOperation(operation) {
  switch (operation) {
    case 'ADD':
      return 'append';
    case 'REMOVE':
      return 'remove';
    case 'SET':
    default:
      return 'set';
  }
}

/**
 * Shared resource types for HeaderForge DNR rules.
 *
 * @returns {chrome.declarativeNetRequest.ResourceType[]}
 */
function defaultResourceTypes() {
  return [
    'main_frame',
    'sub_frame',
    'xmlhttprequest',
    'script',
    'stylesheet',
    'image',
    'font',
    'object',
    'media',
    'websocket',
    'ping',
    'csp_report',
    'other',
  ];
}

/**
 * Convert a domain pattern to DNR condition fields.
 * Supports: host, IP, localhost, and *.example.com wildcards.
 *
 * @param {string} pattern
 * @returns {chrome.declarativeNetRequest.RuleCondition}
 */
export function patternToCondition(pattern) {
  const trimmed = String(pattern ?? '').trim().toLowerCase();
  const resourceTypes = defaultResourceTypes();

  if (trimmed.startsWith('*.')) {
    const root = trimmed.slice(2);
    return {
      // Match root and all subdomains via urlFilter.
      urlFilter: `||${root}^`,
      resourceTypes,
    };
  }

  return {
    // Prefer urlFilter over requestDomains — more reliable across Chrome versions.
    urlFilter: `||${trimmed}^`,
    resourceTypes,
  };
}

/**
 * Build host permission patterns required for a domain rule.
 * Must stay within http/https host_permissions (not *://).
 *
 * @param {string} pattern
 * @returns {string[]}
 */
export function patternToHostPermissions(pattern) {
  const trimmed = String(pattern ?? '').trim().toLowerCase();

  if (trimmed.startsWith('*.')) {
    const root = trimmed.slice(2);
    return [
      `http://${root}/*`,
      `https://${root}/*`,
      `http://*.${root}/*`,
      `https://*.${root}/*`,
    ];
  }

  return [`http://${trimmed}/*`, `https://${trimmed}/*`];
}

/**
 * Collect optional host permissions needed by the active profile.
 *
 * @param {import('../utils/validate.js').Profile | null | undefined} profile
 * @returns {string[]}
 */
export function collectHostPermissions(profile) {
  if (!profile) {
    return [];
  }

  /** @type {Set<string>} */
  const perms = new Set();

  for (const rule of profile.rules) {
    if (!rule.enabled) {
      continue;
    }

    for (const perm of patternToHostPermissions(rule.pattern)) {
      perms.add(perm);
    }
  }

  return [...perms];
}

/**
 * Build ModifyHeaderInfo list from enabled headers.
 *
 * @param {import('../utils/validate.js').HeaderEntry[]} headers
 * @returns {chrome.declarativeNetRequest.ModifyHeaderInfo[]}
 */
function toRequestHeaders(headers) {
  return headers.map((header) => {
    const op = toDnrOperation(header.operation);
    /** @type {chrome.declarativeNetRequest.ModifyHeaderInfo} */
    const info = {
      header: normalizeHeaderName(header.name),
      operation: op,
    };

    if (op !== 'remove') {
      info.value = header.value;
    }

    return info;
  });
}

/**
 * Build DNR rules for the currently active profile.
 * - applyToAllSites: one rule covering all http(s) hosts
 * - otherwise: one DNR rule per enabled domain pattern
 * Excluded domains get higher-priority `allow` rules so headers are not touched.
 *
 * @param {import('../storage/profiles.js').AppState} state
 * @returns {chrome.declarativeNetRequest.Rule[]}
 */
export function buildDynamicRules(state) {
  if (!state.enabled) {
    return [];
  }

  const profile = state.profiles.find((item) => item.id === state.activeProfileId);

  if (!profile || !profile.enabled) {
    return [];
  }

  const headers = profile.headers.filter((header) => header.enabled && header.name);

  if (headers.length === 0) {
    return [];
  }

  const requestHeaders = toRequestHeaders(headers);
  /** @type {chrome.declarativeNetRequest.Rule[]} */
  const rules = [];

  if (state.applyToAllSites) {
    rules.push({
      id: RULE_ID_BASE,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders,
      },
      condition: {
        // "|http" matches http:// and https:// from the start of the URL.
        urlFilter: '|http',
        resourceTypes: defaultResourceTypes(),
      },
    });
  } else {
    const domains = profile.rules.filter((rule) => rule.enabled && rule.pattern);

    if (domains.length === 0) {
      return [];
    }

    for (const [index, rule] of domains.entries()) {
      rules.push({
        id: RULE_ID_BASE + index,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders,
        },
        condition: patternToCondition(rule.pattern),
      });
    }
  }

  const excluded = Array.isArray(state.excludedDomains) ? state.excludedDomains : [];
  excluded.forEach((pattern, index) => {
    if (!pattern) {
      return;
    }
    rules.push({
      id: EXCLUDE_RULE_ID_BASE + index,
      priority: 100,
      action: { type: 'allow' },
      condition: patternToCondition(pattern),
    });
  });

  return rules;
}

/**
 * Replace all HeaderForge dynamic DNR rules with a fresh set.
 *
 * @param {chrome.declarativeNetRequest.Rule[]} nextRules
 * @returns {Promise<void>}
 */
export async function applyDynamicRules(nextRules) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing
    .map((rule) => rule.id)
    .filter(
      (id) =>
        (id >= RULE_ID_BASE && id < RULE_ID_BASE + 5000) ||
        (id >= EXCLUDE_RULE_ID_BASE && id < EXCLUDE_RULE_ID_BASE + 5000),
    );

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: nextRules,
    });
  } catch (error) {
    const message = String(/** @type {any} */ (error)?.message ?? error);
    console.error('[HeaderForge] updateDynamicRules failed', message, nextRules);
    throw new Error(`Failed to apply network rules: ${message}`);
  }

  if (chrome.runtime.lastError) {
    throw new Error(chrome.runtime.lastError.message);
  }
}

/**
 * Count HeaderForge dynamic rules currently installed in Chrome.
 *
 * @returns {Promise<number>}
 */
export async function getInstalledRuleCount() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  return existing.filter(
    (rule) =>
      (rule.id >= RULE_ID_BASE && rule.id < RULE_ID_BASE + 5000) ||
      (rule.id >= EXCLUDE_RULE_ID_BASE && rule.id < EXCLUDE_RULE_ID_BASE + 5000),
  ).length;
}

/**
 * Sync DNR rules from application state.
 *
 * @param {import('../storage/profiles.js').AppState} state
 * @returns {Promise<{ ruleCount: number, installedCount: number }>}
 */
export async function syncRulesFromState(state) {
  const rules = buildDynamicRules(state);
  await applyDynamicRules(rules);
  const installedCount = await getInstalledRuleCount();
  return { ruleCount: rules.length, installedCount };
}

/**
 * Request access to all http(s) sites.
 *
 * @returns {Promise<boolean>}
 */
export async function ensureAllSitesPermissions() {
  const already = await chrome.permissions.contains({ origins: [...ALL_SITES_ORIGINS] });
  if (already) {
    return true;
  }

  // When host_permissions are required in the manifest, contains() is true after install.
  // Still attempt request for older installs that used optional permissions only.
  try {
    return await chrome.permissions.request({ origins: [...ALL_SITES_ORIGINS] });
  } catch {
    return chrome.permissions.contains({ origins: [...ALL_SITES_ORIGINS] });
  }
}

/**
 * Whether all-sites host access is already granted.
 *
 * @returns {Promise<boolean>}
 */
export async function hasAllSitesPermissions() {
  return chrome.permissions.contains({ origins: [...ALL_SITES_ORIGINS] });
}

/**
 * Request optional host permissions for the active profile / mode.
 *
 * @param {import('../utils/validate.js').Profile | null | undefined} profile
 * @param {{ applyToAllSites?: boolean }} [options]
 * @returns {Promise<boolean>}
 */
export async function ensureHostPermissions(profile, options = {}) {
  if (options.applyToAllSites) {
    return ensureAllSitesPermissions();
  }

  const origins = collectHostPermissions(profile);

  if (origins.length === 0) {
    return true;
  }

  const already = await chrome.permissions.contains({ origins });

  if (already) {
    return true;
  }

  return chrome.permissions.request({ origins });
}

/**
 * Request host access for a single domain pattern.
 *
 * @param {string} pattern
 * @returns {Promise<boolean>}
 */
export async function ensureHostPermissionForPattern(pattern) {
  const origins = patternToHostPermissions(pattern);

  if (origins.length === 0) {
    return true;
  }

  const already = await chrome.permissions.contains({ origins });
  if (already) {
    return true;
  }

  return chrome.permissions.request({ origins });
}

/**
 * Check whether the extension already has host access for a pattern.
 *
 * @param {string} pattern
 * @returns {Promise<boolean>}
 */
export async function hasHostPermissionForPattern(pattern) {
  const origins = patternToHostPermissions(pattern);
  if (origins.length === 0) {
    return true;
  }
  return chrome.permissions.contains({ origins });
}
