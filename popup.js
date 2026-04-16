/**
 * popup.js — Cross-browser popup script
 * Works with Chrome, Firefox, Edge, Opera, Brave (desktop + Android)
 */

// ─────────────────────────────────────────────
// Browser detection (moved from inline script)
// ─────────────────────────────────────────────
(function () {
  const ua = navigator.userAgent.toLowerCase();
  const badge = document.getElementById('browserBadge');
  const name = document.getElementById('browserName');
  let cls = 'unknown', label = 'Unknown Browser';
  if (ua.includes('firefox'))                             { cls = 'firefox'; label = 'Firefox'; }
  else if (ua.includes('edg/'))                           { cls = 'edge';    label = 'Edge'; }
  else if (ua.includes('opr/') || ua.includes('opera'))  { cls = 'opera';   label = 'Opera'; }
  else if (ua.includes('brave'))                         { cls = 'brave';   label = 'Brave'; }
  else if (ua.includes('chrome'))                        { cls = 'chrome';  label = 'Chrome'; }
  if (badge) badge.className = 'browser-badge ' + cls;
  if (name)  name.textContent = label;
})();

// ─────────────────────────────────────────────
// Cross-browser API normalization
// ─────────────────────────────────────────────
const _api = typeof browser !== 'undefined' ? browser : chrome;
const _isFirefox = typeof browser !== 'undefined';

function sendMsg(msg) {
  if (_isFirefox) {
    return browser.runtime.sendMessage(msg);
  }
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(res);
    });
  });
}

function getTabs(queryInfo) {
  if (_isFirefox) return browser.tabs.query(queryInfo);
  return new Promise((resolve) => chrome.tabs.query(queryInfo, resolve));
}

function updateTab(id, props) {
  if (_isFirefox) return browser.tabs.update(id, props);
  return new Promise((resolve) => chrome.tabs.update(id, props, resolve));
}

function createTab(props) {
  if (_isFirefox) return browser.tabs.create(props);
  return new Promise((resolve) => chrome.tabs.create(props, resolve));
}

// ─────────────────────────────────────────────
// ST parsing
// ─────────────────────────────────────────────
let parsedST = null;

function parseSTFromNetscape(text) {
  const lines = text.split('\n');

  // Netscape tab-separated format
  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length >= 7 && cols[5].trim() === 'st') {
      return cols[6].trim();
    }
  }

  // key: value format
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('st:')) return trimmed.substring(3).trim();
    if (trimmed.startsWith('st ') && trimmed.split(' ').length === 2) {
      return trimmed.split(' ')[1].trim();
    }
  }

  // Raw JWT (starts with eyJ, single line)
  const raw = text.trim();
  if (raw.startsWith('eyJ') && !raw.includes('\n')) return raw;

  return null;
}

// ─────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────
function showParsed(st) {
  parsedST = st;
  document.getElementById('parsedToken').textContent =
    st.substring(0, 80) + '...' + st.slice(-20);
  document.getElementById('parsedPreview').classList.add('visible');
  document.getElementById('btnInject').disabled = false;
}

function clearParsed() {
  parsedST = null;
  document.getElementById('parsedPreview').classList.remove('visible');
  document.getElementById('btnInject').disabled = true;
  document.getElementById('manualInput').value = '';
}

function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '') + ' show';
  setTimeout(() => { t.className = 'toast'; }, 2200);
}

async function updateStatus() {
  try {
    const res = await sendMsg({ type: 'GET_ST' });
    const ring = document.getElementById('pulseRing');
    const label = document.getElementById('statusLabel');
    const tokenEl = document.getElementById('statusToken');
    if (res && res.st) {
      if (ring) ring.className = 'pulse-ring active';
      if (label) label.textContent = 'ST token active — injecting';
      if (tokenEl) tokenEl.textContent = res.st.substring(0, 40) + '...';
    } else {
      if (ring) ring.className = 'pulse-ring inactive';
      if (label) label.textContent = 'No token active';
      if (tokenEl) tokenEl.textContent = '';
    }
  } catch (err) {
    console.warn('[POPUP] updateStatus error:', err);
  }
}

// ─────────────────────────────────────────────
// File drop / browse
// ─────────────────────────────────────────────
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) readFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) readFile(fileInput.files[0]);
});

function readFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const st = parseSTFromNetscape(text);
    if (st) {
      showParsed(st);
      showToast('ST token found!');
    } else {
      showToast('No st token found in file', true);
    }
  };
  reader.readAsText(file);
}

// ─────────────────────────────────────────────
// Manual input
// ─────────────────────────────────────────────
document.getElementById('manualInput').addEventListener('input', (e) => {
  const text = e.target.value;
  if (!text.trim()) { clearParsed(); return; }
  const st = parseSTFromNetscape(text);
  if (st) {
    showParsed(st);
  } else {
    parsedST = null;
    document.getElementById('parsedPreview').classList.remove('visible');
    document.getElementById('btnInject').disabled = true;
  }
});

// ─────────────────────────────────────────────
// Inject button
// ─────────────────────────────────────────────
document.getElementById('btnInject').addEventListener('click', async () => {
  if (!parsedST) return;
  try {
    const res = await sendMsg({ type: 'SET_ST', st: parsedST });
    if (res && res.ok) {
      showToast('✓ Injected! Navigating...');
      await updateStatus();
      await new Promise(r => setTimeout(r, 800));
      const target = 'https://play.hbomax.com/';
      const tabs = await getTabs({ active: true, currentWindow: true });
      if (tabs && tabs[0]) {
        await updateTab(tabs[0].id, { url: target });
      } else {
        await createTab({ url: target });
      }
    } else {
      showToast('Injection failed: ' + (res?.error || 'unknown'), true);
    }
  } catch (err) {
    console.error('[POPUP] inject error:', err);
    showToast('Injection error', true);
  }
});

// ─────────────────────────────────────────────
// Clear button
// ─────────────────────────────────────────────
document.getElementById('btnClear').addEventListener('click', async () => {
  try {
    await sendMsg({ type: 'CLEAR_ST' });
    clearParsed();
    showToast('Token cleared');
    await updateStatus();
  } catch (err) {
    console.error('[POPUP] clear error:', err);
  }
});

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
updateStatus();
