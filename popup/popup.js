/**
 * HeaderForge popup — live header editor + profile switcher.
 * Target: paint useful UI under 100ms after open.
 */

import { $, el } from '../utils/dom.js';
import { showToast } from '../utils/toast.js';
import { createId } from '../utils/id.js';
import { normalizeHeaderName, validateHeader } from '../utils/validate.js';
import {
  HEADER_NAME_DATALIST_ID,
  autocompleteHeaderName,
  ensureHeaderNameDatalist,
} from '../utils/header-names.js';
import { hostnameFromUrl, hostnameMatchesPattern, isHostnameExcluded, matchingRulesForHost } from '../utils/match.js';
import {
  getCounters,
  loadState,
  saveState,
  searchProfiles,
  touchRecent,
} from '../storage/profiles.js';
import {
  ensureHostPermissionForPattern,
  ensureHostPermissions,
  getInstalledRuleCount,
  hasAllSitesPermissions,
  hasHostPermissionForPattern,
  syncRulesFromState,
} from '../rules/rules.js';

/** @type {import('../storage/profiles.js').AppState | null} */
let state = null;

/** @type {'headers' | 'profiles'} */
let activeView = 'headers';

/** @type {string | null} */
let currentHostname = null;

/**
 * Send a message to the service worker.
 *
 * @param {object} message
 * @returns {Promise<any>}
 */
function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

/**
 * Open the options page, optionally with a hash tab.
 *
 * @param {string} [hash='']
 * @returns {void}
 */
function openOptions(hash = '') {
  const url = chrome.runtime.getURL(`options/options.html${hash}`);
  chrome.tabs.create({ url });
}

/**
 * Active profile helper.
 *
 * @returns {import('../utils/validate.js').Profile | null}
 */
function activeProfile() {
  if (!state) {
    return null;
  }

  return state.profiles.find((item) => item.id === state?.activeProfileId) ?? null;
}

/**
 * Persist state and sync DNR rules immediately.
 *
 * @param {import('../storage/profiles.js').AppState} next
 * @returns {Promise<void>}
 */
async function commit(next) {
  state = await saveState(next);
  await syncRulesFromState(state);
  await sendMessage({ type: 'SYNC_RULES' });
}

/**
 * Patch the active profile.
 *
 * @param {(profile: import('../utils/validate.js').Profile) => import('../utils/validate.js').Profile} updater
 * @returns {Promise<import('../utils/validate.js').Profile | null>}
 */
async function updateActiveProfile(updater) {
  if (!state) {
    return null;
  }

  const profileId = state.activeProfileId;
  if (!profileId) {
    return null;
  }

  const next = {
    ...state,
    profiles: state.profiles.map((profile) =>
      profile.id === profileId ? { ...updater(profile), updatedAt: Date.now() } : profile,
    ),
  };

  await commit(next);
  return activeProfile();
}

/**
 * Render counter badges for the active profile.
 *
 * @returns {void}
 */
function renderCounters() {
  if (!state) {
    return;
  }

  const counters = getCounters(state);
  const host = /** @type {HTMLElement} */ ($('#counters'));
  host.replaceChildren(
    el('span', { className: 'hf-badge' }, [
      el('strong', { text: String(counters.activeHeaders) }),
      ' headers',
    ]),
    el('span', { className: 'hf-badge' }, [
      el('strong', { text: String(counters.domains) }),
      ' domains',
    ]),
    el('span', { className: 'hf-badge' }, [
      el('strong', { text: String(counters.profiles) }),
      ' profiles',
    ]),
  );
}

/**
 * Render active profile summary.
 *
 * @returns {void}
 */
function renderActive() {
  if (!state) {
    return;
  }

  const profile = activeProfile();
  const nameEl = /** @type {HTMLElement} */ ($('#active-name'));
  const colorEl = /** @type {HTMLElement} */ ($('#active-color'));
  const toggle = /** @type {HTMLInputElement} */ ($('#toggle-enabled'));
  const root = /** @type {HTMLElement} */ ($('.popup'));

  nameEl.textContent = profile?.name ?? 'Default';
  toggle.checked = state.enabled;
  root.classList.toggle('is-disabled', !state.enabled);

  const labelEl = /** @type {HTMLElement | null} */ ($('#active-label'));
  if (labelEl) {
    labelEl.textContent = state.profiles.length > 1 ? 'Active profile' : 'Workspace';
  }

  if (profile?.color) {
    colorEl.hidden = false;
    colorEl.className = `hf-label hf-label--${profile.color}`;
    colorEl.textContent = profile.color;
  } else {
    colorEl.hidden = true;
  }

  const status = /** @type {HTMLElement} */ ($('#status-text'));
  status.textContent = state.enabled ? 'Live · changes apply now' : 'Paused';
}

