/* =============================================================
   AMI café — admin panel
   Orders board, menu editing, club members, settings.
   ============================================================= */
import { $, $$, store, esc, fold, toast, openDialog, wireDialog, initTheme, toggleTheme, currentTheme, ICONS } from './util.js';
import { useStrings, setLangValue, getLang, setCurrency, translatePage, t, pick, num, money, moneyParts, errorText, timeAgo, clock, shortDate } from './i18n.js';
import { ADMIN_STRINGS } from './admin-strings.js';
import { api } from './api.js';

const KEYS = { lang: 'ami-admin-lang', sound: 'ami-admin-sound', tab: 'ami-admin-tab' };
const POLL_MS = 5000;
const TABS = ['orders', 'menu', 'club', 'settings'];
const BOARD = [
  { status: 'new', title: 'colNew', next: 'preparing', action: 'start' },
  { status: 'preparing', title: 'colPreparing', next: 'ready', action: 'markReady' },
  { status: 'ready', title: 'colReady', next: 'done', action: 'collected' },
];

const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>';

const ui = {
  tab: TABS.includes(store.get(KEYS.tab, 'orders')) ? store.get(KEYS.tab, 'orders') : 'orders',
  sound: store.get(KEYS.sound, true),
  menuQuery: '',
  memberQuery: '',
  armed: new Map(), // button key → timeout, for "tap again to confirm"
  flash: new Set(), // order ids to highlight as new
};

const data = {
  orders: [],
  stats: { orders: 0, revenue: 0, drinks: 0 },
  menu: null,
  settings: null,
  members: [],
  membersTotal: 0,
  perReward: 10,
};

let seenOrderIds = null; // null until the first load, so old orders don't ring
let boardSignature = '';
let pollTimer = null;
let audio = null;
let editing = null; // item being edited in the dialog

const el = {
  loginView: $('#loginView'),
  loginForm: $('#loginForm'),
  loginError: $('#loginError'),
  panelView: $('#panelView'),
  newCount: $('#newCount'),
  pwBanner: $('#defaultPwBanner'),
  offlineBanner: $('#offlineBanner'),
  soundBtn: $('#soundBtn'),
  itemDialog: $('#itemDialog'),
  panels: Object.fromEntries(TABS.map(tab => [tab, $(`#tab-${tab}`)])),
};

/* ---------- Language + theme ---------- */
function labelButtons() {
  $$('[data-lang-toggle]').forEach(b => {
    b.textContent = t('switchTo');
    b.lang = getLang() === 'fa' ? 'en' : 'fa';
    b.setAttribute('aria-label', t('switchToLabel'));
  });
  $$('[data-theme-toggle]').forEach(b => b.setAttribute('aria-label', t(currentTheme() === 'dark' ? 'toLight' : 'toDark')));
  el.soundBtn.setAttribute('aria-pressed', String(ui.sound));
  el.soundBtn.setAttribute('aria-label', t(ui.sound ? 'soundOn' : 'soundOff'));
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
  boardSignature = '';
  if (!el.panelView.hidden) renderTab();
}

/* ---------- Errors ---------- */
function handleError(err, target) {
  if (err.code === 'unauthorized') {
    showLogin(errorText('unauthorized'));
    return;
  }
  if (err.code === 'change_password') {
    if (ui.tab !== 'settings') switchTab('settings');
    toast(errorText('change_password'));
    return;
  }
  const msg = errorText(err.code);
  if (target) target.textContent = msg;
  else toast(msg);
}

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

/* ---------- Sign in ---------- */
function showLogin(message = '') {
  clearInterval(pollTimer);
  el.panelView.hidden = true;
  el.loginView.hidden = false;
  el.loginError.textContent = message;
  $('#loginPassword').value = '';
  $('#loginPassword').focus();
}

async function enterPanel(me) {
  el.loginView.hidden = true;
  el.panelView.hidden = false;
  el.pwBanner.hidden = !me.defaultPassword;
  try {
    await loadSettings();
  } catch (err) {
    handleError(err);
  }
  // The default password is public, so the server keeps the panel locked until it is changed
  if (me.defaultPassword) { switchTab('settings'); return; }
  switchTab(ui.tab);
  await startOrders();
}

