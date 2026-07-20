/**
 * Lightweight DOM helpers (no external libraries).
 */

/**
 * Query a single element.
 *
 * @template {Element} T
 * @param {string} selector
 * @param {ParentNode} [root=document]
 * @returns {T | null}
 */
export function $(selector, root = document) {
  return /** @type {T | null} */ (root.querySelector(selector));
}

/**
 * Query all matching elements.
 *
 * @template {Element} T
 * @param {string} selector
 * @param {ParentNode} [root=document]
 * @returns {T[]}
 */
export function $$(selector, root = document) {
  return /** @type {T[]} */ ([...root.querySelectorAll(selector)]);
}

/**
 * Create an element with optional props and children.
 *
 * @param {string} tag
 * @param {Record<string, string | boolean | number | null | undefined>} [attrs]
 * @param {(Node | string)[]} [children]
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) {
      continue;
    }

    if (key === 'className') {
      node.className = String(value);
      continue;
    }

    if (key === 'text') {
      node.textContent = String(value);
      continue;
    }

    if (key.startsWith('on') && typeof value === 'string') {
      continue;
    }

    if (value === true) {
      node.setAttribute(key, '');
      continue;
    }

    node.setAttribute(key, String(value));
  }

  for (const child of children) {
    if (typeof child === 'string') {
      node.appendChild(document.createTextNode(child));
    } else {
      node.appendChild(child);
    }
  }

  return node;
}

/**
 * Escape HTML special characters.
 *
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Debounce a function.
 *
 * @template {(...args: any[]) => void} F
 * @param {F} fn
 * @param {number} waitMs
 * @returns {F}
 */
export function debounce(fn, waitMs) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;

  return /** @type {F} */ (
    (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), waitMs);
    }
  );
}
