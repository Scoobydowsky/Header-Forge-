/**
 * HeaderForge options page — full configuration UI.
 */

import { $, el } from '../utils/dom.js';
import { showToast } from '../utils/toast.js';
import { createId } from '../utils/id.js';
import { domainFaviconDataUri } from '../utils/favicon.js';
import {
  COLOR_LABELS,
  HEADER_OPERATIONS,
  normalizeHeaderName,
  validateDomainPattern,
  validateHeader,
  validateProfileName,
} from '../utils/validate.js';
import {
  HEADER_NAME_DATALIST_ID,
  autocompleteHeaderName,
  ensureHeaderNameDatalist,
} from '../utils/header-names.js';
import {
  buildExportDocument,
  cloneProfile,
  createEmptyProfile,
  getCounters,
  loadState,
  mergeImportedProfiles,
  parseImportDocument,
  restoreFromBackup,
  saveState,
  searchProfiles,
  touchRecent,
  updateState,
} from '../storage/profiles.js';
import { ensureHostPermissions, syncRulesFromState } from '../rules/rules.js';

/** @type {import('../storage/profiles.js').AppState | null} */
let state = null;

/** @type {string | null} */
let selectedProfileId = null;

/** @type {'profiles' | 'headers' | 'rules' | 'import' | 'export' | 'about'} */
let activeTab = 'headers';

/** @type {string} */
let searchQuery = '';

const TAB_COPY = {
  profiles: {
    title: 'Profiles',
    subtitle: 'Optional. Use separate profiles only if you need DEV / QA / PROD setups.',
  },
  headers: {
    title: 'Headers',
    subtitle: 'Add and edit request headers for the current workspace.',
  },
  rules: {
    title: 'Rules',
    subtitle: 'Optional domain limits. Ignored while All sites mode is on.',
  },
  import: {
    title: 'Import',
    subtitle: 'Import profiles from a HeaderForge JSON export. Everything stays local.',
  },
  export: {
    title: 'Export',
    subtitle: 'Download your configuration as JSON for backup or sharing.',
  },
  about: {
    title: 'About',
    subtitle: 'Privacy, architecture, and roadmap.',
  },
};

/**
 * Persist state and sync declarativeNetRequest rules.
 *
 * @param {import('../storage/profiles.js').AppState} next
 * @returns {Promise<void>}
 */
async function commit(next) {
  state = await saveState(next);
  await syncRulesFromState(state);
  render();
}

/**
 * Get the currently selected profile.
 *
 * @returns {import('../utils/validate.js').Profile | null}
 */
function selectedProfile() {
  if (!state) {
    return null;
  }

  return state.profiles.find((profile) => profile.id === selectedProfileId) ?? null;
}

/**
 * Replace a profile in state by id.
 *
 * @param {string} profileId
 * @param {(profile: import('../utils/validate.js').Profile) => import('../utils/validate.js').Profile} updater
 * @returns {import('../storage/profiles.js').AppState | null}
 */
function mapProfile(profileId, updater) {
  if (!state) {
    return null;
  }

  return {
    ...state,
    profiles: state.profiles.map((profile) =>
      profile.id === profileId ? { ...updater(profile), updatedAt: Date.now() } : profile,
    ),
  };
}

/**
 * Switch options tab.
 *
 * @param {typeof activeTab} tab
 * @returns {void}
 */
function setTab(tab) {
  activeTab = tab;
  location.hash = tab;
  render();
}

/**
 * Render sidebar counters and enable toggle.
 *
 * @returns {void}
 */
function renderSidebarMeta() {
  if (!state) {
    return;
  }

  const counters = getCounters(state);
  const host = /** @type {HTMLElement} */ ($('#sidebar-counters'));
  host.replaceChildren(
    el('span', { className: 'hf-badge' }, [el('strong', { text: String(counters.profiles) }), ' profiles']),
    el('span', { className: 'hf-badge' }, [
      el('strong', { text: String(counters.activeHeaders) }),
      ' active headers',
    ]),
    el('span', { className: 'hf-badge' }, [el('strong', { text: String(counters.domains) }), ' domains']),
  );

  const toggle = /** @type {HTMLInputElement} */ ($('#global-enabled'));
  toggle.checked = state.enabled;
}

/**
 * Render Profiles tab.
 *
 * @returns {void}
 */
