/* =============================================================
   Basket (سبد خرید): drink options, basket, placing and tracking orders
   ============================================================= */
import { $, $$, store, esc, toast, openDialog, wireDialog, ICONS } from './util.js';
import { t, pick, num, money, errorText, getLang, clock } from './i18n.js';
import { state, on, emit, extraCategories, settings } from './state.js';
import { api } from './api.js';
import { swatchStyle } from './menu.js';
import { openClub } from './club.js';

const KEYS = { basket: 'ami-basket', orders: 'ami-orders', type: 'ami-order-type' };
const FINAL = ['done', 'cancelled'];
const MAX_QTY = 20;
const POLL_MS = 8000;

let lines = store.get(KEYS.basket, []);  // [{ key, item, qty, extras: [keys], note }]
let orders = store.get(KEYS.orders, []); // [{ id, token, order }]
const checkout = { type: store.get(KEYS.type, 'dine-in'), table: '', note: '', useReward: false, busy: false, error: '' };
let draft = null; // drink being customized in the item sheet

const el = {
  itemSheet: $('#itemSheet'),
  basketSheet: $('#basketSheet'),
  ordersSheet: $('#ordersSheet'),
  bar: $('#basketBar'),
  basketBtn: $('#basketBtn'),
  basketCount: $('#basketCount'),
};

/* ---------- Basket data ---------- */
const lineKey = (item, extras, note) => `${item}|${[...extras].sort((a, b) => a - b).join(',')}|${note}`;
const saveBasket = () => store.set(KEYS.basket, lines);
const saveOrders = () => store.set(KEYS.orders, orders);
const lookup = key => state.itemsByKey.get(key);

function unitPrice(item, extras) {
  return lookup(item).item.price + extras.reduce((sum, k) => sum + lookup(k).item.price, 0);
}

const lineCount = () => lines.reduce((n, l) => n + l.qty, 0);
const subtotal = () => lines.reduce((sum, l) => sum + unitPrice(l.item, l.extras) * l.qty, 0);

/** Free drink = the cheapest drink's own price (extras still paid) */
function rewardDiscount() {
  if (!checkout.useReward || !lines.length) return 0;
  return Math.min(...lines.map(l => lookup(l.item).item.price));
}

const canUseReward = () => !!state.member && state.member.stamps >= settings().stampsPerReward;

/** Drops lines whose drink or extras left the menu or sold out */
function pruneBasket() {
  const removed = [];
  lines = lines.filter(l => {
    const ok = [l.item, ...l.extras].every(k => lookup(k)?.item.available);
    if (!ok && lookup(l.item)) removed.push(pick(lookup(l.item).item.names));
    return ok;
  });
  if (removed.length) {
    saveBasket();
    toast(t('removedSoldOut', removed.join('، ')));
  }
}

/* ---------- Item sheet: choose extras, quantity, note ---------- */
export function openItem(itemKey, editKey = null) {
  const found = lookup(itemKey);
  if (!found || !found.item.available) return;
  const existing = editKey ? lines.find(l => l.key === editKey) : null;
  draft = {
    item: itemKey,
    qty: existing?.qty ?? 1,
    extras: new Set(existing?.extras ?? []),
    note: existing?.note ?? '',
    editKey,
  };
  renderItemSheet();
  openDialog(el.itemSheet);
}

