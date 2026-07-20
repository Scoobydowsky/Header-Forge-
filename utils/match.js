/**
 * Domain / URL matching helpers (offline, no Chrome APIs).
 */

/**
 * Check whether a hostname matches a HeaderForge domain pattern.
 * Supports exact hosts, IPs, localhost, *.example.com, and bare domains
 * (example.com also matches api.example.com — same as DNR ||example.com^).
 *
 * @param {string} pattern
 * @param {string} hostname
 * @returns {boolean}
 */
export function hostnameMatchesPattern(pattern, hostname) {
  const rule = String(pattern ?? '').trim().toLowerCase();
  const host = String(hostname ?? '').trim().toLowerCase();

  if (!rule || !host) {
    return false;
  }

  if (rule.startsWith('*.')) {
    const root = rule.slice(2);
    return host === root || host.endsWith(`.${root}`);
  }

  return host === rule || host.endsWith(`.${rule}`);
}

/**
 * Whether a hostname is covered by any excluded domain pattern.
 *
 * @param {string | null | undefined} hostname
 * @param {string[]} excludedDomains
 * @returns {boolean}
 */
export function isHostnameExcluded(hostname, excludedDomains) {
  if (!hostname || !Array.isArray(excludedDomains)) {
    return false;
  }

  return excludedDomains.some((pattern) => hostnameMatchesPattern(pattern, hostname));
}

/**
 * Find enabled domain rules on a profile that match a hostname.
 *
 * @param {import('./validate.js').Profile | null | undefined} profile
 * @param {string} hostname
 * @returns {import('./validate.js').DomainRule[]}
 */
export function matchingRulesForHost(profile, hostname) {
  if (!profile) {
    return [];
  }

  return profile.rules.filter(
    (rule) => rule.enabled && hostnameMatchesPattern(rule.pattern, hostname),
  );
}

/**
 * Extract hostname from a tab URL when possible.
 *
 * @param {string | undefined} url
 * @returns {string | null}
 */
export function hostnameFromUrl(url) {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return null;
  }

  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
