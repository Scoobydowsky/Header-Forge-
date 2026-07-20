/**
 * Lightweight toast notifications.
 */

/** @type {HTMLElement | null} */
let container = null;

/**
 * Ensure a toast container exists in the document.
 *
 * @returns {HTMLElement}
 */
function getContainer() {
  if (container && document.body.contains(container)) {
    return container;
  }

  container = document.createElement('div');
  container.className = 'hf-toast-container';
  container.setAttribute('aria-live', 'polite');
  document.body.appendChild(container);
  return container;
}

/**
 * Show a toast message.
 *
 * @param {string} message
 * @param {'success' | 'error' | 'info'} [type='success']
 * @param {number} [durationMs=2200]
 * @returns {void}
 */
export function showToast(message, type = 'success', durationMs = 2200) {
  const host = getContainer();
  const toast = document.createElement('div');
  toast.className = `hf-toast hf-toast--${type}`;
  toast.textContent = message;
  host.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('hf-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('hf-toast--visible');
    setTimeout(() => toast.remove(), 200);
  }, durationMs);
}