function renderItemSheet() {
  const { item, cat } = lookup(draft.item);
  const name = pick(item.names);

  const groups = extraCategories().map(c => {
    const opts = c.items.filter(x => x.available).map(x => `
      <button class="opt" type="button" data-extra="${x.key}" aria-pressed="${draft.extras.has(x.key)}">
        <span class="sw" style="${swatchStyle(x.names[0], c.color)}" aria-hidden="true"></span>
        <span class="opt-name">${esc(pick(x.names))}</span>
        ${x.price > 0 ? `<span class="opt-price">+${money(x.price)}</span>` : ''}
      </button>`).join('');
    return opts ? `<section class="opt-group">
      <h3>${esc(pick(c.name))} <span>${t('optional')}</span></h3>
      <div class="opts">${opts}</div>
    </section>` : '';
  }).join('');

  el.itemSheet.innerHTML = `<div class="sheet-inner">
    <header class="sheet-head">
      <span class="sw sw-lg" style="${swatchStyle(item.names[0], cat.color)}" aria-hidden="true"></span>
      <div class="sheet-title">
        <h2 id="itemSheetTitle">${esc(name)}</h2>
        <p class="sheet-sub">${item.price > 0 ? money(item.price) : ''}</p>
      </div>
      <button class="icon-btn" type="button" data-close aria-label="${t('close')}">${ICONS.close}</button>
    </header>
    <div class="sheet-body">
      ${groups}
      <label class="field">
        <span>${t('note')} <small>${t('optional')}</small></span>
        <input id="itemNote" type="text" maxlength="120" autocomplete="off" placeholder="${esc(t('notePlaceholder'))}" value="${esc(draft.note)}">
      </label>
    </div>
    <footer class="sheet-foot">
      <div class="stepper" role="group" aria-label="${t('quantity')}">
        <button type="button" data-step="-1" aria-label="${t('decrease')}">${ICONS.minus}</button>
        <output id="itemQty" aria-live="polite">${num(draft.qty)}</output>
        <button type="button" data-step="1" aria-label="${t('increase')}">${ICONS.plus}</button>
      </div>
      <button class="btn btn-wide" type="button" id="itemAdd"></button>
    </footer>
  </div>`;
  el.itemSheet.setAttribute('aria-labelledby', 'itemSheetTitle');
  updateItemTotal();
}

function updateItemTotal() {
  const total = unitPrice(draft.item, [...draft.extras]) * draft.qty;
  $('#itemQty', el.itemSheet).textContent = num(draft.qty);
  $('#itemAdd', el.itemSheet).textContent = t(draft.editKey ? 'updateLine' : 'addToBasket', money(total));
  $('[data-step="-1"]', el.itemSheet).disabled = draft.qty <= 1;
  $('[data-step="1"]', el.itemSheet).disabled = draft.qty >= MAX_QTY;
}

function commitDraft() {
  const extras = [...draft.extras].sort((a, b) => a - b);
  const note = draft.note.trim().slice(0, 120);
  const key = lineKey(draft.item, extras, note);

  if (draft.editKey) lines = lines.filter(l => l.key !== draft.editKey);
  const same = lines.find(l => l.key === key);
  if (same) same.qty = Math.min(MAX_QTY, same.qty + draft.qty);
  else lines.push({ key, item: draft.item, qty: draft.qty, extras, note });

  saveBasket();
  const name = pick(lookup(draft.item).item.names);
  const wasEdit = !!draft.editKey;
  el.itemSheet.close();
  renderBar();
  if (wasEdit) renderBasketParts();
  else toast(t('added', name));
}

/* ---------- Basket sheet ---------- */
export function openBasket() {
  checkout.error = '';
  renderBasketSheet();
  openDialog(el.basketSheet);
}

function renderBasketSheet() {
  el.basketSheet.innerHTML = `<div class="sheet-inner">
    <header class="sheet-head">
      <div class="sheet-title">
        <h2 id="basketTitle">${t('yourBasket')}</h2>
        <p class="sheet-sub" id="basketSub"></p>
      </div>
      <button class="icon-btn" type="button" data-close aria-label="${t('close')}">${ICONS.close}</button>
    </header>
    <div class="sheet-body" id="basketBody"></div>
    <footer class="sheet-foot sheet-foot-stack" id="basketFoot"></footer>
  </div>`;
  el.basketSheet.setAttribute('aria-labelledby', 'basketTitle');
  renderBasketParts();
}

