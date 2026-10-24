/* =============================================================
   AMI café — online admin (admin/ on GitHub Pages)
   Edits api/seed/menu.json in the GitHub repo through the GitHub API.
   The GitHub key is stored in admin/auth.json, locked (AES-256-GCM) with a
   key made from the username + password (PBKDF2-SHA256, 600,000 rounds).
   That file is public, so the password is what protects it.
   ============================================================= */
import { $, $$, store, esc, fold, toast, openDialog, wireDialog, initTheme, toggleTheme, currentTheme, latinDigits, ICONS } from './util.js';
import { useStrings, setLangValue, getLang, translatePage, t, pick, num, money, errorText } from './i18n.js';
import { GH_STRINGS } from './gh-admin-strings.js';

const OWNER = 'salehlava';
const REPO = 'AMI';
const BRANCH = 'main';
const MENU_PATH = 'api/seed/menu.json';
const AUTH_PATH = 'admin/auth.json';
const ROUNDS = 600000;
const MIN_PASSWORD = 10;

// Tests on this computer can point the page at a stand-in for GitHub
const isLocal = ['127.0.0.1', 'localhost'].includes(location.hostname);
const API_ROOT = (isLocal && store.get('ami-gh-test-api', null)) || 'https://api.github.com';
const API = `${API_ROOT}/repos/${OWNER}/${REPO}`;

const KEYS = { lang: 'ami-admin-lang', tab: 'ami-gh-tab', token: 'ami-gh-token' };
const TABS = ['menu', 'account'];
const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>';

const ui = {
  tab: TABS.includes(store.get(KEYS.tab, 'menu')) ? store.get(KEYS.tab, 'menu') : 'menu',
  gate: 'login', // or 'setup'
  menuQuery: '',
  armed: new Map(),
  publishing: false,
};

const data = {
  menu: null,      // the menu file, with a runtime "key" on every item
  original: '',    // the menu file as last loaded or published
  sha: null,       // GitHub's version id of the menu file
  auth: null,      // contents of admin/auth.json (null = not set up yet)
};

let token = null;
let editing = null;
let nextKey = 1;

const el = {
  gate: $('#gateView'),
  panel: $('#panelView'),
  itemDialog: $('#itemDialog'),
  bar: $('#publishBar'),
  count: $('#publishCount'),
  publish: $('#publishBtn'),
  discard: $('#discardBtn'),
  errorBanner: $('#errorBanner'),
  errorText: $('#errorText'),
  panels: Object.fromEntries(TABS.map(tab => [tab, $(`#tab-${tab}`)])),
};

class GhError extends Error {
  constructor(code, status = 0) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/* ---------- Text <-> base64 (UTF-8 safe) ---------- */
const bytesToB64 = bytes => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64ToBytes = b64 => Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0));
const textToB64 = s => bytesToB64(new TextEncoder().encode(s));
const b64ToText = b64 => new TextDecoder().decode(b64ToBytes(b64));

/* ---------- GitHub API ---------- */
async function gh(path, method = 'GET', body) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new GhError('offline');
  }
  const json = await res.json().catch(() => null);
  if (res.ok) return json;
  if (res.status === 401) throw new GhError('bad_key', 401);
  if (res.status === 409 || (res.status === 422 && /sha/i.test(json?.message || ''))) throw new GhError('conflict', res.status);
  if (res.status === 403 || res.status === 404) throw new GhError(res.status === 404 && method === 'GET' ? 'not_found' : 'no_access', res.status);
  throw new GhError('github_error', res.status);
}

const contentsUrl = path => `/contents/${path}?ref=${BRANCH}`;

/** Current sha of a file, or null when it doesn't exist yet */
async function fileSha(path) {
  try {
    return (await gh(contentsUrl(path))).sha;
  } catch (err) {
    if (err.code === 'not_found') return null;
    throw err;
  }
}

async function putFile(path, text, sha, message) {
  const r = await gh(`/contents/${path}`, 'PUT', { message, content: textToB64(text), branch: BRANCH, ...(sha ? { sha } : {}) });
  return r.content.sha;
}

/* ---------- Locked GitHub key ---------- */
const normUser = u => u.trim().toLowerCase();