/**
 * Refresh footer with installed DNR rule count (actual Chrome rules).
 *
 * @returns {Promise<void>}
 */
async function renderRuleHealth() {
  const status = /** @type {HTMLElement} */ ($('#status-text'));
  if (!state?.enabled) {
    status.textContent = 'Paused';
    return;
  }

  try {
    const installed = await getInstalledRuleCount();
    if (installed === 0) {
      status.textContent = 'No DNR rules installed — sync failed';
      return;
    }
    status.textContent = `Live · ${installed} network rule(s)`;
  } catch {
    status.textContent = 'Live · could not read rules';
  }
}

/**
 * Render match status for the current browser tab.
 *
 * @returns {Promise<void>}
 */
async function renderSiteStatus() {
  const box = /** @type {HTMLElement} */ ($('#site-status'));
  const scopeToggle = /** @type {HTMLInputElement} */ ($('#toggle-all-sites'));
  const profile = activeProfile();

  if (scopeToggle) {
    scopeToggle.checked = Boolean(state?.applyToAllSites);
  }

  if (state?.applyToAllSites) {
    box.hidden = false;
    const allowed = await hasAllSitesPermissions();
    const excluded = isHostnameExcluded(currentHostname, state.excludedDomains ?? []);

    if (!state.enabled) {
      box.className = 'popup__site popup__site--warn';
      box.replaceChildren(
        el('div', { className: 'popup__site-copy' }, [
          el('strong', { text: 'Extension paused' }),
          el('span', { text: 'Turn on the switch to modify headers on all sites.' }),
        ]),
      );
      return;
    }

    if (!allowed) {
      box.className = 'popup__site popup__site--warn';
      const grantBtn = el('button', {
        className: 'hf-btn hf-btn--primary',
        type: 'button',
        text: 'Allow all sites',
      });
      grantBtn.addEventListener('click', () => {
        setApplyToAllSites(true).catch(handleError);
      });
      box.replaceChildren(
        el('div', { className: 'popup__site-copy' }, [
          el('strong', { text: 'Permission needed' }),
          el('span', { text: 'Chrome must grant access to http/https sites once.' }),
        ]),
        grantBtn,
      );
      return;
    }

    if (currentHostname && excluded) {
      box.className = 'popup__site popup__site--ok';
      const includeBtn = el('button', {
        className: 'hf-btn',
        type: 'button',
        text: 'Include site',
      });
      includeBtn.addEventListener('click', () => {
        removeExcludedHost(currentHostname).catch(handleError);
      });
      box.replaceChildren(
        el('div', { className: 'popup__site-copy' }, [
          el('strong', { text: 'Excluded — headers not applied' }),
          el('span', {
            text: `${currentHostname} is on the exclude list (protects music/streaming).`,
          }),
        ]),
        includeBtn,
      );
      return;
    }

    box.className = 'popup__site popup__site--ok';
    const actions = [];
    if (currentHostname) {
      const excludeBtn = el('button', {
        className: 'hf-btn',
        type: 'button',
        text: 'Exclude site',
      });
      excludeBtn.addEventListener('click', () => {
        addExcludedHost(currentHostname).catch(handleError);
      });
      actions.push(excludeBtn);
    }

    const danger = profileHasRiskyGlobalHeaders(activeProfile());
    box.replaceChildren(
      el('div', { className: 'popup__site-copy' }, [
        el('strong', { text: danger ? 'Applying on all sites (careful)' : 'Applying on all sites' }),
        el('span', {
          text: danger
            ? 'Accept/Authorization on all sites can break YouTube Music, Spotify, etc. Exclude those sites or turn headers off.'
            : currentHostname
              ? `Including ${currentHostname}. Use Exclude site if something breaks.`
              : 'Use Exclude site on apps that break (music, banking, etc.).',
        }),
      ]),
      ...actions,
    );
    return;
  }

  if (!currentHostname) {
    box.hidden = true;
    box.replaceChildren();
    return;
  }

  box.hidden = false;

  const matches = matchingRulesForHost(profile, currentHostname);
  const hasRule = matches.length > 0;
  const hasPermission = hasRule
    ? await hasHostPermissionForPattern(matches[0].pattern)
    : await hasHostPermissionForPattern(currentHostname);

  if (!state?.enabled) {
    box.className = 'popup__site popup__site--warn';
    box.replaceChildren(
      el('div', { className: 'popup__site-copy' }, [
        el('strong', { text: 'Extension paused' }),
        el('span', { text: `On ${currentHostname} — turn on the switch to modify headers.` }),
      ]),
    );
    return;
  }

  if (hasRule && hasPermission) {
    box.className = 'popup__site popup__site--ok';
    box.replaceChildren(
      el('div', { className: 'popup__site-copy' }, [
        el('strong', { text: 'Applying on this site' }),
        el('span', {
          text: `${currentHostname} matches rule “${matches[0].pattern}”. Refresh the page to verify.`,
        }),
      ]),
    );
    return;
  }

  if (hasRule && !hasPermission) {
    box.className = 'popup__site popup__site--warn';
    const grantBtn = el('button', {
      className: 'hf-btn hf-btn--primary',
      type: 'button',
      text: 'Allow access',
    });
    grantBtn.addEventListener('click', () => {
      grantAccessForHost(matches[0].pattern).catch(handleError);
    });
    box.replaceChildren(
      el('div', { className: 'popup__site-copy' }, [
        el('strong', { text: 'Permission needed' }),
        el('span', { text: `Rule exists for ${currentHostname}, but Chrome blocked host access.` }),
      ]),
      grantBtn,
    );
    return;
  }

  box.className = 'popup__site popup__site--warn';
  const addBtn = el('button', {
    className: 'hf-btn hf-btn--primary',
    type: 'button',
    text: 'Add this site',
  });
  addBtn.addEventListener('click', () => {
    addCurrentSite().catch(handleError);
  });
  box.replaceChildren(
    el('div', { className: 'popup__site-copy' }, [
      el('strong', { text: 'Not in domain rules' }),
      el('span', {
        text: `${currentHostname} is not covered. Enable “All sites” or add this domain.`,
      }),
    ]),
    addBtn,
  );
}