function renderBasketParts() {
  if (!el.basketSheet.querySelector('#basketBody')) return;
  const body = $('#basketBody', el.basketSheet);
  const foot = $('#basketFoot', el.basketSheet);
  $('#basketSub', el.basketSheet).textContent = lines.length ? t('itemCount', num(lineCount())) : '';

  if (!lines.length) {
    checkout.useReward = false;
    body.innerHTML = `<div class="empty empty-sheet">
      <span class="empty-ic" aria-hidden="true">${ICONS.cup}</span>
      <h3>${t('emptyBasket')}</h3>
      <p>${t('emptyBasketBody')}</p>
    </div>`;
    foot.innerHTML = `<button class="btn btn-wide" type="button" data-close>${t('browseMenu')}</button>`;
    return;
  }

  if (!canUseReward()) checkout.useReward = false;
  const open = settings().orderingOpen;

  body.innerHTML = `
    <ul class="lines">${lines.map(lineHtml).join('')}</ul>

    <div class="segmented" role="radiogroup" aria-label="${t('dineIn')} / ${t('takeaway')}">
      ${['dine-in', 'takeaway'].map(type => `<button type="button" role="radio" data-type="${type}" aria-checked="${checkout.type === type}">${t(type === 'dine-in' ? 'dineIn' : 'takeaway')}</button>`).join('')}
    </div>

    <div class="field-row">
      <label class="field field-table" ${checkout.type === 'dine-in' ? '' : 'hidden'}>
        <span>${t('tableNo')} <small>${t('optional')}</small></span>
        <input id="tableNo" type="text" inputmode="numeric" maxlength="10" autocomplete="off" placeholder="${esc(t('tablePlaceholder'))}" value="${esc(checkout.table)}">
      </label>
      <label class="field">
        <span>${t('orderNote')} <small>${t('optional')}</small></span>
        <input id="orderNote" type="text" maxlength="200" autocomplete="off" value="${esc(checkout.note)}">
      </label>
    </div>

    <div class="club-box" id="clubBox"></div>
    <dl class="summary" id="summary"></dl>`;

  foot.innerHTML = `
    ${open ? '' : `<p class="notice">${t('orderingClosed')}</p>`}
    <p class="form-error" id="orderError" role="alert">${esc(checkout.error)}</p>
    <button class="btn btn-wide" type="button" id="placeOrder" ${open ? '' : 'disabled'}></button>
    <p class="fine">${t('payNote')}</p>`;

  renderClubBox();
  renderSummary();
}

function lineHtml(l) {
  const { item, cat } = lookup(l.item);
  const extras = l.extras.map(k => pick(lookup(k).item.names)).join('، ');
  const name = pick(item.names);
  return `<li class="line">
    <span class="sw" style="${swatchStyle(item.names[0], cat.color)}" aria-hidden="true"></span>
    <div class="line-text">
      <b>${esc(name)}</b>
      ${extras ? `<span class="line-extras">+ ${esc(extras)}</span>` : ''}
      ${l.note ? `<span class="line-note">“${esc(l.note)}”</span>` : ''}
      <button class="link-btn" type="button" data-edit="${esc(l.key)}">${t('edit')}</button>
    </div>
    <div class="line-side">
      <span class="line-total">${money(unitPrice(l.item, l.extras) * l.qty)}</span>
      <div class="stepper stepper-sm" role="group" aria-label="${t('quantity')}">
        <button type="button" data-dec="${esc(l.key)}" aria-label="${l.qty === 1 ? esc(t('remove', name)) : t('decrease')}">${l.qty === 1 ? ICONS.trash : ICONS.minus}</button>
        <output>${num(l.qty)}</output>
        <button type="button" data-inc="${esc(l.key)}" aria-label="${t('increase')}" ${l.qty >= MAX_QTY ? 'disabled' : ''}>${ICONS.plus}</button>
      </div>
    </div>
  </li>`;
}