async function startOrders() {
  await loadOrders();
  clearInterval(pollTimer);
  pollTimer = setInterval(loadOrders, POLL_MS);
}

async function signIn(e) {
  e.preventDefault();
  el.loginError.textContent = '';
  const btn = $('[type=submit]', el.loginForm);
  btn.disabled = true;
  try {
    const me = await api('admin-login', { password: $('#loginPassword').value });
    unlockAudio();
    await enterPanel(me);
  } catch (err) {
    el.loginError.textContent = errorText(err.code);
  } finally {
    btn.disabled = false;
  }
}

async function signOut() {
  try { await api('admin-logout', {}); } catch { /* already signed out */ }
  seenOrderIds = null;
  showLogin();
}

/* ---------- Tabs ---------- */
function switchTab(tab) {
  if (!el.pwBanner.hidden && tab !== 'settings') { // locked until the default password is changed
    toast(errorText('change_password'));
    tab = 'settings';
  }
  ui.tab = tab;
  store.set(KEYS.tab, tab);
  $$('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  TABS.forEach(name => { el.panels[name].hidden = name !== tab; });
  boardSignature = '';
  renderTab(true);
}

async function renderTab(fetchFirst = false) {
  try {
    if (ui.tab === 'orders') renderOrders();
    if (ui.tab === 'menu') {
      if (fetchFirst || !data.menu) await loadMenu();
      renderMenuTab();
    }
    if (ui.tab === 'club') {
      if (fetchFirst) await loadMembers();
      renderClubTab();
    }
    if (ui.tab === 'settings') renderSettingsTab();
  } catch (err) {
    handleError(err);
  }
}

/* ---------- Sound ---------- */
function unlockAudio() {
  try {
    audio ||= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* no audio */ }
}

function chime() {
  if (!ui.sound || !audio) return;
  const now = audio.currentTime;
  [784, 1175].forEach((freq, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const at = now + i * 0.16;
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    osc.connect(gain).connect(audio.destination);
    osc.start(at);
    osc.stop(at + 0.45);
  });
}

/* ---------- Orders ---------- */
async function loadOrders() {
  try {
    const r = await api('admin-orders');
    data.orders = r.orders;
    data.stats = r.stats;
    el.offlineBanner.hidden = true;
    noticeNewOrders();
    if (ui.tab === 'orders') renderOrders();
  } catch (err) {
    if (err.code === 'unauthorized' || err.code === 'change_password') return handleError(err);
    el.offlineBanner.hidden = false;
  }
}

function noticeNewOrders() {
  const fresh = seenOrderIds ? data.orders.filter(o => o.status === 'new' && !seenOrderIds.has(o.id)) : [];
  seenOrderIds = new Set([...(seenOrderIds ?? []), ...data.orders.map(o => o.id)]);
  if (fresh.length) {
    fresh.forEach(o => ui.flash.add(o.id));
    chime();
    toast(t('newOrderToast', num(fresh[0].number)));
  }
  const waiting = data.orders.filter(o => o.status === 'new').length;
  el.newCount.textContent = num(waiting);
  el.newCount.hidden = waiting === 0;
  document.title = waiting ? `(${waiting}) AMI Admin` : 'AMI Admin';
}

function ticketHtml(o, column) {
  const where = o.type === 'dine-in' ? (o.table ? t('tableN', num(o.table)) : t('dineIn')) : t('takeaway');
  const flash = ui.flash.has(o.id) ? ' is-flash' : '';
  return `<article class="ticket is-${o.status}${flash}" data-order="${o.id}">
    <header>
      <b class="ticket-no">${t('orderNo', num(o.number))}</b>
      <span class="ticket-time" data-time="${o.createdAt}" title="${clock(o.createdAt)}">${timeAgo(o.createdAt)}</span>
    </header>
    <div class="ticket-meta">
      <span class="pill">${esc(where)}</span>
      ${o.member ? `<span class="pill pill-member">★ ${esc(o.member.name)}</span>` : ''}
      ${o.rewardUsed ? `<span class="pill pill-ready">${t('freeDrinkUsed')}</span>` : ''}
    </div>
    <ul class="ticket-lines">${o.lines.map(l => `<li>
      <b>${num(l.qty)}×</b>
      <span>${esc(pick(l.names))}
        ${l.extras.length ? `<small>+ ${esc(l.extras.map(pick).join('، '))}</small>` : ''}
        ${l.note ? `<em>“${esc(l.note)}”</em>` : ''}
      </span>
    </li>`).join('')}</ul>
    ${o.note ? `<p class="ticket-note">${esc(o.note)}</p>` : ''}
    <footer>
      <span class="ticket-total">${money(o.total)}</span>
      <div class="ticket-actions">
        <button class="btn btn-ghost btn-sm" type="button" data-cancel="${o.id}">${t('cancel')}</button>
        <button class="btn btn-sm" type="button" data-next="${o.id}" data-status="${column.next}">${t(column.action)}</button>
      </div>
    </footer>
  </article>`;
}

function renderOrders() {
  const panel = el.panels.orders;
  const signature = JSON.stringify([data.orders, data.stats, data.settings?.orderingOpen, getLang(), [...ui.flash]]);
  if (signature === boardSignature && panel.childElementCount) return;
  boardSignature = signature;

  const finished = data.orders.filter(o => o.status === 'done' || o.status === 'cancelled');
  const open = data.settings?.orderingOpen ?? true;
  const wasOpen = $('.finished', panel)?.open ?? false;
  const revenue = moneyParts(data.stats.revenue);

  panel.innerHTML = `
    <div class="stats">
      <div class="stat"><span>${t('todayOrders')}</span><b>${num(data.stats.orders)}</b></div>
      <div class="stat"><span>${t('todayRevenue')}</span><b>${revenue.amount}${revenue.unit ? `<small>${esc(revenue.unit)}</small>` : ''}</b></div>
      <div class="stat"><span>${t('todayDrinks')}</span><b>${num(data.stats.drinks)}</b></div>
      <label class="stat stat-toggle ${open ? 'is-on' : 'is-off'}">
        <span>${t(open ? 'orderingOpen' : 'orderingPaused')}</span>
        <input type="checkbox" class="switch" id="quickOrdering" ${open ? 'checked' : ''}>
      </label>
    </div>

    <div class="board">${BOARD.map(col => {
      const list = data.orders.filter(o => o.status === col.status).sort((a, b) => a.createdAt - b.createdAt);
      return `<section class="col col-${col.status}">
        <h2>${t(col.title)} <span class="col-count">${num(list.length)}</span></h2>
        <div class="tickets">${list.length ? list.map(o => ticketHtml(o, col)).join('') : `<p class="col-empty">${t('noOrders')}</p>`}</div>
      </section>`;
    }).join('')}</div>

    ${finished.length ? `<details class="finished" ${wasOpen ? 'open' : ''}>
      <summary>${t('finishedToday', num(finished.length))}</summary>
      <ul class="finished-list">${finished.map(o => `<li>
        <b>${t('orderNo', num(o.number))}</b>
        <span>${clock(o.createdAt)}</span>
        <span class="finished-items">${esc(o.lines.map(l => `${num(l.qty)}× ${pick(l.names)}`).join('، '))}</span>
        <span class="pill pill-${o.status}">${t('statusLabel')[o.status]}</span>
        <span class="finished-total">${money(o.total)}</span>
      </li>`).join('')}</ul>
    </details>` : ''}`;

  // New-order highlight lasts one render cycle after it is seen
  setTimeout(() => ui.flash.clear(), 6000);
}

async function setOrderStatus(id, status, button) {
  button.disabled = true;
  try {
    const { order } = await api('admin-order-status', { id, status });
    const i = data.orders.findIndex(o => o.id === id);
    if (i >= 0) data.orders[i] = order;
    renderOrders();
    loadOrders();
  } catch (err) {
    handleError(err);
    button.disabled = false;
    loadOrders();
  }
}

/* ---------- Settings (shared by the quick toggle and the Settings tab) ---------- */
async function loadSettings() {
  data.settings = await api('admin-settings');
  setCurrency(data.settings.currency);
}

const settingsBody = s => ({
  orderingOpen: s.orderingOpen,
  currencyEn: s.currency[0],
  currencyFa: s.currency[1],
  stampsPerReward: s.stampsPerReward,
  defaultLang: s.defaultLang,
});

async function saveSettings(body) {
  data.settings = await api('admin-settings', body);
  setCurrency(data.settings.currency);
  boardSignature = '';
}

/* ---------- Menu ---------- */
async function loadMenu() {
  data.menu = await api('menu');
  setCurrency(data.menu.settings.currency);
}

const findItem = key => {
  for (const cat of data.menu.categories) {
    const item = cat.items.find(i => i.key === key);
    if (item) return { item, cat };
  }
  return null;
};

function renderMenuTab() {
  const panel = el.panels.menu;
  panel.innerHTML = `
    <div class="tool-row">
      <label class="search search-sm" for="menuSearch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="menuSearch" type="search" autocomplete="off" placeholder="${esc(t('searchMenu'))}" aria-label="${esc(t('searchMenu'))}" value="${esc(ui.menuQuery)}">
      </label>
      <button class="btn" type="button" id="addItem">${ICONS.plus}<span>${t('addItem')}</span></button>
    </div>
    ${data.menu.categories.map(c => `
      <section class="admin-cat" data-cat="${c.id}" style="--cat:${c.color}">
        <h2><span class="cat-dot" aria-hidden="true"></span>${esc(pick(c.name))} <small>${t('items', num(c.items.length))}</small></h2>
        <ul class="item-rows">${c.items.map(it => `
          <li class="item-row${it.available ? '' : ' is-out'}" data-key="${it.key}" data-hay="${esc(fold(it.names.join(' ')))}">
            <div class="cell-name">
              <b>${esc(pick(it.names))}</b>
              <small>${esc(getLang() === 'fa' ? it.names[0] : it.names[1])}</small>
            </div>
            <label class="cell-price">
              <input class="price-input" type="text" inputmode="numeric" dir="ltr" value="${it.price}" data-price="${it.key}" aria-label="${esc(`${t('price')}: ${pick(it.names)}`)}">
              <span class="price-preview">${money(it.price)}</span>
            </label>
            <label class="cell-avail" title="${esc(t('available'))}">
              <input type="checkbox" class="switch" data-avail="${it.key}" ${it.available ? 'checked' : ''} aria-label="${esc(`${t('available')}: ${pick(it.names)}`)}">
            </label>
            <button class="icon-btn icon-btn-sm" type="button" data-edit="${it.key}" aria-label="${esc(`${t('edit')}: ${pick(it.names)}`)}">${ICON_EDIT}</button>
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

async function saveItemPatch(key, patch, message) {
  const found = findItem(key);
  if (!found) return;
  const { item, cat } = found;
  try {
    const { item: saved } = await api('admin-item-save', {
      id: item.key,
      category: cat.id,
      nameEn: item.names[0],
      nameFa: item.names[1],
      price: item.price,
      temp: item.temp || '',
      available: item.available,
      ...patch,
    });
    Object.assign(item, saved);
    const row = $(`.item-row[data-key="${key}"]`, el.panels.menu);
    if (row) {
      row.classList.toggle('is-out', !saved.available);
      $('.price-input', row).value = saved.price;
      $('.price-preview', row).textContent = money(saved.price);
    }
    toast(message(saved));
  } catch (err) {
    handleError(err);
    renderMenuTab();
  }
}

function openItemDialog(key = null) {
  const found = key ? findItem(key) : null;
  const cats = data.menu.categories;
  editing = found
    ? { key, category: found.cat.id, nameEn: found.item.names[0], nameFa: found.item.names[1], price: found.item.price, temp: found.item.temp || '', available: found.item.available }
    : { key: null, category: cats[0].id, nameEn: '', nameFa: '', price: 0, temp: '', available: true };

  el.itemDialog.innerHTML = `<form class="sheet-inner" id="itemForm" novalidate>
    <header class="sheet-head">
      <div class="sheet-title"><h2 id="itemDialogTitle">${t(key ? 'editItem' : 'newItem')}</h2></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('close')}">${ICONS.close}</button>
    </header>
    <div class="sheet-body">
      <label class="field"><span>${t('category')}</span>
        <select name="category">${cats.map(c => `<option value="${c.id}" ${c.id === editing.category ? 'selected' : ''}>${esc(pick(c.name))}</option>`).join('')}</select>
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

async function submitItem(form) {
  const f = new FormData(form);
  const error = $('#itemError', el.itemDialog);
  error.textContent = '';
  try {
    await api('admin-item-save', {
      id: editing.key,
      category: f.get('category'),
      nameEn: f.get('nameEn'),
      nameFa: f.get('nameFa'),
      price: f.get('price').trim() || '0',
      temp: f.get('temp'),
      available: f.get('available') === 'on',
    });
    el.itemDialog.close();
    toast(t('saved'));
    await loadMenu();
    renderMenuTab();
  } catch (err) {
    handleError(err, error);
  }
}

async function deleteItem(button) {
  if (!confirmTap(`delete-${editing.key}`, button, t('confirmDelete'))) return;
  try {
    const name = getLang() === 'fa' ? editing.nameFa : editing.nameEn;
    await api('admin-item-delete', { id: editing.key });
    el.itemDialog.close();
    toast(t('deleted', name));
    await loadMenu();
    renderMenuTab();
  } catch (err) {
    handleError(err, $('#itemError', el.itemDialog));
  }
}

/* ---------- Club ---------- */
async function loadMembers() {
  const r = await api('admin-members', null, { q: ui.memberQuery });
  data.members = r.members;
  data.membersTotal = r.total;
  data.perReward = r.stampsPerReward;
}

function renderClubTab() {
  const panel = el.panels.club;
  const hadFocus = document.activeElement?.id === 'memberSearch';
  const stepper = m => `<div class="stepper stepper-sm">
    <button type="button" data-stamp="-1" data-id="${m.id}" aria-label="${esc(`${t('removeStamp')}: ${m.name}`)}" ${m.stamps === 0 ? 'disabled' : ''}>${ICONS.minus}</button>
    <output>${num(m.stamps)}</output>
    <button type="button" data-stamp="1" data-id="${m.id}" aria-label="${esc(`${t('addStamp')}: ${m.name}`)}">${ICONS.plus}</button>
  </div>`;
  const reward = m => (m.stamps >= data.perReward ? ` <span class="pill pill-ready">${t('rewardReady')}</span>` : '');
  const tier = m => `<span class="tier tier-${m.tier}">${t('tier')[m.tier]}</span>`;

  // Wide screens: a table. Phones: one card per member, so the stamp buttons stay on screen.
  const rows = data.members.map(m => `<tr>
    <td><b>${esc(m.name)}</b>${reward(m)}</td>
    <td dir="ltr" class="mono">${esc(m.phone)}</td>
    <td>${stepper(m)}</td>
    <td class="mono">${num(m.totalDrinks)}</td>
    <td>${tier(m)}</td>
    <td class="muted">${shortDate(m.joinedAt)}</td>
  </tr>`).join('');
  const cards = data.members.map(m => `<li class="member-card">
    <div class="member-main">
      <b>${esc(m.name)}</b>
      <span dir="ltr" class="mono muted">${esc(m.phone)}</span>
      <span class="member-meta">${tier(m)}<span>${t('colDrinks')}: ${num(m.totalDrinks)}</span><span>${shortDate(m.joinedAt)}</span></span>
      ${reward(m)}
    </div>
    <div class="member-stamps"><small>${t('colStamps')}</small>${stepper(m)}</div>
  </li>`).join('');

  panel.innerHTML = `
    <div class="tool-row">
      <label class="search search-sm" for="memberSearch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="memberSearch" type="search" autocomplete="off" placeholder="${esc(t('searchMembers'))}" aria-label="${esc(t('searchMembers'))}" value="${esc(ui.memberQuery)}">
      </label>
      <span class="muted">${t('members', num(data.membersTotal))}</span>
    </div>
    ${data.members.length ? `<ul class="member-cards">${cards}</ul>
    <div class="table-wrap members-table"><table class="data-table">
      <thead><tr>
        <th>${t('colName')}</th><th>${t('colPhone')}</th><th>${t('colStamps')}</th>
        <th>${t('colDrinks')}</th><th>${t('colTier')}</th><th>${t('colJoined')}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>` : `<p class="empty-note">${t('noMembers')}</p>`}`;

  if (hadFocus) {
    const input = $('#memberSearch', panel);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

async function changeStamps(id, delta, button) {
  button.disabled = true;
  try {
    const { stamps } = await api('admin-member-stamps', { id, delta });
    const m = data.members.find(x => x.id === id);
    if (m) m.stamps = stamps;
    renderClubTab();
  } catch (err) {
    handleError(err);
    button.disabled = false;
  }
}

/* ---------- Settings tab ---------- */
function renderSettingsTab() {
  const s = data.settings;
  const address = new URL('index.html', location.href).href.replace(/index\.html$/, '');
  el.panels.settings.innerHTML = `
    <form class="settings-card" id="settingsForm" novalidate>
      <label class="switch-row">
        <span><b>${t('ordering')}</b><small>${t('orderingHint')}</small></span>
        <input type="checkbox" class="switch" name="orderingOpen" ${s.orderingOpen ? 'checked' : ''}>
      </label>
      <fieldset class="field-group">
        <legend>${t('currency')}</legend>
        <div class="field-row">
          <label class="field"><span>${t('currencyEn')}</span><input name="currencyEn" dir="ltr" maxlength="12" value="${esc(s.currency[0])}" placeholder="T"></label>
          <label class="field"><span>${t('currencyFa')}</span><input name="currencyFa" dir="rtl" lang="fa" maxlength="12" value="${esc(s.currency[1])}" placeholder="تومان"></label>
        </div>
        <p class="fine">${t('currencyHint')}</p>
      </fieldset>
      <div class="field-row">
        <label class="field"><span>${t('stampsPerReward')}</span><input name="stampsPerReward" type="number" min="3" max="50" value="${s.stampsPerReward}"></label>
        <label class="field"><span>${t('defaultLang')}</span>
          <select name="defaultLang">
            <option value="en" ${s.defaultLang === 'en' ? 'selected' : ''}>${t('english')}</option>
            <option value="fa" ${s.defaultLang === 'fa' ? 'selected' : ''}>${t('persian')}</option>
          </select>
        </label>
      </div>
      <p class="form-error" id="settingsError" role="alert"></p>
      <button class="btn" type="submit">${t('saveSettings')}</button>
    </form>

    <form class="settings-card" id="passwordForm" novalidate>
      <h2>${t('changePassword')}</h2>
      <label class="field"><span>${t('currentPassword')}</span><input name="current" type="password" autocomplete="current-password"></label>
      <div class="field-row">
        <label class="field"><span>${t('newPassword')}</span><input name="next" type="password" autocomplete="new-password" minlength="6"></label>
        <label class="field"><span>${t('confirmPassword')}</span><input name="confirm" type="password" autocomplete="new-password"></label>
      </div>
      <p class="form-error" id="passwordError" role="alert"></p>
      <button class="btn" type="submit">${t('changePassword')}</button>
    </form>

    <div class="settings-card">
      <h2>${t('customerLink')}</h2>
      <a class="mono link-out" href="${esc(address)}" target="_blank" rel="noopener">${esc(address)}</a>
    </div>`;
}

async function submitSettings(form) {
  const f = new FormData(form);
  const error = $('#settingsError', form);
  error.textContent = '';
  try {
    await saveSettings({
      orderingOpen: f.get('orderingOpen') === 'on',
      currencyEn: f.get('currencyEn'),
      currencyFa: f.get('currencyFa'),
      stampsPerReward: f.get('stampsPerReward'),
      defaultLang: f.get('defaultLang'),
    });
    data.menu = null;
    toast(t('saved'));
  } catch (err) {
    handleError(err, error);
  }
}

async function submitPassword(form) {
  const f = new FormData(form);
  const error = $('#passwordError', form);
  error.textContent = '';
  if (f.get('next') !== f.get('confirm')) {
    error.textContent = t('passwordMismatch');
    return;
  }
  try {
    await api('admin-password', { current: f.get('current'), next: f.get('next') });
    form.reset();
    const wasLocked = !el.pwBanner.hidden;
    el.pwBanner.hidden = true;
    toast(t('passwordChanged'));
    if (wasLocked) await startOrders();
  } catch (err) {
    handleError(err, error);
  }
}

/* ---------- Events ---------- */
function bindEvents() {
  el.loginForm.addEventListener('submit', signIn);
  $('#logoutBtn').addEventListener('click', signOut);
  $$('[data-lang-toggle]').forEach(b => b.addEventListener('click', switchLanguage));
  $$('[data-theme-toggle]').forEach(b => b.addEventListener('click', () => { toggleTheme(); labelButtons(); }));
  el.soundBtn.addEventListener('click', () => {
    ui.sound = !ui.sound;
    store.set(KEYS.sound, ui.sound);
    unlockAudio();
    labelButtons();
    if (ui.sound) chime();
  });
  document.addEventListener('pointerdown', unlockAudio, { once: true });

  $$('[data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  // The banner's "Change password": open Settings and jump straight to the password form
  $$('[data-goto-tab]').forEach(b => b.addEventListener('click', () => {
    if (ui.tab !== b.dataset.gotoTab) switchTab(b.dataset.gotoTab);
    const form = $('#passwordForm');
    form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('[name=current]', form)?.focus({ preventScroll: true });
  }));

  // Orders
  el.panels.orders.addEventListener('click', e => {
    const next = e.target.closest('[data-next]');
    if (next) return setOrderStatus(Number(next.dataset.next), next.dataset.status, next);
    const cancel = e.target.closest('[data-cancel]');
    if (cancel && confirmTap(`cancel-${cancel.dataset.cancel}`, cancel, t('confirmCancel'))) {
      setOrderStatus(Number(cancel.dataset.cancel), 'cancelled', cancel);
    }
  });
  el.panels.orders.addEventListener('change', async e => {
    if (e.target.id !== 'quickOrdering') return;
    try {
      await saveSettings({ ...settingsBody(data.settings), orderingOpen: e.target.checked });
      renderOrders();
    } catch (err) {
      handleError(err);
      e.target.checked = !e.target.checked;
    }
  });

  // Menu
  el.panels.menu.addEventListener('input', e => {
    if (e.target.id === 'menuSearch') { ui.menuQuery = e.target.value; filterMenu(); }
  });
  el.panels.menu.addEventListener('change', e => {
    const price = e.target.closest('[data-price]');
    if (price) {
      const key = Number(price.dataset.price);
      saveItemPatch(key, { price: price.value.trim() || '0' }, it => t('priceSaved', pick(it.names)));
    }
    const avail = e.target.closest('[data-avail]');
    if (avail) {
      const key = Number(avail.dataset.avail);
      saveItemPatch(key, { available: avail.checked }, it => t('availabilitySaved', pick(it.names), it.available));
    }
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

  // Club
  let searchTimer;
  el.panels.club.addEventListener('input', e => {
    if (e.target.id !== 'memberSearch') return;
    ui.memberQuery = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      try { await loadMembers(); renderClubTab(); } catch (err) { handleError(err); }
    }, 250);
  });
  el.panels.club.addEventListener('click', e => {
    const btn = e.target.closest('[data-stamp]');
    if (btn) changeStamps(Number(btn.dataset.id), Number(btn.dataset.stamp), btn);
  });

  // Settings
  el.panels.settings.addEventListener('submit', e => {
    e.preventDefault();
    if (e.target.id === 'settingsForm') submitSettings(e.target);
    if (e.target.id === 'passwordForm') submitPassword(e.target);
  });

  // Keep "3 min ago" fresh without re-rendering the board
  setInterval(() => {
    $$('[data-time]', el.panels.orders).forEach(n => { n.textContent = timeAgo(Number(n.dataset.time)); });
  }, 30000);
}

/* ---------- Start ---------- */
async function start() {
  useStrings(ADMIN_STRINGS);
  initTheme();
  applyLanguage(store.get(KEYS.lang, 'fa')); // Persian unless this device picked English
  bindEvents();
  try {
    const me = await api('admin-me');
    me.loggedIn ? enterPanel(me) : showLogin();
  } catch (err) {
    showLogin(errorText(err.code));
  }
}

start();