/**
 * Toggle global all-sites mode.
 *
 * @param {boolean} applyToAllSites
 * @returns {Promise<void>}
 */
async function setApplyToAllSites(applyToAllSites) {
  if (!state) {
    return;
  }

  if (applyToAllSites) {
    const granted = await ensureHostPermissions(activeProfile(), { applyToAllSites: true });
    if (!granted) {
      showToast('All-sites access denied by Chrome.', 'error');
      const toggle = /** @type {HTMLInputElement} */ ($('#toggle-all-sites'));
      toggle.checked = false;
      return;
    }
  }

  await commit({ ...state, applyToAllSites });
  renderAll();
  showToast(applyToAllSites ? 'All sites mode on' : 'Domain rules mode on', 'info');
}

/**
 * Detect headers that often break streaming / consumer sites when applied globally.
 *
 * @param {import('../utils/validate.js').Profile | null} profile
 * @returns {boolean}
 */
function profileHasRiskyGlobalHeaders(profile) {
  if (!profile) {
    return false;
  }

  return profile.headers.some((header) => {
    if (!header.enabled) {
      return false;
    }
    const name = header.name.toLowerCase();
    const value = header.value.toLowerCase();
    if (name === 'authorization') {
      return true;
    }
    if (name === 'accept' && value.includes('application/json')) {
      return true;
    }
    return false;
  });
}

/**
 * Add a host to the exclude list (All sites bypass).
 *
 * @param {string} hostname
 * @returns {Promise<void>}
 */
async function addExcludedHost(hostname) {
  if (!state || !hostname) {
    return;
  }

  const host = hostname.toLowerCase();
  if (state.excludedDomains.some((pattern) => hostnameMatchesPattern(pattern, host))) {
    showToast('Already excluded', 'info');
    return;
  }

  await commit({
    ...state,
    excludedDomains: [...state.excludedDomains, host],
  });
  showToast(`Excluded ${host} — refresh the tab`);
}

/**
 * Remove matching exclude patterns for a host.
 *
 * @param {string} hostname
 * @returns {Promise<void>}
 */
async function removeExcludedHost(hostname) {
  if (!state || !hostname) {
    return;
  }

  const host = hostname.toLowerCase();
  await commit({
    ...state,
    excludedDomains: state.excludedDomains.filter(
      (pattern) => !hostnameMatchesPattern(pattern, host),
    ),
  });
  showToast(`Included ${host} again — refresh the tab`);
}