function renderClubBox() {
  const box = $('#clubBox', el.basketSheet);
  if (!box) return;
  const m = state.member;
  const perReward = settings().stampsPerReward;

  if (!m) {
    box.innerHTML = `<p>${t('clubPromo')}</p>
      <button class="btn btn-ghost" type="button" data-club>${t('clubJoinOrLogin')}</button>`;
    return;
  }

  const progress = Math.min(m.stamps, perReward);
  box.innerHTML = `
    <div class="club-line">
      <span><b>${esc(t('clubHello', m.name))}</b> · ${t('stampsOf', num(m.stamps), num(perReward))}</span>
    </div>
    <div class="meter" aria-hidden="true"><span style="width:${(progress / perReward) * 100}%"></span></div>
    ${canUseReward() ? `
      <label class="switch-row">
        <span><b>${t('useReward')}</b><small>${t('rewardHint')}</small></span>
        <input type="checkbox" class="switch" id="useReward" ${checkout.useReward ? 'checked' : ''}>
      </label>` : ''}`;
}

function renderSummary() {
  const summary = $('#summary', el.basketSheet);
  if (!summary) return;
  const sub = subtotal();
  const discount = rewardDiscount();
  summary.innerHTML = `
    <div><dt>${t('subtotal')}</dt><dd>${money(sub)}</dd></div>
    ${discount > 0 || checkout.useReward ? `<div class="discount"><dt>${t('freeDrink')}</dt><dd>−${money(discount)}</dd></div>` : ''}
    <div class="grand"><dt>${t('total')}</dt><dd>${money(Math.max(0, sub - discount))}</dd></div>`;

  const btn = $('#placeOrder', el.basketSheet);
  btn.textContent = checkout.busy ? t('placing') : t('placeOrder', money(Math.max(0, sub - discount)));
  btn.disabled = checkout.busy || !settings().orderingOpen;
}

function changeQty(key, delta) {
  const line = lines.find(l => l.key === key);
  if (!line) return;
  line.qty = Math.min(MAX_QTY, line.qty + delta);
  if (line.qty <= 0) lines = lines.filter(l => l !== line);
  saveBasket();
  renderBar();
  renderBasketParts();
}

async function placeOrder() {
  if (checkout.busy || !lines.length) return;
  checkout.busy = true;
  checkout.error = '';
  renderSummary();
  $('#orderError', el.basketSheet).textContent = '';

  try {
    const { order } = await api('order', {
      lines: lines.map(({ item, qty, extras, note }) => ({ item, qty, extras, note })),
      type: checkout.type,
      table: checkout.type === 'dine-in' ? checkout.table : '',
      note: checkout.note,
      useReward: checkout.useReward,
      lang: getLang(),
    });

    orders.unshift({ id: order.id, token: order.token, order });
    orders = orders.slice(0, 10);
    saveOrders();
    lines = [];
    checkout.note = '';
    checkout.useReward = false;
    saveBasket();

    el.basketSheet.close();
    renderBar();
    openOrders();
    toast(t('orderSent', num(order.number)));
    if (state.member) emit('member-refresh');
    startPolling();
  } catch (err) {
    checkout.error = errorText(err.code);
    $('#orderError', el.basketSheet).textContent = checkout.error;
    if (['item_unavailable', 'bad_item', 'ordering_closed'].includes(err.code)) emit('menu-reload');
    if (err.code === 'not_enough_stamps' || err.code === 'login_required') emit('member-refresh');
  } finally {
    checkout.busy = false;
    renderSummary();
  }
}

/* ---------- Order tracking ---------- */
export function openOrders() {
  renderOrdersSheet();
  openDialog(el.ordersSheet);
}

const STEPS = ['new', 'preparing', 'ready', 'done'];

