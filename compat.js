/**
 * Cross-browser extension API shim
 * Normalizes chrome.* (Chrome/Edge/Opera) and browser.* (Firefox)
 * into a single `ext` object with Promise-based and callback-based support.
 */

const ext = (() => {
  // Firefox exposes `browser` (Promise-based), Chrome exposes `chrome` (callback-based)
  const api = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);

  if (!api) {
    console.warn('[COMPAT] No extension API found');
    return {};
  }

  const isFirefox = typeof browser !== 'undefined';

  function promisify(fn, ...args) {
    if (isFirefox) {
      // Firefox already returns Promises
      return fn(...args);
    }
    // Chrome: wrap callback in Promise
    return new Promise((resolve, reject) => {
      fn(...args, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });
  }

  return {
    isFirefox,

    storage: {
      get: (keys) => promisify(api.storage.local.get.bind(api.storage.local), keys),
      set: (items) => promisify(api.storage.local.set.bind(api.storage.local), items),
      remove: (keys) => promisify(api.storage.local.remove.bind(api.storage.local), keys),
    },

    tabs: {
      query: (queryInfo) => promisify(api.tabs.query.bind(api.tabs), queryInfo),
      update: (tabId, updateProps) => promisify(api.tabs.update.bind(api.tabs), tabId, updateProps),
      create: (createProps) => promisify(api.tabs.create.bind(api.tabs), createProps),
    },

    runtime: {
      sendMessage: (msg) => promisify(api.runtime.sendMessage.bind(api.runtime), msg),
      onMessage: api.runtime.onMessage,
      onStartup: api.runtime.onStartup,
      onInstalled: api.runtime.onInstalled,
      lastError: () => api.runtime.lastError,
    },

    declarativeNetRequest: {
      updateDynamicRules: (options) =>
        promisify(api.declarativeNetRequest.updateDynamicRules.bind(api.declarativeNetRequest), options),
    },

    // Raw api access for edge cases
    _raw: api,
  };
})();
