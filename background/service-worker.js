/**
 * HeaderForge background service worker (Manifest V3).
 * Keeps declarativeNetRequest rules in sync with chrome.storage.local.
 * Never sends data off-device.
 */

import { loadState, saveState, touchRecent } from '../storage/profiles.js';
import { syncRulesFromState } from '../rules/rules.js';

/**
 * Apply DNR rules for the current stored state.
 *
 * @returns {Promise<void>}
 */
async function refreshRules() {
  const state = await loadState();
  await syncRulesFromState(state);
  await updateActionBadge(state);
}

/**
 * Reflect enabled / profile status on the toolbar badge.
 *
 * @param {import('../storage/profiles.js').AppState} state
 * @returns {Promise<void>}
 */
async function updateActionBadge(state) {
  const profile = state.profiles.find((item) => item.id === state.activeProfileId);
  const activeHeaders =
    state.enabled && profile
      ? profile.headers.filter((header) => header.enabled).length
      : 0;

  if (!state.enabled) {
    await chrome.action.setBadgeText({ text: 'OFF' });
    await chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
    return;
  }

  await chrome.action.setBadgeText({
    text: activeHeaders > 0 ? String(activeHeaders) : '',
  });
  await chrome.action.setBadgeBackgroundColor({ color: '#3d9a8b' });
}

/**
 * Handle messages from popup / options pages.
 *
 * @param {any} message
 * @param {chrome.runtime.MessageSender} _sender
 * @param {(response?: any) => void} sendResponse
 * @returns {boolean}
 */
function onMessage(message, _sender, sendResponse) {
  const type = message?.type;

  (async () => {
    switch (type) {
      case 'SYNC_RULES': {
        await refreshRules();
        sendResponse({ ok: true });
        break;
      }
      case 'GET_STATE': {
        const state = await loadState();
        sendResponse({ ok: true, state });
        break;
      }
      case 'SET_ACTIVE_PROFILE': {
        const profileId = String(message.profileId ?? '');
        let state = await loadState();
        if (!state.profiles.some((profile) => profile.id === profileId)) {
          sendResponse({ ok: false, error: 'Profile not found.' });
          break;
        }
        state = touchRecent({ ...state, activeProfileId: profileId }, profileId);
        state = await saveState(state);
        await syncRulesFromState(state);
        await updateActionBadge(state);
        sendResponse({ ok: true, state });
        break;
      }
      case 'SET_ENABLED': {
        const enabled = Boolean(message.enabled);
        let state = await loadState();
        state = await saveState({ ...state, enabled });
        await syncRulesFromState(state);
        await updateActionBadge(state);
        sendResponse({ ok: true, state });
        break;
      }
      case 'TOGGLE_ENABLED': {
        let state = await loadState();
        state = await saveState({ ...state, enabled: !state.enabled });
        await syncRulesFromState(state);
        await updateActionBadge(state);
        sendResponse({ ok: true, state });
        break;
      }
      default:
        sendResponse({ ok: false, error: 'Unknown message type.' });
    }
  })().catch((error) => {
    console.error('[HeaderForge]', error);
    sendResponse({ ok: false, error: String(error?.message ?? error) });
  });

  return true;
}

chrome.runtime.onInstalled.addListener(() => {
  refreshRules().catch((error) => console.error('[HeaderForge] install sync failed', error));
});

chrome.runtime.onStartup.addListener(() => {
  refreshRules().catch((error) => console.error('[HeaderForge] startup sync failed', error));
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.headerforge) {
    return;
  }

  refreshRules().catch((error) => console.error('[HeaderForge] storage sync failed', error));
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-extension') {
    return;
  }

  (async () => {
    const state = await loadState();
    const next = await saveState({ ...state, enabled: !state.enabled });
    await syncRulesFromState(next);
    await updateActionBadge(next);
  })().catch((error) => console.error('[HeaderForge] command failed', error));
});

chrome.runtime.onMessage.addListener(onMessage);

refreshRules().catch((error) => console.error('[HeaderForge] initial sync failed', error));