function orderCardHtml({ order: o }) {
  const stepIndex = STEPS.indexOf(o.status);
  const steps = o.status === 'cancelled' ? '' : `<ol class="steps">${STEPS.map((s, i) =>
    `<li class="${i < stepIndex ? 'past' : i === stepIndex ? 'now' : ''}"><span class="step-dot">${i < stepIndex ? ICONS.check : ''}</span>${t('statusLabel')[s]}</li>`
  ).join('')}</ol>`;
  const meta = [o.type === 'dine-in' ? (o.table ? t('tableN', num(o.table)) : t('dineIn')) : t('takeaway'), clock(o.createdAt)];

  return `<article class="order-card is-${o.status}">
    <header>
      <h3>${t('orderNo', num(o.number))}</h3>
      <span class="pill pill-${o.status}">${t('statusLabel')[o.status]}</span>
    </header>
    <p class="order-help">${t('statusHelp')[o.status]}</p>
    ${steps}
    <ul class="order-lines">${o.lines.map(l => `<li><span>${num(l.qty)} × ${esc(pick(l.names))}${l.extras.length ? ` <small>+ ${esc(l.extras.map(pick).join('، '))}</small>` : ''}</span><span>${money(l.lineTotal)}</span></li>`).join('')}</ul>
    <footer><span>${meta.join(' · ')}</span><b>${money(o.total)}</b></footer>
  </article>`;
}

function renderOrdersSheet() {
  const finished = orders.some(o => FINAL.includes(o.order.status));
  el.ordersSheet.innerHTML = `<div class="sheet-inner">
    <header class="sheet-head">
      <div class="sheet-title"><h2 id="ordersTitle">${t('yourOrders')}</h2></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('close')}">${ICONS.close}</button>
    </header>
    <div class="sheet-body">${orders.map(orderCardHtml).join('')}</div>
    ${finished ? `<footer class="sheet-foot"><button class="btn btn-ghost btn-wide" type="button" id="clearFinished">${t('clearFinished')}</button></footer>` : ''}
  </div>`;
  el.ordersSheet.setAttribute('aria-labelledby', 'ordersTitle');
}

let pollTimer = null;
function startPolling() {
  clearInterval(pollTimer);
  if (!orders.some(o => !FINAL.includes(o.order.status))) return;
  pollTimer = setInterval(pollOrders, POLL_MS);
}

async function pollOrders() {
  if (document.hidden || !orders.length) return;
  try {
    const { orders: fresh } = await api('track', { orders: orders.map(({ id, token }) => ({ id, token })) });
    let memberChanged = false;
    for (const f of fresh) {
      const mine = orders.find(o => o.id === f.id);
      if (!mine) continue;
      if (mine.order.status !== f.status) {
        if (f.status === 'ready') {
          toast(t('orderReady', num(f.number)));
          if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([120, 60, 120]);
        }
        if (f.status === 'done' || f.status === 'cancelled') memberChanged = true;
      }
      mine.order = f;
    }
    // Forget orders the server no longer knows (e.g. the database was reset)
    orders = orders.filter(o => fresh.some(f => f.id === o.id));
    saveOrders();
    renderBar();
    if (el.ordersSheet.open) renderOrdersSheet();
    if (memberChanged && state.member) emit('member-refresh');
    if (!orders.some(o => !FINAL.includes(o.order.status))) clearInterval(pollTimer);
  } catch { /* offline: try again next tick */ }
}

/* ---------- Floating bar + header button ---------- */
function renderBar() {
  if (!state.menu) return;
  const count = lineCount();
  el.basketCount.textContent = num(count);
  el.basketCount.hidden = count === 0;
  el.basketBtn.setAttribute('aria-label', t('basketButton', num(count)));

  const active = orders.find(o => !FINAL.includes(o.order.status));
  if (count > 0) {
    el.bar.innerHTML = `<button class="bar-btn" type="button" data-bar="basket">
      <span class="bar-count">${num(count)}</span>
      <span class="bar-label">${t('viewBasket')}</span>
      <span class="bar-total">${money(subtotal())}</span>
    </button>`;
  } else if (active) {
    el.bar.innerHTML = `<button class="bar-btn bar-order is-${active.order.status}" type="button" data-bar="orders">
      <span class="bar-pulse" aria-hidden="true"></span>
      <span class="bar-label">${t('trackOrder', num(active.order.number))}</span>
      <span class="bar-total">${t('statusLabel')[active.order.status]}</span>
    </button>`;
  } else {
    el.bar.innerHTML = '';
  }
  const shown = el.bar.innerHTML !== '';
  el.bar.hidden = !shown;
  document.body.classList.toggle('has-bar', shown);
}