/**
 * Add the current tab hostname as an enabled domain rule and request access.
 *
 * @returns {Promise<void>}
 */
async function addCurrentSite() {
  if (!currentHostname || !activeProfile()) {
    return;
  }

  const host = currentHostname;
  const granted = await ensureHostPermissionForPattern(host);
  if (!granted) {
    showToast('Host access denied by Chrome.', 'error');
    return;
  }

  await updateActiveProfile((item) => {
    const exists = item.rules.some((rule) => rule.pattern === host);
    if (exists) {
      return {
        ...item,
        rules: item.rules.map((rule) =>
          rule.pattern === host ? { ...rule, enabled: true } : rule,
        ),
      };
    }

    return {
      ...item,
      rules: [
        ...item.rules,
        {
          id: createId(),
          pattern: host,
          enabled: true,
        },
      ],
    };
  });

  renderAll();
  showToast(`Added ${host} — refresh the page`);
}

/**
 * Request host access for an existing rule pattern.
 *
 * @param {string} pattern
 * @returns {Promise<void>}
 */
async function grantAccessForHost(pattern) {
  const granted = await ensureHostPermissionForPattern(pattern);
  if (!granted) {
    showToast('Host access denied by Chrome.', 'error');
    return;
  }
  await syncRulesFromState(state);
  await sendMessage({ type: 'SYNC_RULES' });
  renderAll();
  showToast('Access granted — refresh the page');
}

/**
 * Switch popup view.
 *
 * @param {'headers' | 'profiles'} view
 * @returns {void}
 */
function setView(view) {
  activeView = view;

  document.querySelectorAll('.popup__tab').forEach((node) => {
    const btn = /** @type {HTMLElement} */ (node);
    btn.classList.toggle('is-active', btn.dataset.view === view);
  });

  document.querySelectorAll('.popup__view').forEach((node) => {
    const panel = /** @type {HTMLElement} */ (node);
    const on = panel.id === `view-${view}`;
    panel.classList.toggle('is-active', on);
    panel.hidden = !on;
  });
}

/**
 * Render live headers for the active profile.
 *
 * @returns {void}
 */
function renderLiveHeaders() {
  const host = /** @type {HTMLElement} */ ($('#live-headers'));
  const profile = activeProfile();

  if (!profile) {
    host.replaceChildren(el('div', { className: 'hf-empty', text: 'No active profile.' }));
    return;
  }

  if (profile.headers.length === 0) {
    host.replaceChildren(
      el('div', {
        className: 'hf-empty',
        text: 'No headers yet. Add one below — it applies immediately.',
      }),
    );
    return;
  }

  host.replaceChildren(
    ...profile.headers.map((header) => {
      const row = el('div', {
        className: `popup__header-row${header.enabled ? '' : ' is-off'}`,
      });

      const toggle = /** @type {HTMLInputElement} */ (
        el('input', {
          type: 'checkbox',
          title: 'Enable header',
          'aria-label': `Toggle ${header.name}`,
        })
      );
      toggle.checked = header.enabled;
      toggle.addEventListener('change', () => {
        patchHeader(header.id, { enabled: toggle.checked }).catch(handleError);
      });

      const nameInput = /** @type {HTMLInputElement} */ (
        el('input', {
          className: 'hf-input hf-mono',
          type: 'text',
          value: header.name,
          list: HEADER_NAME_DATALIST_ID,
          spellcheck: 'false',
          autocomplete: 'off',
          title: 'Header name',
        })
      );
      nameInput.addEventListener('change', () => {
        const completed = autocompleteHeaderName(nameInput.value);
        nameInput.value = completed;
        patchHeader(header.id, { name: completed }).catch(handleError);
      });

      const valueInput = /** @type {HTMLInputElement} */ (
        el('input', {
          className: 'hf-input hf-mono',
          type: 'text',
          value: header.value,
          spellcheck: 'false',
          title: 'Header value',
          placeholder: header.operation === 'REMOVE' ? '(remove)' : 'value',
          disabled: header.operation === 'REMOVE' ? 'true' : undefined,
        })
      );
      valueInput.addEventListener('change', () => {
        patchHeader(header.id, { value: valueInput.value }).catch(handleError);
      });

      const del = el('button', {
        className: 'hf-btn hf-btn--danger hf-btn--icon',
        type: 'button',
        text: '×',
        title: 'Delete header',
      });
      del.addEventListener('click', () => {
        deleteHeader(header.id).catch(handleError);
      });

      row.append(toggle, nameInput, valueInput, del);
      return row;
    }),
  );
}

