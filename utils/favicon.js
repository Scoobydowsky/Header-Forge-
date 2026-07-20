/**
 * Offline domain mark (no network favicon fetch).
 * Generates a deterministic SVG data-URI from the host pattern.
 */

/**
 * Simple string hash to a hue.
 *
 * @param {string} input
 * @returns {number}
 */
function hashHue(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

/**
 * Pick a short label from a domain pattern.
 *
 * @param {string} pattern
 * @returns {string}
 */
function domainLabel(pattern) {
  const cleaned = String(pattern ?? '')
    .replace(/^\*\./, '')
    .replace(/^www\./, '');
  const first = cleaned.split('.')[0] || '?';
  return first.slice(0, 2).toUpperCase();
}

/**
 * Build a data-URI SVG "favicon" for a domain rule.
 *
 * @param {string} pattern
 * @param {number} [size=16]
 * @returns {string}
 */
export function domainFaviconDataUri(pattern, size = 16) {
  const hue = hashHue(String(pattern).toLowerCase());
  const label = domainLabel(pattern);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.max(2, size * 0.2)}" fill="hsl(${hue} 42% 38%)"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
    font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
    font-size="${Math.max(7, size * 0.45)}" font-weight="700" fill="#f4f7f6">${label}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