function renderProfilesPanel() {
  if (!state) {
    return;
  }

  const panel = /** @type {HTMLElement} */ ($('#panel-profiles'));
  const profiles = searchProfiles(state, searchQuery);

  const toolbar = el('div', { className: 'toolbar' }, [
    el('button', { className: 'hf-btn hf-btn--primary', type: 'button', id: 'btn-new-profile', text: 'New profile' }),
  ]);

  const grid = el('div', { className: 'profile-grid' });

  if (profiles.length === 0) {
    grid.append(el('div', { className: 'hf-empty', text: 'No profiles found.' }));
  } else {
    for (const profile of profiles) {
      const isActive = profile.id === state.activeProfileId;
      const isSelected = profile.id === selectedProfileId;
      const card = el('div', {
        className: `profile-card${isSelected ? ' is-selected' : ''}`,
      });

      const color = profile.color
        ? el('span', { className: `hf-label hf-label--${profile.color}`, text: profile.color })
        : el('span');

      card.append(
        el('div', { className: 'profile-card__top' }, [
          el('div', {}, [
            el('h3', { className: 'profile-card__name', text: profile.name }),
            el('div', {
              className: 'profile-card__meta',
              text: `${profile.headers.length} headers · ${profile.rules.length} rules${isActive ? ' · active' : ''}`,
            }),
          ]),
          color,
        ]),
      );

      const nameField = el('input', {
        className: 'hf-input',
        type: 'text',
        value: profile.name,
        'data-profile-name': profile.id,
      });

      const colorSelect = el('select', {
        className: 'hf-select',
        'data-profile-color': profile.id,
      });
      for (const label of COLOR_LABELS) {
        const opt = el('option', {
          value: label,
          text: label || 'No label',
        });
        if (label === profile.color) {
          opt.setAttribute('selected', '');
        }
        colorSelect.append(opt);
      }

      card.append(
        el('div', { className: 'form-grid' }, [
          el('div', { className: 'field' }, [el('label', { text: 'Name' }), nameField]),
          el('div', { className: 'field' }, [el('label', { text: 'Color label' }), colorSelect]),
        ]),
      );

      const actions = el('div', { className: 'profile-card__actions' });
      const activateBtn = el('button', {
        className: 'hf-btn hf-btn--primary',
        type: 'button',
        text: isActive ? 'Active' : 'Activate',
        disabled: isActive ? 'true' : undefined,
        'data-activate': profile.id,
      });
      const selectBtn = el('button', {
        className: 'hf-btn',
        type: 'button',
        text: 'Edit',
        'data-select': profile.id,
      });
      const dupBtn = el('button', {
        className: 'hf-btn',
        type: 'button',
        text: 'Duplicate',
        'data-duplicate': profile.id,
      });
      const cloneBtn = el('button', {
        className: 'hf-btn',
        type: 'button',
        text: 'Clone',
        'data-clone': profile.id,
      });
      const delBtn = el('button', {
        className: 'hf-btn hf-btn--danger',
        type: 'button',
        text: 'Delete',
        'data-delete': profile.id,
      });

      actions.append(activateBtn, selectBtn, dupBtn, cloneBtn, delBtn);
      card.append(actions);
      grid.append(card);
    }
  }

  panel.replaceChildren(
    el('div', { className: 'card' }, [
      el('div', { className: 'card__head' }, [
        el('h2', { text: 'Profiles (optional)' }),
        el('span', { className: 'hf-muted', text: `${state.profiles.length} total` }),
      ]),
      el('div', { className: 'card__body' }, [
        el('p', {
          className: 'hf-muted',
          text: 'You can work with a single Default workspace. Create extra profiles only when you need separate environments.',
        }),
        toolbar,
        grid,
      ]),
    ]),
  );

  $('#btn-new-profile')?.addEventListener('click', () => {
    createProfile().catch(handleError);
  });

  panel.querySelectorAll('[data-activate]').forEach((node) => {
    node.addEventListener('click', () => {
      activateProfile(/** @type {HTMLElement} */ (node).dataset.activate ?? '').catch(handleError);
    });
  });

  panel.querySelectorAll('[data-select]').forEach((node) => {
    node.addEventListener('click', () => {
      selectedProfileId = /** @type {HTMLElement} */ (node).dataset.select ?? null;
      setTab('headers');
    });
  });

  panel.querySelectorAll('[data-duplicate]').forEach((node) => {
    node.addEventListener('click', () => {
      duplicateProfile(/** @type {HTMLElement} */ (node).dataset.duplicate ?? '', ' (copy)').catch(
        handleError,
      );
    });
  });

  panel.querySelectorAll('[data-clone]').forEach((node) => {
    node.addEventListener('click', () => {
      duplicateProfile(/** @type {HTMLElement} */ (node).dataset.clone ?? '', ' (clone)').catch(
        handleError,
      );
    });
  });

  panel.querySelectorAll('[data-delete]').forEach((node) => {
    node.addEventListener('click', () => {
      deleteProfile(/** @type {HTMLElement} */ (node).dataset.delete ?? '').catch(handleError);
    });
  });

  panel.querySelectorAll('[data-profile-name]').forEach((node) => {
    node.addEventListener('change', () => {
      const id = /** @type {HTMLElement} */ (node).dataset.profileName ?? '';
      const value = /** @type {HTMLInputElement} */ (node).value;
      renameProfile(id, value).catch(handleError);
    });
  });

  panel.querySelectorAll('[data-profile-color]').forEach((node) => {
    node.addEventListener('change', () => {
      const id = /** @type {HTMLElement} */ (node).dataset.profileColor ?? '';
      const value = /** @type {HTMLSelectElement} */ (node).value;
      recolorProfile(id, value).catch(handleError);
    });
  });
}