/**
 * Render recent profile chips.
 *
 * @returns {void}
 */
function renderRecent() {
  if (!state) {
    return;
  }

  const host = /** @type {HTMLElement} */ ($('#recent'));
  // Profiles are optional — hide quick chips when there's only one workspace.
  if (state.profiles.length <= 1) {
    host.replaceChildren();
    return;
  }

  const recent = state.recentProfileIds
    .map((id) => state?.profiles.find((profile) => profile.id === id))
    .filter(Boolean)
    .slice(0, 4);

  host.replaceChildren(
    ...recent.map((profile) => {
      const btn = el(
        'button',
        {
          className: `popup__chip${profile.id === state?.activeProfileId ? ' popup__chip--active' : ''}`,
          type: 'button',
          'data-id': profile.id,
        },
        [profile.name],
      );
      btn.addEventListener('click', () => activateProfile(profile.id));
      return btn;
    }),
  );
}

/**
 * Render the searchable profile list.
 *
 * @param {string} [query='']
 * @returns {void}
 */
function renderList(query = '') {
  if (!state) {
    return;
  }

  const host = /** @type {HTMLElement} */ ($('#profile-list'));
  const profiles = searchProfiles(state, query);

  if (profiles.length === 0) {
    host.replaceChildren(el('div', { className: 'hf-empty', text: 'No profiles match your search.' }));
    return;
  }

  host.replaceChildren(
    ...profiles.map((profile) => {
      const enabledHeaders = profile.headers.filter((header) => header.enabled).length;
      const enabledRules = profile.rules.filter((rule) => rule.enabled).length;
      const isActive = profile.id === state?.activeProfileId;

      const button = el('button', {
        className: `popup__item${isActive ? ' popup__item--active' : ''}`,
        type: 'button',
        role: 'option',
        'aria-selected': isActive ? 'true' : 'false',
        'data-id': profile.id,
      });

      const titleChildren = [el('span', { text: profile.name })];
      if (profile.color) {
        titleChildren.push(
          el('span', { className: `hf-label hf-label--${profile.color}`, text: profile.color }),
        );
      }

      button.append(
        el('div', { className: 'popup__item-main' }, [
          el('div', { className: 'popup__item-title' }, titleChildren),
          el('div', {
            className: 'popup__item-meta',
            text: `${enabledHeaders} headers · ${enabledRules} domains`,
          }),
        ]),
      );

      button.addEventListener('click', () => activateProfile(profile.id));
      return button;
    }),
  );
}

/**
 * @param {string} headerId
 * @param {Partial<import('../utils/validate.js').HeaderEntry>} patch
 * @returns {Promise<void>}
 */
async function patchHeader(headerId, patch) {
  const profile = activeProfile();
  if (!profile) {
    return;
  }

  const current = profile.headers.find((header) => header.id === headerId);
  if (!current) {
    return;
  }

  const merged = {
    ...current,
    ...patch,
    name: patch.name !== undefined ? normalizeHeaderName(patch.name) : current.name,
  };

  const check = validateHeader(merged);
  if (!check.valid) {
    showToast(check.error ?? 'Invalid header', 'error');
    renderLiveHeaders();
    return;
  }

  await updateActiveProfile((item) => ({
    ...item,
    headers: item.headers.map((header) => (header.id === headerId ? merged : header)),
  }));

  renderAll();
  showToast('Updated');
}

/**
 * @param {string} headerId
 * @returns {Promise<void>}
 */
async function deleteHeader(headerId) {
  await updateActiveProfile((item) => ({
    ...item,
    headers: item.headers.filter((header) => header.id !== headerId),
  }));
  renderAll();
  showToast('Header deleted');
}

/**
 * Add a header to the active profile from the quick form.
 *
 * @returns {Promise<void>}
 */
async function addQuickHeader() {
  const nameInput = /** @type {HTMLInputElement} */ ($('#quick-name'));
  const valueInput = /** @type {HTMLInputElement} */ ($('#quick-value'));

  const header = {
    id: createId(),
    name: normalizeHeaderName(autocompleteHeaderName(nameInput.value)),
    value: valueInput.value,
    operation: /** @type {const} */ ('SET'),
    enabled: true,
  };

  const check = validateHeader(header);
  if (!check.valid) {
    showToast(check.error ?? 'Invalid header', 'error');
    return;
  }

  await updateActiveProfile((item) => ({
    ...item,
    headers: [...item.headers, header],
  }));

  nameInput.value = '';
  valueInput.value = '';
  nameInput.focus();
  renderAll();
  showToast('Header added');
}