async function deriveKey(user, pass, salt, rounds) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(`${normUser(user)}\n${pass}`), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: rounds, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function lockKey(user, pass, ghKey) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(user, pass, salt, ROUNDS);
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify({ token: ghKey })));
  return { v: 1, kdf: 'PBKDF2-SHA256', rounds: ROUNDS, cipher: 'AES-256-GCM',
           salt: bytesToB64(salt), iv: bytesToB64(iv), data: bytesToB64(new Uint8Array(sealed)) };
}

async function unlockKey(cfg, user, pass) {
  try {
    const key = await deriveKey(user, pass, b64ToBytes(cfg.salt), cfg.rounds);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(cfg.iv) }, key, b64ToBytes(cfg.data));
    return JSON.parse(new TextDecoder().decode(plain)).token;
  } catch {
    throw new GhError('wrong_login');
  }
}

async function saveAuth(user, pass, message) {
  const cfg = await lockKey(user, pass, token);
  await putFile(AUTH_PATH, JSON.stringify(cfg, null, 1), await fileSha(AUTH_PATH), message);
  data.auth = cfg;
}

async function loadAuthFile() {
  try {
    const res = await fetch('auth.json', { cache: 'no-store' });
    data.auth = res.ok ? await res.json() : null;
  } catch {
    data.auth = null;
  }
}

/* ---------- Signed-in key for this tab (and this device, when asked) ---------- */
function readToken() {
  try { return sessionStorage.getItem(KEYS.token) || localStorage.getItem(KEYS.token); } catch { return null; }
}
function keepToken(remember) {
  try {
    sessionStorage.setItem(KEYS.token, token);
    if (remember) localStorage.setItem(KEYS.token, token);
    else localStorage.removeItem(KEYS.token);
  } catch { /* storage blocked: stay signed in until the tab closes */ }
}
function forgetToken() {
  try { sessionStorage.removeItem(KEYS.token); localStorage.removeItem(KEYS.token); } catch { /* nothing stored */ }
  token = null;
}

/* ---------- Language + theme ---------- */
function labelButtons() {
  $$('[data-lang-toggle]').forEach(b => {
    b.textContent = t('switchTo');
    b.lang = getLang() === 'fa' ? 'en' : 'fa';
    b.setAttribute('aria-label', t('switchToLabel'));
  });
  $$('[data-theme-toggle]').forEach(b => b.setAttribute('aria-label', t(currentTheme() === 'dark' ? 'toLight' : 'toDark')));
}

function applyLanguage(lang) {
  setLangValue(lang);
  translatePage();
  labelButtons();
}

function switchLanguage() {
  const next = getLang() === 'fa' ? 'en' : 'fa';
  store.set(KEYS.lang, next);
  applyLanguage(next);
  if (!el.gate.hidden) renderGate();
  else { renderTab(); updateBar(); }
}

const LANG_THEME_TOOLS = () => `<div class="login-tools">
  <button class="icon-btn lang-btn" type="button" data-lang-toggle></button>
  <button class="icon-btn" type="button" data-theme-toggle>
    <svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>
    <svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>
  </button>
</div>`;

/** "Tap again to confirm" without a dialog. Returns true on the second tap. */
function confirmTap(key, button, label) {
  if (ui.armed.has(key)) {
    clearTimeout(ui.armed.get(key));
    ui.armed.delete(key);
    return true;
  }
  const original = button.textContent;
  button.textContent = label;
  button.classList.add('is-armed');
  ui.armed.set(key, setTimeout(() => {
    ui.armed.delete(key);
    if (button.isConnected) { button.textContent = original; button.classList.remove('is-armed'); }
  }, 3000));
  return false;
}

/* ---------- Sign in + setup ---------- */
function showGate(gate, message = '') {
  ui.gate = gate;
  el.panel.hidden = true;
  el.gate.hidden = false;
  renderGate(message);
}