/**
 * Render Headers tab.
 *
 * @returns {void}
 */
function renderHeadersPanel() {
  if (!state) {
    return;
  }

  const panel = /** @type {HTMLElement} */ ($('#panel-headers'));
  const profile = selectedProfile();

  if (!profile) {
    panel.replaceChildren(
      el('div', {
        className: 'hf-empty',
        text: 'Select a profile on the Profiles tab first.',
      }),
    );
    return;
  }

  const query = searchQuery.trim().toLowerCase();
  const headers = profile.headers.filter((header) => {
    if (!query) {
      return true;
    }
    return (
      header.name.toLowerCase().includes(query) ||
      header.value.toLowerCase().includes(query) ||
      header.operation.toLowerCase().includes(query)
    );
  });

  const table = el('table', { className: 'table' });
  table.append(
    el('thead', {}, [
      el('tr', {}, [
        el('th', { text: 'On' }),
        el('th', { text: 'Name' }),
        el('th', { text: 'Value' }),
        el('th', { text: 'Operation' }),
        el('th', { text: '' }),
      ]),
    ]),
  );

  const tbody = el('tbody');

  if (headers.length === 0) {
    tbody.append(
      el('tr', {}, [
        el('td', { colspan: '5' }, [
          el('div', { className: 'hf-empty', text: 'No headers yet. Add one below.' }),
        ]),
      ]),
    );
  } else {
    for (const header of headers) {
      const row = el('tr', { className: header.enabled ? '' : 'is-disabled' });

      const toggle = el('input', {
        type: 'checkbox',
        'data-toggle-header': header.id,
      });
      if (header.enabled) {
        toggle.setAttribute('checked', '');
      }

      const nameInput = el('input', {
        className: 'hf-input hf-mono',
        type: 'text',
        value: header.name,
        list: HEADER_NAME_DATALIST_ID,
        'data-header-name': header.id,
        placeholder: 'X-Custom-Header',
        autocomplete: 'off',
        spellcheck: 'false',
      });

      const valueInput = el('input', {
        className: 'hf-input hf-mono',
        type: 'text',
        value: header.value,
        'data-header-value': header.id,
        placeholder: header.operation === 'REMOVE' ? '(not required)' : 'value',
        disabled: header.operation === 'REMOVE' ? 'true' : undefined,
      });

      const opSelect = el('select', {
        className: 'hf-select',
        'data-header-op': header.id,
      });
      for (const op of HEADER_OPERATIONS) {
        const opt = el('option', { value: op, text: op });
        if (op === header.operation) {
          opt.setAttribute('selected', '');
        }
        opSelect.append(opt);
      }

      const del = el('button', {
        className: 'hf-btn hf-btn--danger hf-btn--icon',
        type: 'button',
        text: '×',
        title: 'Delete header',
        'data-delete-header': header.id,
      });

      row.append(
        el('td', {}, [toggle]),
        el('td', {}, [nameInput]),
        el('td', {}, [valueInput]),
        el('td', {}, [opSelect]),
        el('td', {}, [del]),
      );
      tbody.append(row);
    }
  }

  table.append(tbody);

  const addRow = el('div', { className: 'form-grid form-grid--3' }, [
    el('div', { className: 'field' }, [
      el('label', { text: 'Name' }),
      el('input', {
        id: 'new-header-name',
        className: 'hf-input hf-mono',
        type: 'text',
        list: HEADER_NAME_DATALIST_ID,
        placeholder: 'Authorization',
        autocomplete: 'off',
        spellcheck: 'false',
      }),
    ]),
    el('div', { className: 'field' }, [
      el('label', { text: 'Value' }),
      el('input', {
        id: 'new-header-value',
        className: 'hf-input hf-mono',
        type: 'text',
        placeholder: 'Bearer …',
      }),
    ]),
    el('div', { className: 'field' }, [
      el('label', { text: 'Operation' }),
      (() => {
        const select = el('select', { id: 'new-header-op', className: 'hf-select' });
        for (const op of HEADER_OPERATIONS) {
          select.append(el('option', { value: op, text: op }));
        }
        /** @type {HTMLSelectElement} */ (select).value = 'SET';
        return select;
      })(),
    ]),
    el('button', {
      id: 'btn-add-header',
      className: 'hf-btn hf-btn--primary',
      type: 'button',
      text: 'Add header',
    }),
  ]);

  panel.replaceChildren(
    el('div', { className: 'card' }, [
      el('div', { className: 'card__head' }, [
        el('h2', { text: `Headers — ${profile.name}` }),
        el('span', {
          className: 'hf-muted',
          text: `${profile.headers.filter((h) => h.enabled).length} active / ${profile.headers.length}`,
        }),
      ]),
      el('div', { className: 'card__body' }, [
        addRow,
        el('div', { style: 'height:16px' }),
        table,
      ]),
    ]),
  );

  $('#btn-add-header')?.addEventListener('click', () => addHeader().catch(handleError));

  panel.querySelectorAll('[data-toggle-header]').forEach((node) => {
    node.addEventListener('change', () => {
      const id = /** @type {HTMLElement} */ (node).dataset.toggleHeader ?? '';
      const enabled = /** @type {HTMLInputElement} */ (node).checked;
      patchHeader(id, { enabled }).catch(handleError);
    });
  });

  panel.querySelectorAll('[data-header-name]').forEach((node) => {
    node.addEventListener('change', () => {
      const id = /** @type {HTMLElement} */ (node).dataset.headerName ?? '';
      const input = /** @type {HTMLInputElement} */ (node);
      const completed = autocompleteHeaderName(input.value);
      input.value = completed;
      patchHeader(id, { name: completed }).catch(handleError);
    });
  });

  panel.querySelectorAll('[data-header-value]').forEach((node) => {
    node.addEventListener('change', () => {
      const id = /** @type {HTMLElement} */ (node).dataset.headerValue ?? '';
      patchHeader(id, { value: /** @type {HTMLInputElement} */ (node).value }).catch(handleError);
    });
  });

  panel.querySelectorAll('[data-header-op]').forEach((node) => {
    node.addEventListener('change', () => {
      const id = /** @type {HTMLElement} */ (node).dataset.headerOp ?? '';
      patchHeader(id, {
        operation: /** @type {any} */ (/** @type {HTMLSelectElement} */ (node).value),
      }).catch(handleError);
    });
  });

  panel.querySelectorAll('[data-delete-header]').forEach((node) => {
    node.addEventListener('click', () => {
      deleteHeader(/** @type {HTMLElement} */ (node).dataset.deleteHeader ?? '').catch(handleError);
    });
  });
}

