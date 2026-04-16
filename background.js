/**
 * background.js — Cross-browser service worker
 * Compatible with: Chrome, Firefox, Edge, Opera, Brave
 *
 * Firefox MV3 note: Firefox 109+ supports MV3 service workers.
 * Firefox for Android: 113+
 */

// Cross-browser API shim (inline for service worker context where importScripts may be needed)
const _api = typeof browser !== 'undefined' ? browser : chrome;
const _isFirefox = typeof browser !== 'undefined';

function _p(fn, ...args) {
  if (_isFirefox) return fn(...args);
  return new Promise((resolve, reject) => {
    fn(...args, (result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(err); else resolve(result);
    });
  });
}

const store = {
  get: (k) => _p(_api.storage.local.get.bind(_api.storage.local), k),
  set: (o) => _p(_api.storage.local.set.bind(_api.storage.local), o),
  remove: (k) => _p(_api.storage.local.remove.bind(_api.storage.local), k),
};

const dnr = {
  update: (o) => _p(_api.declarativeNetRequest.updateDynamicRules.bind(_api.declarativeNetRequest), o),
};

// ─────────────────────────────────────────────
// Message handler
// ─────────────────────────────────────────────
_api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SET_ST') {
    applySTRule(msg.st)
      .then(() => store.set({ st: msg.st }))
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error('[BG] SET_ST error:', err);
        sendResponse({ ok: false, error: String(err) });
      });
    return true; // keep channel open for async response
  }

  if (msg.type === 'CLEAR_ST') {
    dnr.update({ removeRuleIds: [1] })
      .then(() => store.remove('st'))
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (msg.type === 'GET_ST') {
    store.get('st')
      .then((data) => sendResponse({ st: data.st || null }))
      .catch(() => sendResponse({ st: null }));
    return true;
  }
});

// ─────────────────────────────────────────────
// Core: apply declarativeNetRequest rule
// ─────────────────────────────────────────────
async function applySTRule(st) {
  await dnr.update({
    removeRuleIds: [1],
    addRules: [
      {
        id: 1,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            {
              header: 'Cookie',
              operation: 'set',
              value: 'st=' + st,
            },
          ],
        },
        condition: {
          urlFilter: '||api.hbomax.com/',
          resourceTypes: [
            'xmlhttprequest',
            'main_frame',
            'sub_frame',
            'other',
          ],
        },
      },
    ],
  });
}

// ─────────────────────────────────────────────
// Restore rule on browser startup / reinstall
// ─────────────────────────────────────────────
async function restoreRule() {
  try {
    const data = await store.get('st');
    if (data.st) {
      await applySTRule(data.st);
      console.log('[BG] ST rule restored on startup');
    }
  } catch (err) {
    console.warn('[BG] restoreRule error:', err);
  }
}

_api.runtime.onStartup.addListener(restoreRule);
_api.runtime.onInstalled.addListener(restoreRule);