function renderGate(message = '') {
  const brand = `<div class="login-brand">
      <span class="wordmark wordmark-sm" role="img" aria-label="Ami"></span>
      <span class="eyebrow">${t('onlineAdmin')}</span>
    </div>`;
  if (ui.gate === 'login') {
    el.gate.innerHTML = `<form class="login-card" id="loginForm" novalidate>
      ${brand}
      <h1>${t('signInTitle')}</h1>
      <p class="muted">${t('signInBody')}</p>
      <label class="field"><span>${t('username')}</span><input name="user" autocomplete="username" dir="ltr" autocapitalize="none" spellcheck="false" required></label>
      <label class="field"><span>${t('password')}</span><input name="pass" type="password" autocomplete="current-password" dir="ltr" required></label>
      <label class="check-row"><input type="checkbox" name="remember"><span>${t('rememberMe')}</span></label>
      <p class="form-error" role="alert">${esc(message)}</p>
      <button class="btn btn-wide" type="submit">${t('signIn')}</button>
      <button class="text-btn gate-link" type="button" data-gate="setup">${t('setupLink')}</button>
      ${LANG_THEME_TOOLS()}
    </form>`;
  } else {
    el.gate.innerHTML = `<form class="login-card login-card-wide" id="setupForm" novalidate>
      ${brand}
      <h1>${t('setupTitle')}</h1>
      <p class="muted">${t('setupBody')}</p>
      <ol class="setup-steps">
        <li>${t('setupStep1')} <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer" dir="ltr">github.com/settings/personal-access-tokens/new</a></li>
        <li>${t('setupStep2')}</li>
        <li>${t('setupStep3')}</li>
        <li>${t('setupStep4')}</li>
        <li>${t('setupStep5')}</li>
      </ol>
      <label class="field"><span>${t('ghKey')}</span><input name="key" type="password" autocomplete="off" dir="ltr" placeholder="github_pat_…" spellcheck="false" required></label>
      <label class="field"><span>${t('chooseUsername')}</span><input name="user" autocomplete="username" dir="ltr" autocapitalize="none" spellcheck="false" required></label>
      <label class="field"><span>${t('choosePassword')}</span><input name="pass" type="password" autocomplete="new-password" dir="ltr" minlength="${MIN_PASSWORD}" required><small>${t('passwordRule')}</small></label>
      <label class="field"><span>${t('confirmPassword')}</span><input name="pass2" type="password" autocomplete="new-password" dir="ltr" required></label>
      <p class="form-error" role="alert">${esc(message)}</p>
      <button class="btn btn-wide" type="submit">${t('setupButton')}</button>
      ${data.auth ? `<button class="text-btn gate-link" type="button" data-gate="login">${t('backToSignIn')}</button>` : ''}
      ${LANG_THEME_TOOLS()}
    </form>`;
  }
  labelButtons();
  $('input', el.gate)?.focus();
}

/** Disables the form while working; shows the error under it if one is thrown */
async function busy(form, work) {
  const btn = $('[type=submit]', form);
  const label = btn.textContent;
  const error = $('.form-error', form);
  error.textContent = '';
  btn.disabled = true;
  btn.textContent = t('checking');
  try {
    await work();
  } catch (err) {
    if (form.isConnected) error.textContent = err instanceof GhError ? errorText(err.code) : (err.message || errorText('generic'));
  } finally {
    if (form.isConnected) { btn.disabled = false; btn.textContent = label; }
  }
}

function checkNewLogin(user, pass, pass2) {
  if (!user.trim()) throw new GhError('missing_user');
  if (pass.length < MIN_PASSWORD) throw new GhError('weak_password');
  if (pass !== pass2) throw new Error(t('passwordMismatch'));
}

async function submitLogin(form) {
  const f = new FormData(form);
  await busy(form, async () => {
    if (!data.auth) throw new GhError('not_set_up');
    token = await unlockKey(data.auth, f.get('user'), f.get('pass'));
    await loadMenu(); // also proves the key still works
    keepToken(f.get('remember') === 'on');
    enterPanel();
  });
  if (!el.gate.hidden && token) forgetToken(); // the key failed after unlocking
}

async function submitSetup(form) {
  const f = new FormData(form);
  await busy(form, async () => {
    const key = f.get('key').trim();
    if (!key) throw new GhError('missing_key');
    checkNewLogin(f.get('user'), f.get('pass'), f.get('pass2'));
    token = key;
    try {
      await loadMenu(); // can read
      await saveAuth(f.get('user'), f.get('pass'), 'Set up the online admin sign-in'); // can write
    } catch (err) {
      token = null;
      throw err;
    }
    keepToken(false);
    enterPanel();
  });
}

/* ---------- Panel ---------- */
function enterPanel() {
  el.gate.hidden = true;
  el.gate.innerHTML = '';
  el.panel.hidden = false;
  switchTab(ui.tab);
  updateBar();
}