/**
 * Render Rules tab.
 *
 * @returns {void}
 */
function renderRulesPanel() {
  if (!state) {
    return;
  }

  const panel = /** @type {HTMLElement} */ ($('#panel-rules'));
  const profile = selectedProfile();

  if (!profile) {
    panel.replaceChildren(
      el('div', {
        className: 'hf-empty',
        text: 'Select a profile on the Profiles tab first.',
      }),
    );
    return;
  }

  const query = searchQuery.trim().toLowerCase();
  const rules = profile.rules.filter((rule) => !query || rule.pattern.toLowerCase().includes(query));

  const table = el('table', { className: 'table' });
  table.append(
    el('thead', {}, [
      el('tr', {}, [
        el('th', { text: 'On' }),
        el('th', { text: 'Domain pattern' }),
        el('th', { text: '' }),
      ]),
    ]),
  );

  const tbody = el('tbody');

  if (rules.length === 0) {
    tbody.append(
      el('tr', {}, [
        el('td', { colspan: '3' }, [
          el('div', {
            className: 'hf-empty',
            text: 'No domain rules. Add localhost, api.example.com, or *.example.com.',
          }),
        ]),
      ]),
    );
  } else {
    for (const rule of rules) {
      const row = el('tr', { className: rule.enabled ? '' : 'is-disabled' });
      const toggle = el('input', { type: 'checkbox', 'data-toggle-rule': rule.id });
      if (rule.enabled) {
        toggle.setAttribute('checked', '');
      }

      const patternInput = el('input', {
        className: 'hf-input hf-mono',
        type: 'text',
        value: rule.pattern,
        'data-rule-pattern': rule.id,
      });

      const favicon = el('img', {
        src: domainFaviconDataUri(rule.pattern),
        alt: '',
        width: '16',
        height: '16',
      });

      const del = el('button', {
        className: 'hf-btn hf-btn--danger hf-btn--icon',
        type: 'button',
        text: '×',
        'data-delete-rule': rule.id,
      });

      row.append(
        el('td', {}, [toggle]),
        el('td', {}, [el('div', { className: 'domain-cell' }, [favicon, patternInput])]),
        el('td', {}, [del]),
      );
      tbody.append(row);
    }
  }

  table.append(tbody);

  const addRow = el('div', { className: 'toolbar' }, [
    el('input', {
      id: 'new-rule-pattern',
      className: 'hf-input hf-mono',
      type: 'text',
      placeholder: '*.example.com',
      style: 'max-width:320px',
    }),
    el('button', {
      id: 'btn-add-rule',
      className: 'hf-btn hf-btn--primary',
      type: 'button',
      text: 'Add rule',
    }),
    el('button', {
      id: 'btn-request-perms',
      className: 'hf-btn',
      type: 'button',
      text: 'Grant host access',
    }),
  ]);

  panel.replaceChildren(
    el('div', { className: 'card' }, [
      el('div', { className: 'card__head' }, [
        el('h2', { text: `Rules — ${profile.name}` }),
        el('span', {
          className: 'hf-muted',
          text: `${profile.rules.filter((r) => r.enabled).length} active`,
        }),
      ]),
      el('div', { className: 'card__body' }, [
        el('p', {
          className: 'hf-muted',
          text: state.applyToAllSites
            ? 'All sites mode is on — domain rules below are ignored until you turn it off in the popup.'
            : 'HeaderForge requests host permissions only for domains you configure — or enable All sites in the popup.',
        }),
        addRow,
        table,
      ]),
    ]),
  );

  $('#btn-add-rule')?.addEventListener('click', () => addRule().catch(handleError));
  $('#btn-request-perms')?.addEventListener('click', () => {
    ensureHostPermissions(profile, { applyToAllSites: state?.applyToAllSites })
      .then((granted) => {
        showToast(granted ? 'Host access granted' : 'Host access denied', granted ? 'success' : 'error');
      })
      .catch(handleError);
  });

  panel.querySelectorAll('[data-toggle-rule]').forEach((node) => {
    node.addEventListener('change', () => {
      const id = /** @type {HTMLElement} */ (node).dataset.toggleRule ?? '';
      patchRule(id, { enabled: /** @type {HTMLInputElement} */ (node).checked }).catch(handleError);
    });
  });

  panel.querySelectorAll('[data-rule-pattern]').forEach((node) => {
    node.addEventListener('change', () => {
      const id = /** @type {HTMLElement} */ (node).dataset.rulePattern ?? '';
      patchRule(id, { pattern: /** @type {HTMLInputElement} */ (node).value }).catch(handleError);
    });
  });

  panel.querySelectorAll('[data-delete-rule]').forEach((node) => {
    node.addEventListener('click', () => {
      deleteRule(/** @type {HTMLElement} */ (node).dataset.deleteRule ?? '').catch(handleError);
    });
  });
}