/**
 * Activate a profile and sync DNR rules.
 *
 * @param {string} profileId
 * @returns {Promise<void>}
 */
async function activateProfile(profileId) {
  if (!state) {
    return;
  }

  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile) {
    return;
  }

  const granted = await ensureHostPermissions(profile, {
    applyToAllSites: state.applyToAllSites,
  });
  if (!granted) {
    showToast('Host permission required for this profile’s domains.', 'error');
  }

  state = touchRecent({ ...state, activeProfileId: profileId }, profileId);
  await commit(state);

  setView('headers');
  renderAll();
  showToast(`Switched to ${profile.name}`);
}

/**
 * Toggle global enable flag.
 *
 * @param {boolean} enabled
 * @returns {Promise<void>}
 */
async function setEnabled(enabled) {
  if (!state) {
    return;
  }

  if (enabled) {
    const profile = activeProfile();
    const granted = await ensureHostPermissions(profile, {
      applyToAllSites: state.applyToAllSites,
    });
    if (!granted) {
      showToast('Host permission required to enable HeaderForge.', 'error');
      const toggle = /** @type {HTMLInputElement} */ ($('#toggle-enabled'));
      toggle.checked = false;
      return;
    }
  }

  await commit({ ...state, enabled });
  renderAll();
  showToast(enabled ? 'HeaderForge enabled' : 'HeaderForge paused', 'info');
}

/**
 * Re-render the entire popup.
 *
 * @param {string} [query]
 * @returns {void}
 */
function renderAll(query) {
  const search = /** @type {HTMLInputElement | null} */ ($('#search'));
  const q = query ?? search?.value ?? '';
  renderActive();
  renderCounters();
  renderLiveHeaders();
  renderRecent();
  renderList(q);
  setView(activeView);
  renderSiteStatus().catch(handleError);
  renderRuleHealth().catch(handleError);
}

/**
 * @param {unknown} error
 * @returns {void}
 */
function handleError(error) {
  console.error('[HeaderForge popup]', error);
  showToast(String(/** @type {any} */ (error)?.message ?? error), 'error');
}

/**
 * Wire UI events once.
 *
 * @returns {void}
 */
function bindEvents() {
  const toggle = /** @type {HTMLInputElement} */ ($('#toggle-enabled'));
  const search = /** @type {HTMLInputElement} */ ($('#search'));

  toggle.addEventListener('change', () => {
    setEnabled(toggle.checked).catch(handleError);
  });

  $('#toggle-all-sites')?.addEventListener('change', (event) => {
    const checked = /** @type {HTMLInputElement} */ (event.target).checked;
    setApplyToAllSites(checked).catch(handleError);
  });

  search.addEventListener('input', () => renderList(search.value));

  document.querySelectorAll('.popup__tab').forEach((node) => {
    node.addEventListener('click', () => {
      const view = /** @type {'headers' | 'profiles'} */ (
        /** @type {HTMLElement} */ (node).dataset.view
      );
      setView(view);
    });
  });

  $('#add-header-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    addQuickHeader().catch(handleError);
  });

  $('#open-options')?.addEventListener('click', () => openOptions());
  $('#open-headers')?.addEventListener('click', () => openOptions('#headers'));
  $('#manage')?.addEventListener('click', () => openOptions('#profiles'));

  document.addEventListener('keydown', (event) => {
    const meta = event.ctrlKey || event.metaKey;

    if (meta && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      setView('profiles');
      search.focus();
      search.select();
    }

    if (meta && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      setEnabled(!toggle.checked).catch(() => undefined);
    }
  });
}

/**
 * Bootstrap popup.
 *
 * @returns {Promise<void>}
 */
async function init() {
  ensureHeaderNameDatalist();
  bindEvents();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentHostname = hostnameFromUrl(tab?.url);

  state = await loadState();

  // Force re-apply DNR rules every popup open (permissions/rules can go stale).
  try {
    const result = await syncRulesFromState(state);
    if (result.installedCount === 0 && state.enabled) {
      showToast('Network rules not installed. Try toggling the extension off/on.', 'error');
    }
  } catch (error) {
    handleError(error);
  }

  renderAll();
}

init().catch((error) => {
  handleError(error);
});