function signOut() {
  if (isDirty() && !confirm(t('leaveWarning'))) return;
  forgetToken();
  data.menu = null;
  data.original = '';
  showGate(data.auth ? 'login' : 'setup');
}

function switchTab(tab) {
  ui.tab = tab;
  store.set(KEYS.tab, tab);
  $$('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  TABS.forEach(name => { el.panels[name].hidden = name !== tab; });
  renderTab();
}

function renderTab() {
  if (ui.tab === 'menu') renderMenuTab();
  if (ui.tab === 'account') renderAccountTab();
}

function showError(err) {
  if (err.code === 'bad_key') { forgetToken(); showGate('setup', errorText('bad_key')); return; }
  el.errorText.textContent = errorText(err.code);
  $('#reloadBtn').hidden = err.code !== 'conflict';
  el.errorBanner.hidden = false;
}

/* ---------- Menu file ---------- */
const serialize = () => JSON.stringify(data.menu.map(c => ({
  ...c,
  items: c.items.map(({ key, ...it }) => it),
})), null, 1);

const isDirty = () => !!data.menu && serialize() !== data.original;

async function loadMenu() {
  let file;
  try {
    file = await gh(contentsUrl(MENU_PATH));
  } catch (err) {
    throw err.code === 'not_found' ? new GhError('no_access', 404) : err;
  }
  data.sha = file.sha;
  data.menu = JSON.parse(b64ToText(file.content));
  data.menu.forEach(c => c.items.forEach(it => { it.key = nextKey++; }));
  data.original = serialize();
}

/** How many drinks differ from the published menu */
function changeCount() {
  if (!data.menu) return 0;
  const flat = menu => new Map(menu.flatMap(c => c.items.map(({ key, ...it }) => [it.code, JSON.stringify({ ...it, cat: c.id })])));
  const before = flat(JSON.parse(data.original));
  const after = flat(data.menu);
  let n = 0;
  for (const [code, v] of after) if (before.get(code) !== v) n++;
  for (const code of before.keys()) if (!after.has(code)) n++;
  return n || (isDirty() ? 1 : 0); // e.g. only the order changed
}

function updateBar() {
  const n = changeCount();
  el.bar.hidden = n === 0 && !ui.publishing;
  el.count.textContent = ui.publishing ? t('publishing') : t('unsaved', n);
  el.publish.disabled = ui.publishing;
  el.discard.disabled = ui.publishing;
  document.body.classList.toggle('has-publish-bar', !el.bar.hidden);
}

async function publish() {
  if (!isDirty() || ui.publishing) return;
  ui.publishing = true;
  updateBar();
  try {
    const text = serialize();
    data.sha = await putFile(MENU_PATH, text, data.sha, 'Menu update from the online admin');
    data.original = text;
    el.errorBanner.hidden = true;
    toast(t('published'));
  } catch (err) {
    showError(err);
  } finally {
    ui.publishing = false;
    updateBar();
  }
}

function discard(button) {
  if (!confirmTap('discard', button, t('confirmDiscard'))) return;
  data.menu = JSON.parse(data.original);
  data.menu.forEach(c => c.items.forEach(it => { it.key = nextKey++; }));
  button.textContent = t('discard');
  button.classList.remove('is-armed');
  renderTab();
  updateBar();
  toast(t('discarded'));
}

async function reloadMenu() {
  try {
    await loadMenu();
    el.errorBanner.hidden = true;
    renderTab();
    updateBar();
  } catch (err) {
    showError(err);
  }
}

/* ---------- Menu tab ---------- */
const findItem = key => {
  for (const cat of data.menu) {
    const item = cat.items.find(i => i.key === key);
    if (item) return { item, cat };
  }
  return null;
};

function renderMenuTab() {
  const panel = el.panels.menu;
  if (!data.menu) { panel.innerHTML = ''; return; }
  panel.innerHTML = `
    <div class="tool-row">
      <label class="search search-sm" for="menuSearch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="menuSearch" type="search" autocomplete="off" placeholder="${esc(t('searchMenu'))}" aria-label="${esc(t('searchMenu'))}" value="${esc(ui.menuQuery)}">
      </label>
      <button class="btn" type="button" id="addItem">${ICONS.plus}<span>${t('addItem')}</span></button>
    </div>
    ${data.menu.map(c => `
      <section class="admin-cat" data-cat="${esc(c.id)}" style="--cat:${esc(c.color)}">
        <h2><span class="cat-dot" aria-hidden="true"></span>${esc(pick(c.name))} <small>${t('items', num(c.items.length))}</small></h2>
        <ul class="item-rows">${c.items.map(it => `
          <li class="item-row${it.available === false ? ' is-out' : ''}" data-key="${it.key}" data-hay="${esc(fold(it.name.join(' ')))}">
            <div class="cell-name">
              <b>${esc(pick(it.name))}</b>
              <small>${esc(getLang() === 'fa' ? it.name[0] : it.name[1])}</small>
            </div>
            <label class="cell-price">
              <input class="price-input" type="text" inputmode="numeric" dir="ltr" value="${it.price}" data-price="${it.key}" aria-label="${esc(`${t('price')}: ${pick(it.name)}`)}">
              <span class="price-preview">${money(it.price)}</span>
            </label>
            <label class="cell-avail" title="${esc(t('available'))}">
              <input type="checkbox" class="switch" data-avail="${it.key}" ${it.available === false ? '' : 'checked'} aria-label="${esc(`${t('available')}: ${pick(it.name)}`)}">
            </label>
            <button class="icon-btn icon-btn-sm" type="button" data-edit="${it.key}" aria-label="${esc(`${t('edit')}: ${pick(it.name)}`)}">${ICON_EDIT}</button>
          </li>`).join('')}</ul>
      </section>`).join('')}`;
  filterMenu();
}

function filterMenu() {
  const q = fold(ui.menuQuery.trim());
  $$('.admin-cat', el.panels.menu).forEach(sec => {
    let shown = 0;
    $$('.item-row', sec).forEach(row => {
      const match = !q || row.dataset.hay.includes(q);
      row.hidden = !match;
      if (match) shown++;
    });
    sec.hidden = shown === 0;
  });
}

/** Whole number from what was typed (Persian digits and commas allowed), or null */
const readPrice = raw => {
  const s = latinDigits(String(raw)).replace(/[,،٬\s]/g, '');
  return /^\d{1,10}$/.test(s) ? Number(s) : (s === '' ? 0 : null);
};

const setAvailable = (item, on) => { if (on) delete item.available; else item.available = false; };

function changePrice(input) {
  const { item } = findItem(Number(input.dataset.price)) ?? {};
  if (!item) return;
  const price = readPrice(input.value);
  const row = input.closest('.item-row');
  if (price === null) { toast(errorText('bad_price')); input.value = item.price; return; }
  item.price = price;
  input.value = price;
  $('.price-preview', row).textContent = money(price);
  updateBar();
  toast(t('priceChanged', pick(item.name)));
}

function changeAvailable(input) {
  const { item } = findItem(Number(input.dataset.avail)) ?? {};
  if (!item) return;
  setAvailable(item, input.checked);
  input.closest('.item-row').classList.toggle('is-out', !input.checked);
  updateBar();
  toast(t('availabilityChanged', pick(item.name), input.checked));
}

function openItemDialog(key = null) {
  const found = key ? findItem(key) : null;
  const cats = data.menu;
  editing = found
    ? { key, category: found.cat.id, nameEn: found.item.name[0], nameFa: found.item.name[1], price: found.item.price, temp: found.item.temp || '', available: found.item.available !== false }
    : { key: null, category: cats[0].id, nameEn: '', nameFa: '', price: 0, temp: '', available: true };

  el.itemDialog.innerHTML = `<form class="sheet-inner" id="itemForm" novalidate>
    <header class="sheet-head">
      <div class="sheet-title"><h2 id="itemDialogTitle">${t(key ? 'editItem' : 'newItem')}</h2></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('close')}">${ICONS.close}</button>
    </header>
    <div class="sheet-body">
      <label class="field"><span>${t('category')}</span>
        <select name="category">${cats.map(c => `<option value="${esc(c.id)}" ${c.id === editing.category ? 'selected' : ''}>${esc(pick(c.name))}</option>`).join('')}</select>
      </label>
      <div class="field-row">
        <label class="field"><span>${t('nameEn')}</span><input name="nameEn" dir="ltr" maxlength="60" value="${esc(editing.nameEn)}" required></label>
        <label class="field"><span>${t('nameFa')}</span><input name="nameFa" dir="rtl" lang="fa" maxlength="60" value="${esc(editing.nameFa)}" required></label>
      </div>
      <div class="field-row">
        <label class="field"><span>${t('price')}</span><input name="price" inputmode="numeric" dir="ltr" value="${editing.price}"></label>
        <label class="field"><span>${t('temperature')}</span>
          <select name="temp">
            <option value="" ${editing.temp === '' ? 'selected' : ''}>${t('tempDefault')}</option>
            <option value="hot" ${editing.temp === 'hot' ? 'selected' : ''}>${t('tempHot')}</option>
            <option value="cold" ${editing.temp === 'cold' ? 'selected' : ''}>${t('tempCold')}</option>
          </select>
        </label>
      </div>
      <label class="switch-row">
        <span><b>${t('available')}</b><small>${t('availableHint')}</small></span>
        <input type="checkbox" class="switch" name="available" ${editing.available ? 'checked' : ''}>
      </label>
      <p class="form-error" id="itemError" role="alert"></p>
    </div>
    <footer class="sheet-foot">
      ${key ? `<button class="btn btn-ghost btn-danger-text" type="button" id="deleteItem">${t('delete')}</button>` : ''}
      <button class="btn btn-wide" type="submit">${t('save')}</button>
    </footer>
  </form>`;
  el.itemDialog.setAttribute('aria-labelledby', 'itemDialogTitle');
  openDialog(el.itemDialog);
}

/** Stable id for a new drink (customers' saved drinks use it), same rule as the café server */
function uniqueCode(category, nameEn) {
  const slug = nameEn.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  const taken = new Set(data.menu.flatMap(c => c.items.map(i => i.code)));
  const base = `${category}--${slug}`;
  let code = base;
  for (let n = 2; taken.has(code); n++) code = `${base}-${n}`;
  return code;
}

function submitItem(form) {
  const f = new FormData(form);
  const error = $('#itemError', el.itemDialog);
  const nameEn = f.get('nameEn').trim().replace(/\s+/g, ' ');
  const nameFa = f.get('nameFa').trim().replace(/\s+/g, ' ');
  const price = readPrice(f.get('price'));
  error.textContent = '';
  if (!nameEn) { error.textContent = errorText('missing_nameEn'); return; }
  if (!nameFa) { error.textContent = errorText('missing_nameFa'); return; }
  if (price === null) { error.textContent = errorText('bad_price'); return; }

  const category = f.get('category');
  const temp = ['hot', 'cold'].includes(f.get('temp')) ? f.get('temp') : null;
  const target = data.menu.find(c => c.id === category);
  let item;
  if (editing.key) {
    const found = findItem(editing.key);
    item = found.item;
    if (found.cat.id !== category) {
      found.cat.items.splice(found.cat.items.indexOf(item), 1);
      target.items.push(item);
    }
    Object.assign(item, { name: [nameEn, nameFa], price, temp });
  } else {
    item = { code: uniqueCode(category, nameEn), name: [nameEn, nameFa], price, temp, key: nextKey++ };
    target.items.push(item);
  }
  setAvailable(item, f.get('available') === 'on');
  el.itemDialog.close();
  renderMenuTab();
  updateBar();
  toast(t('changedNotPublished'));
}

function deleteItem(button) {
  if (!confirmTap(`delete-${editing.key}`, button, t('confirmDelete'))) return;
  const { item, cat } = findItem(editing.key);
  cat.items.splice(cat.items.indexOf(item), 1);
  el.itemDialog.close();
  renderMenuTab();
  updateBar();
  toast(t('deleted', pick(item.name)));
}

/* ---------- Account tab ---------- */
function renderAccountTab() {
  el.panels.account.innerHTML = `
    <p class="banner">${t('cafeAdminNote')}</p>
    <form class="settings-card" id="loginChangeForm" novalidate>
      <h2>${t('changeLogin')}</h2>
      <label class="field"><span>${t('currentUsername')}</span><input name="user" autocomplete="username" dir="ltr" autocapitalize="none" spellcheck="false"></label>
      <label class="field"><span>${t('currentPassword')}</span><input name="pass" type="password" autocomplete="current-password" dir="ltr"></label>
      <label class="field"><span>${t('newUsername')}</span><input name="newUser" autocomplete="off" dir="ltr" autocapitalize="none" spellcheck="false"></label>
      <label class="field"><span>${t('newPassword')}</span><input name="newPass" type="password" autocomplete="new-password" dir="ltr"><small>${t('passwordRule')}</small></label>
      <label class="field"><span>${t('confirmPassword')}</span><input name="newPass2" type="password" autocomplete="new-password" dir="ltr"></label>
      <p class="form-error" role="alert"></p>
      <button class="btn" type="submit">${t('save')}</button>
    </form>
    <section class="settings-card">
      <h2>${t('newKeyTitle')}</h2>
      <p class="muted">${t('newKeyBody')}</p>
      <button class="btn btn-ghost" type="button" id="newKeyBtn">${t('newKeyButton')}</button>
    </section>
    <section class="settings-card">
      <h2>${t('historyTitle')}</h2>
      <p class="muted">${t('historyBody')}</p>
      <a class="btn btn-ghost" href="https://github.com/${OWNER}/${REPO}/commits/${BRANCH}/${MENU_PATH}" target="_blank" rel="noopener noreferrer">${t('historyLink')}</a>
    </section>`;
}

async function submitLoginChange(form) {
  const f = new FormData(form);
  await busy(form, async () => {
    await unlockKey(data.auth, f.get('user'), f.get('pass')); // proves the current login
    checkNewLogin(f.get('newUser'), f.get('newPass'), f.get('newPass2'));
    await saveAuth(f.get('newUser'), f.get('newPass'), 'Change the online admin sign-in');
    form.reset();
    toast(t('loginChanged'));
  });
}

/* ---------- Events ---------- */
function bindEvents() {
  document.addEventListener('click', e => {
    if (e.target.closest('[data-lang-toggle]')) switchLanguage();
    if (e.target.closest('[data-theme-toggle]')) { toggleTheme(); labelButtons(); }
  });

  el.gate.addEventListener('submit', e => {
    e.preventDefault();
    if (e.target.id === 'loginForm') submitLogin(e.target);
    if (e.target.id === 'setupForm') submitSetup(e.target);
  });
  el.gate.addEventListener('click', e => {
    const go = e.target.closest('[data-gate]');
    if (go) showGate(go.dataset.gate);
  });

  $('#logoutBtn').addEventListener('click', signOut);
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  el.publish.addEventListener('click', publish);
  el.discard.addEventListener('click', () => discard(el.discard));
  $('#reloadBtn').addEventListener('click', reloadMenu);

  el.panels.menu.addEventListener('input', e => {
    if (e.target.id === 'menuSearch') { ui.menuQuery = e.target.value; filterMenu(); }
  });
  el.panels.menu.addEventListener('change', e => {
    if (e.target.matches('[data-price]')) changePrice(e.target);
    if (e.target.matches('[data-avail]')) changeAvailable(e.target);
  });
  el.panels.menu.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('.price-input')) e.target.blur();
  });
  el.panels.menu.addEventListener('click', e => {
    if (e.target.closest('#addItem')) return openItemDialog();
    const edit = e.target.closest('[data-edit]');
    if (edit) openItemDialog(Number(edit.dataset.edit));
  });

  wireDialog(el.itemDialog);
  el.itemDialog.addEventListener('submit', e => { e.preventDefault(); submitItem(e.target); });
  el.itemDialog.addEventListener('click', e => {
    const del = e.target.closest('#deleteItem');
    if (del) deleteItem(del);
  });

  el.panels.account.addEventListener('submit', e => {
    e.preventDefault();
    if (e.target.id === 'loginChangeForm') submitLoginChange(e.target);
  });
  el.panels.account.addEventListener('click', e => {
    if (!e.target.closest('#newKeyBtn')) return;
    if (isDirty() && !confirm(t('leaveWarning'))) return;
    forgetToken();
    showGate('setup');
  });

  window.addEventListener('beforeunload', e => {
    if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });
}

/* ---------- Start ---------- */
async function start() {
  useStrings(GH_STRINGS);
  initTheme();
  applyLanguage(store.get(KEYS.lang, 'fa'));
  bindEvents();
  await loadAuthFile();
  token = readToken();
  if (token) {
    try {
      await loadMenu();
      enterPanel();
      return;
    } catch (err) {
      forgetToken();
      if (err.code !== 'bad_key' && err.code !== 'no_access') { showGate(data.auth ? 'login' : 'setup', errorText(err.code)); return; }
    }
  }
  showGate(data.auth ? 'login' : 'setup');
}

start();