/**
 * Render Import tab.
 *
 * @returns {void}
 */
function renderImportPanel() {
  const panel = /** @type {HTMLElement} */ ($('#panel-import'));

  panel.replaceChildren(
    el('div', { className: 'card' }, [
      el('div', { className: 'card__head' }, [el('h2', { text: 'Import JSON' })]),
      el('div', { className: 'card__body' }, [
        el('p', {
          className: 'hf-muted',
          text: 'Paste a HeaderForge export or choose a local .json file. Nothing is uploaded.',
        }),
        el('div', { className: 'toolbar' }, [
          el('input', {
            id: 'import-file',
            className: 'hf-input',
            type: 'file',
            accept: 'application/json,.json',
          }),
          el('button', {
            id: 'btn-import',
            className: 'hf-btn hf-btn--primary',
            type: 'button',
            text: 'Import',
          }),
          el('button', {
            id: 'btn-restore-backup',
            className: 'hf-btn',
            type: 'button',
            text: 'Restore auto-backup',
          }),
        ]),
        el('textarea', {
          id: 'import-json',
          className: 'hf-textarea',
          placeholder: '{ "format": "headerforge", "profiles": [ … ] }',
        }),
      ]),
    ]),
  );

  $('#import-file')?.addEventListener('change', async (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target);
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    const area = /** @type {HTMLTextAreaElement} */ ($('#import-json'));
    area.value = text;
  });

  $('#btn-import')?.addEventListener('click', () => runImport().catch(handleError));
  $('#btn-restore-backup')?.addEventListener('click', () => runRestoreBackup().catch(handleError));
}

/**
 * Render Export tab.
 *
 * @returns {void}
 */
function renderExportPanel() {
  if (!state) {
    return;
  }

  const panel = /** @type {HTMLElement} */ ($('#panel-export'));
  const doc = buildExportDocument(state);
  const json = JSON.stringify(doc, null, 2);

  panel.replaceChildren(
    el('div', { className: 'card' }, [
      el('div', { className: 'card__head' }, [
        el('h2', { text: 'Export JSON' }),
        el('button', {
          id: 'btn-download-export',
          className: 'hf-btn hf-btn--primary',
          type: 'button',
          text: 'Download',
        }),
      ]),
      el('div', { className: 'card__body' }, [
        el('p', {
          className: 'hf-muted',
          text: `Includes ${state.profiles.length} profile(s). Last auto-backup: ${
            state.lastBackupAt ? new Date(state.lastBackupAt).toLocaleString() : 'not yet'
          }.`,
        }),
        el('textarea', {
          id: 'export-json',
          className: 'hf-textarea',
          readonly: 'true',
          text: json,
        }),
        el('div', { className: 'toolbar', style: 'margin-top:12px' }, [
          el('button', {
            id: 'btn-copy-export',
            className: 'hf-btn',
            type: 'button',
            text: 'Copy to clipboard',
          }),
        ]),
      ]),
    ]),
  );

  $('#btn-download-export')?.addEventListener('click', () => {
    downloadJson(json, `headerforge-export-${Date.now()}.json`);
    showToast('Export downloaded');
  });

  $('#btn-copy-export')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(json);
    showToast('Copied export JSON');
  });
}

/**
 * Render About tab.
 *
 * @returns {void}
 */