/** Re-render after the menu reloads or the language changes */
export function refreshBasket() {
  if (!state.menu) return;
  pruneBasket();
  renderBar();
  if (el.basketSheet.open) renderBasketSheet();
  if (el.ordersSheet.open) renderOrdersSheet();
  if (el.itemSheet.open && draft) {
    if (lookup(draft.item)?.item.available) renderItemSheet();
    else el.itemSheet.close();
  }
}

/* ---------- Events ---------- */
export function initBasket() {
  [el.itemSheet, el.basketSheet, el.ordersSheet].forEach(wireDialog);

  // Item sheet
  el.itemSheet.addEventListener('click', e => {
    const opt = e.target.closest('[data-extra]');
    if (opt) {
      const key = Number(opt.dataset.extra);
      draft.extras.has(key) ? draft.extras.delete(key) : draft.extras.add(key);
      opt.setAttribute('aria-pressed', String(draft.extras.has(key)));
      updateItemTotal();
      return;
    }
    const step = e.target.closest('[data-step]');
    if (step) {
      draft.qty = Math.max(1, Math.min(MAX_QTY, draft.qty + Number(step.dataset.step)));
      updateItemTotal();
      return;
    }
    if (e.target.closest('#itemAdd')) commitDraft();
  });
  el.itemSheet.addEventListener('input', e => { if (e.target.id === 'itemNote') draft.note = e.target.value; });
  el.itemSheet.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'itemNote') commitDraft(); });

  // Basket sheet
  el.basketSheet.addEventListener('click', e => {
    const target = e.target;
    const inc = target.closest('[data-inc]');
    if (inc) return changeQty(inc.dataset.inc, 1);
    const dec = target.closest('[data-dec]');
    if (dec) return changeQty(dec.dataset.dec, -1);
    const edit = target.closest('[data-edit]');
    if (edit) {
      const line = lines.find(l => l.key === edit.dataset.edit);
      if (line) openItem(line.item, line.key);
      return;
    }
    const type = target.closest('[data-type]');
    if (type) {
      checkout.type = type.dataset.type;
      store.set(KEYS.type, checkout.type);
      $$('[data-type]', el.basketSheet).forEach(b => b.setAttribute('aria-checked', String(b === type)));
      $('.field-table', el.basketSheet).hidden = checkout.type !== 'dine-in';
      return;
    }
    if (target.closest('[data-club]')) return openClub();
    if (target.closest('#placeOrder')) placeOrder();
  });
  el.basketSheet.addEventListener('input', e => {
    if (e.target.id === 'tableNo') checkout.table = e.target.value;
    if (e.target.id === 'orderNote') checkout.note = e.target.value;
  });
  el.basketSheet.addEventListener('change', e => {
    if (e.target.id === 'useReward') {
      checkout.useReward = e.target.checked;
      renderSummary();
    }
  });

  // Orders sheet
  el.ordersSheet.addEventListener('click', e => {
    if (!e.target.closest('#clearFinished')) return;
    orders = orders.filter(o => !FINAL.includes(o.order.status));
    saveOrders();
    renderBar();
    orders.length ? renderOrdersSheet() : el.ordersSheet.close();
  });

  // Bar and header button
  el.bar.addEventListener('click', e => {
    const btn = e.target.closest('[data-bar]');
    if (btn) btn.dataset.bar === 'basket' ? openBasket() : openOrders();
  });
  el.basketBtn.addEventListener('click', () => {
    if (!lines.length && orders.length) openOrders();
    else openBasket();
  });

  on('member', () => { renderClubBox(); renderSummary(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollOrders(); });

  // The basket is checked and drawn by refreshBasket() once the menu has loaded
  if (orders.length) { pollOrders(); startPolling(); }
}
