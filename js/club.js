/* =============================================================
   AMI Club (باشگاه مشتریان): join, log in, stamp card
   ============================================================= */
import { $, esc, toast, openDialog, wireDialog, ICONS } from './util.js';
import { t, num, money, errorText, shortDate } from './i18n.js';
import { state, on, emit, settings } from './state.js';
import { api } from './api.js';

const el = {
  sheet: $('#clubSheet'),
  btn: $('#clubBtn'),
};

let tab = 'join'; // join | login (when logged out)
let busy = false;

export async function loadMember() {
  try {
    const { member } = await api('club-me');
    state.member = member;
  } catch {
    state.member = null;
  }
  emit('member');
}

export function openClub(startTab) {
  if (startTab) tab = startTab;
  render();
  openDialog(el.sheet);
}

function render() {
  el.sheet.innerHTML = `<div class="sheet-inner">
    <header class="sheet-head">
      <div class="sheet-title"><h2 id="clubTitle">${t('club')}</h2></div>
      <button class="icon-btn" type="button" data-close aria-label="${t('close')}">${ICONS.close}</button>
    </header>
    <div class="sheet-body">${state.member ? memberHtml(state.member) : formHtml()}</div>
  </div>`;
  el.sheet.setAttribute('aria-labelledby', 'clubTitle');
  renderButton();
}

function formHtml() {
  const perReward = settings().stampsPerReward;
  const cups = Array.from({ length: Math.min(perReward, 10) }, (_, i) =>
    `<span class="cup${i < 3 ? ' on' : ''}">${ICONS.cup}</span>`).join('');

  return `
    <div class="club-hero">
      <div class="cups cups-demo" aria-hidden="true">${cups}</div>
      <p>${t('clubIntro', num(perReward))}</p>
    </div>
    <div class="segmented" role="tablist">
      ${['join', 'login'].map(k => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${t(k)}</button>`).join('')}
    </div>
    <form class="club-form" id="clubForm" novalidate>
      ${tab === 'join' ? `
        <label class="field"><span>${t('yourName')}</span>
          <input name="name" type="text" maxlength="40" autocomplete="name" required></label>` : ''}
      <label class="field"><span>${t('phone')}</span>
        <input name="phone" type="tel" inputmode="tel" dir="ltr" maxlength="20" autocomplete="tel" placeholder="09xx xxx xxxx" required></label>
      <label class="field"><span>${t('pin')}</span>
        <input name="pin" type="password" inputmode="numeric" dir="ltr" maxlength="4" pattern="[0-9۰-۹]{4}"
               autocomplete="${tab === 'join' ? 'new-password' : 'current-password'}" required>
        ${tab === 'join' ? `<small>${t('pinHint')}</small>` : ''}</label>
      <p class="form-error" id="clubError" role="alert"></p>
      <button class="btn btn-wide" type="submit">${t(tab === 'join' ? 'joinButton' : 'loginButton')}</button>
    </form>`;
}

function memberHtml(m) {
  const perReward = settings().stampsPerReward;
  const rewards = Math.floor(m.stamps / perReward);
  const progress = m.stamps % perReward;
  const cups = Array.from({ length: perReward }, (_, i) =>
    `<span class="cup${i < progress ? ' on' : ''}">${ICONS.cup}</span>`).join('');

  const history = m.orders.length
    ? `<ul class="history">${m.orders.map(o => `<li>
        <span><b>${t('orderNo', num(o.number))}</b> <small>${shortDate(o.createdAt)}</small></span>
        <span class="pill pill-${o.status}">${t('statusLabel')[o.status]}</span>
        <span>${money(o.total)}</span>
      </li>`).join('')}</ul>`
    : `<p class="muted">${t('noOrdersYet')}</p>`;

  return `
    <div class="member-head">
      <div>
        <h3>${esc(t('clubHello', m.name))}</h3>
        <p class="muted">${t('totalDrinks', num(m.totalDrinks))}</p>
      </div>
      <span class="tier tier-${m.tier}">${t('tier')[m.tier]}</span>
    </div>
    <p class="fine">${t('tierHint')[m.tier]}</p>

    <section class="stamp-card">
      <h4>${t('stampCard')}</h4>
      <div class="cups">${cups}</div>
      <p>${t('toNext', num(perReward - progress))}</p>
    </section>
    ${rewards > 0 ? `<div class="reward-banner"><b>${t('rewardsReady', num(rewards))}</b><span>${t('rewardsReadyHint')}</span></div>` : ''}
    <p class="fine">${t('stampsNote')}</p>

    <section>
      <h4>${t('recentOrders')}</h4>
      ${history}
    </section>
    <button class="btn btn-ghost btn-wide" type="button" id="clubLogout">${t('logout')}</button>`;
}

function renderButton() {
  const m = state.member;
  el.btn.classList.toggle('is-member', !!m);
  const label = $('.club-btn-label', el.btn);
  if (label) label.textContent = m ? m.name : t('clubButton');
  el.btn.setAttribute('aria-label', t('clubOpen'));
}

async function submit(form) {
  if (busy) return;
  const data = Object.fromEntries(new FormData(form));
  const error = $('#clubError', el.sheet);
  error.textContent = '';
  busy = true;
  form.querySelector('[type=submit]').disabled = true;
  try {
    const { member } = await api(tab === 'join' ? 'club-join' : 'club-login', data);
    state.member = member;
    emit('member');
    toast(t('welcome', member.name));
    render();
  } catch (err) {
    error.textContent = errorText(err.code);
    if (err.code === 'phone_taken') { tab = 'login'; render(); $('#clubError', el.sheet).textContent = errorText(err.code); }
  } finally {
    busy = false;
    const btn = form.isConnected && form.querySelector('[type=submit]');
    if (btn) btn.disabled = false;
  }
}

export function refreshClub() {
  renderButton();
  if (el.sheet.open) render();
}

export function initClub() {
  wireDialog(el.sheet);
  el.btn.addEventListener('click', () => openClub());

  el.sheet.addEventListener('click', async e => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) { tab = tabBtn.dataset.tab; render(); return; }
    if (e.target.closest('#clubLogout')) {
      try { await api('club-logout', {}); } catch { /* already logged out */ }
      state.member = null;
      emit('member');
      render();
    }
  });
  el.sheet.addEventListener('submit', e => {
    e.preventDefault();
    submit(e.target);
  });

  on('member', refreshClub);
  on('member-refresh', loadMember);
}