function renderAboutPanel() {
  const panel = /** @type {HTMLElement} */ ($('#panel-about'));
  const manifest = chrome.runtime.getManifest();

  panel.replaceChildren(
    el('div', { className: 'about' }, [
      el('div', { className: 'card' }, [
        el('div', { className: 'card__body' }, [
          el('h2', { text: `HeaderForge v${manifest.version}` }),
          el('p', {
            text: 'Open-source, privacy-first HTTP header manager for Chrome and Edge (Manifest V3).',
          }),
          el('p', {
            className: 'hf-muted',
            text: 'Created with assistance from the Cursor AI agent (Composer).',
          }),
          el('div', { className: 'pill-row' }, [
            el('span', { className: 'hf-badge', text: 'Zero telemetry' }),
            el('span', { className: 'hf-badge', text: 'Zero analytics' }),
            el('span', { className: 'hf-badge', text: '100% local storage' }),
            el('span', { className: 'hf-badge', text: 'No external APIs' }),
          ]),
        ]),
      ]),
      el('div', { className: 'card' }, [
        el('div', { className: 'card__body' }, [
          el('h2', { text: 'Source' }),
          el('p', {}, [
            el('a', {
              href: 'https://github.com/Scoobydowsky/Header-Forge-',
              text: 'github.com/Scoobydowsky/Header-Forge-',
              target: '_blank',
              rel: 'noopener noreferrer',
            }),
          ]),
        ]),
      ]),
      el('div', { className: 'card' }, [
        el('div', { className: 'card__body' }, [
          el('h2', { text: 'Privacy' }),
          el('ul', {}, [
            el('li', { text: 'Never sends configuration or browsing data to the internet.' }),
            el('li', { text: 'Stores everything exclusively in chrome.storage.local.' }),
            el('li', { text: 'Optional host permissions are requested only for domains you add.' }),
          ]),
        ]),
      ]),
      el('div', { className: 'card' }, [
        el('div', { className: 'card__body' }, [
          el('h2', { text: 'Keyboard shortcuts' }),
          el('ul', {}, [
            el('li', { text: 'Ctrl/Cmd+S — Save / sync rules' }),
            el('li', { text: 'Ctrl/Cmd+F — Focus search' }),
            el('li', { text: 'Ctrl/Cmd+D — Toggle extension (also Alt+Shift+H)' }),
          ]),
        ]),
      ]),
      el('div', { className: 'card' }, [
        el('div', { className: 'card__body' }, [
          el('h2', { text: 'Roadmap v2' }),
          el('ul', {}, [
            el('li', { text: 'Optional Google account sync (explicit opt-in).' }),
            el('li', { text: 'Secret masking and safer credential storage.' }),
            el('li', { text: 'Rule editor with URL match preview.' }),
            el('li', { text: 'Firefox support.' }),
            el('li', { text: 'Import from other header tools where legally/technically possible.' }),
          ]),
        ]),
      ]),
    ]),
  );
}

/**
 * Full UI refresh.
 *
 * @returns {void}
 */
function render() {
  if (!state) {
    return;
  }

  if (!selectedProfileId || !state.profiles.some((profile) => profile.id === selectedProfileId)) {
    selectedProfileId = state.activeProfileId ?? state.profiles[0]?.id ?? null;
  }

  const copy = TAB_COPY[activeTab];
  /** @type {HTMLElement} */ ($('#tab-title')).textContent = copy.title;
  /** @type {HTMLElement} */ ($('#tab-subtitle')).textContent = copy.subtitle;

  document.querySelectorAll('.sidebar__link').forEach((node) => {
    const btn = /** @type {HTMLElement} */ (node);
    btn.classList.toggle('is-active', btn.dataset.tab === activeTab);
  });

  document.querySelectorAll('.panel').forEach((node) => {
    const panel = /** @type {HTMLElement} */ (node);
    const on = panel.dataset.panel === activeTab;
    panel.classList.toggle('is-active', on);
    panel.hidden = !on;
  });

  renderSidebarMeta();

  switch (activeTab) {
    case 'profiles':
      renderProfilesPanel();
      break;
    case 'headers':
      renderHeadersPanel();
      break;
    case 'rules':
      renderRulesPanel();
      break;
    case 'import':
      renderImportPanel();
      break;
    case 'export':
      renderExportPanel();
      break;
    case 'about':
      renderAboutPanel();
      break;
    default:
      break;
  }
}

/**
 * @param {unknown} error
 * @returns {void}
 */
function handleError(error) {
  console.error('[HeaderForge options]', error);
  showToast(String(/** @type {any} */ (error)?.message ?? error), 'error');
}

/**
 * @returns {Promise<void>}
 */
async function createProfile() {
  if (!state) {
    return;
  }

  const profile = createEmptyProfile('Profile', '');
  selectedProfileId = profile.id;
  await commit({
    ...state,
    profiles: [...state.profiles, profile],
    recentProfileIds: [profile.id, ...state.recentProfileIds].slice(0, 8),
  });
  showToast('Profile created');
  setTab('headers');
}

/**
 * @param {string} profileId
 * @param {string} suffix
 * @returns {Promise<void>}
 */
async function duplicateProfile(profileId, suffix) {
  if (!state) {
    return;
  }

  const source = state.profiles.find((profile) => profile.id === profileId);
  if (!source) {
    return;
  }

  const copy = cloneProfile(source, suffix);
  selectedProfileId = copy.id;
  await commit({
    ...state,
    profiles: [...state.profiles, copy],
  });
  showToast(`Profile ${suffix.trim()} created`);
}

/**
 * @param {string} profileId
 * @returns {Promise<void>}
 */
async function deleteProfile(profileId) {
  if (!state) {
    return;
  }

  if (state.profiles.length <= 1) {
    showToast('Keep at least one profile.', 'error');
    return;
  }

  const confirmed = window.confirm('Delete this profile permanently?');
  if (!confirmed) {
    return;
  }

  const profiles = state.profiles.filter((profile) => profile.id !== profileId);
  const activeProfileId =
    state.activeProfileId === profileId ? profiles[0]?.id ?? null : state.activeProfileId;

  if (selectedProfileId === profileId) {
    selectedProfileId = activeProfileId;
  }

  await commit({
    ...state,
    profiles,
    activeProfileId,
    recentProfileIds: state.recentProfileIds.filter((id) => id !== profileId),
  });
  showToast('Profile deleted');
}

/**
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

  selectedProfileId = profileId;
  const next = touchRecent({ ...state, activeProfileId: profileId }, profileId);
  await commit(next);
  showToast(`Activated ${profile.name}`);
}

/**
 * @param {string} profileId
 * @param {string} name
 * @returns {Promise<void>}
 */
async function renameProfile(profileId, name) {
  const check = validateProfileName(name);
  if (!check.valid) {
    showToast(check.error ?? 'Invalid name', 'error');
    render();
    return;
  }

  const next = mapProfile(profileId, (profile) => ({ ...profile, name: name.trim() }));
  if (!next) {
    return;
  }
  await commit(next);
  showToast('Profile saved');
}

/**
 * @param {string} profileId
 * @param {string} color
 * @returns {Promise<void>}
 */
async function recolorProfile(profileId, color) {
  const safe = /** @type {import('../utils/validate.js').ColorLabel} */ (
    COLOR_LABELS.includes(/** @type {any} */ (color)) ? color : ''
  );
  const next = mapProfile(profileId, (profile) => ({ ...profile, color: safe }));
  if (!next) {
    return;
  }
  await commit(next);
  showToast('Label updated');
}

/**
 * @returns {Promise<void>}
 */
async function addHeader() {
  const profile = selectedProfile();
  if (!profile || !state) {
    return;
  }

  const name = /** @type {HTMLInputElement} */ ($('#new-header-name')).value;
  const value = /** @type {HTMLInputElement} */ ($('#new-header-value')).value;
  const operation = /** @type {HTMLSelectElement} */ ($('#new-header-op')).value;

  const header = {
    id: createId(),
    name: normalizeHeaderName(autocompleteHeaderName(name)),
    value,
    operation: /** @type {import('../utils/validate.js').HeaderOperation} */ (operation),
    enabled: true,
  };

  const check = validateHeader(header);
  if (!check.valid) {
    showToast(check.error ?? 'Invalid header', 'error');
    return;
  }

  const next = mapProfile(profile.id, (item) => ({
    ...item,
    headers: [...item.headers, header],
  }));
  if (!next) {
    return;
  }
  await commit(next);
  showToast('Header added');
}

/**
 * @param {string} headerId
 * @param {Partial<import('../utils/validate.js').HeaderEntry>} patch
 * @returns {Promise<void>}
 */
async function patchHeader(headerId, patch) {
  const profile = selectedProfile();
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
    render();
    return;
  }

  const next = mapProfile(profile.id, (item) => ({
    ...item,
    headers: item.headers.map((header) => (header.id === headerId ? merged : header)),
  }));
  if (!next) {
    return;
  }
  await commit(next);
  showToast('Saved');
}

/**
 * @param {string} headerId
 * @returns {Promise<void>}
 */
async function deleteHeader(headerId) {
  const profile = selectedProfile();
  if (!profile) {
    return;
  }

  const next = mapProfile(profile.id, (item) => ({
    ...item,
    headers: item.headers.filter((header) => header.id !== headerId),
  }));
  if (!next) {
    return;
  }
  await commit(next);
  showToast('Header deleted');
}

/**
 * @returns {Promise<void>}
 */
async function addRule() {
  const profile = selectedProfile();
  if (!profile) {
    return;
  }

  const pattern = /** @type {HTMLInputElement} */ ($('#new-rule-pattern')).value;
  const check = validateDomainPattern(pattern);
  if (!check.valid) {
    showToast(check.error ?? 'Invalid domain', 'error');
    return;
  }

  const rule = {
    id: createId(),
    pattern: pattern.trim().toLowerCase(),
    enabled: true,
  };

  const next = mapProfile(profile.id, (item) => ({
    ...item,
    rules: [...item.rules, rule],
  }));
  if (!next) {
    return;
  }

  await commit(next);
  await ensureHostPermissions(selectedProfile(), {
    applyToAllSites: state?.applyToAllSites,
  });
  showToast('Rule added');
}

/**
 * @param {string} ruleId
 * @param {Partial<import('../utils/validate.js').DomainRule>} patch
 * @returns {Promise<void>}
 */
async function patchRule(ruleId, patch) {
  const profile = selectedProfile();
  if (!profile) {
    return;
  }

  const current = profile.rules.find((rule) => rule.id === ruleId);
  if (!current) {
    return;
  }

  const merged = {
    ...current,
    ...patch,
    pattern:
      patch.pattern !== undefined ? String(patch.pattern).trim().toLowerCase() : current.pattern,
  };

  if (patch.pattern !== undefined) {
    const check = validateDomainPattern(merged.pattern);
    if (!check.valid) {
      showToast(check.error ?? 'Invalid domain', 'error');
      render();
      return;
    }
  }

  const next = mapProfile(profile.id, (item) => ({
    ...item,
    rules: item.rules.map((rule) => (rule.id === ruleId ? merged : rule)),
  }));
  if (!next) {
    return;
  }
  await commit(next);
  showToast('Saved');
}

/**
 * @param {string} ruleId
 * @returns {Promise<void>}
 */
async function deleteRule(ruleId) {
  const profile = selectedProfile();
  if (!profile) {
    return;
  }

  const next = mapProfile(profile.id, (item) => ({
    ...item,
    rules: item.rules.filter((rule) => rule.id !== ruleId),
  }));
  if (!next) {
    return;
  }
  await commit(next);
  showToast('Rule deleted');
}

/**
 * @returns {Promise<void>}
 */
async function runImport() {
  if (!state) {
    return;
  }

  const rawText = /** @type {HTMLTextAreaElement} */ ($('#import-json')).value;
  let parsed;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    showToast('Invalid JSON.', 'error');
    return;
  }

  const result = parseImportDocument(parsed);
  if (!result.ok) {
    showToast(result.error, 'error');
    return;
  }

  const merged = mergeImportedProfiles(state, result.profiles);
  await commit(merged);
  showToast(`Imported ${result.profiles.length} profile(s)`);
  setTab('profiles');
}

/**
 * @returns {Promise<void>}
 */
async function runRestoreBackup() {
  const restored = await restoreFromBackup();
  if (!restored) {
    showToast('No automatic backup available.', 'error');
    return;
  }
  state = restored;
  await syncRulesFromState(state);
  render();
  showToast('Backup restored');
}

/**
 * Download a JSON blob.
 *
 * @param {string} json
 * @param {string} filename
 * @returns {void}
 */
function downloadJson(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Wire global events.
 *
 * @returns {void}
 */
function bindEvents() {
  document.querySelectorAll('.sidebar__link').forEach((node) => {
    node.addEventListener('click', () => {
      const tab = /** @type {any} */ (/** @type {HTMLElement} */ (node).dataset.tab);
      setTab(tab);
    });
  });

  $('#global-enabled')?.addEventListener('change', async (event) => {
    if (!state) {
      return;
    }
    const enabled = /** @type {HTMLInputElement} */ (event.target).checked;
    if (enabled) {
      const granted = await ensureHostPermissions(selectedProfile(), {
        applyToAllSites: state.applyToAllSites,
      });
      if (!granted) {
        showToast('Host permission required to enable HeaderForge.', 'error');
        /** @type {HTMLInputElement} */ (event.target).checked = false;
        return;
      }
    }
    await commit({ ...state, enabled });
    showToast(enabled ? 'Enabled' : 'Paused', 'info');
  });

  $('#global-search')?.addEventListener('input', (event) => {
    searchQuery = /** @type {HTMLInputElement} */ (event.target).value;
    render();
  });

  $('#save-btn')?.addEventListener('click', async () => {
    if (!state) {
      return;
    }
    await commit(state);
    showToast('Saved');
  });

  document.addEventListener('keydown', (event) => {
    const meta = event.ctrlKey || event.metaKey;
    if (meta && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (state) {
        commit(state)
          .then(() => showToast('Saved'))
          .catch(handleError);
      }
    }
    if (meta && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      /** @type {HTMLInputElement} */ ($('#global-search'))?.focus();
    }
    if (meta && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      const toggle = /** @type {HTMLInputElement} */ ($('#global-enabled'));
      toggle.checked = !toggle.checked;
      toggle.dispatchEvent(new Event('change'));
    }
  });
}

/**
 * @returns {Promise<void>}
 */
async function init() {
  ensureHeaderNameDatalist();
  bindEvents();
  state = await loadState();

  const hash = location.hash.replace('#', '');
  if (hash && hash in TAB_COPY) {
    activeTab = /** @type {any} */ (hash);
  }

  selectedProfileId = state.activeProfileId;
  await updateState({ onboarded: true });
  state = await loadState();
  render();
}

init().catch(handleError);
