/* Small helpers shared by every page */
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked: ignore */ }
  },
};

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

// Normalizes text for search. Maps one character to one character, so highlight
// positions line up: "Piña" → "pina", Arabic ي/ك → Persian ی/ک, ۱۲ → 12, ZWNJ → space.
export const fold = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ')
  .replace(/[۰-۹]/g, d => FA_DIGITS.indexOf(d));

export const latinDigits = s => String(s).replace(/[۰-۹]/g, d => FA_DIGITS.indexOf(d)).replace(/[٠-٩]/g, d => d.charCodeAt(0) - 0x660);

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
export const behavior = () => (reducedMotion.matches ? 'auto' : 'smooth');

/* ---------- Toast (a popover so it shows above open dialogs) ---------- */
let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  try { el.hidePopover?.(); el.showPopover?.(); } catch { /* popover unsupported */ }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { try { el.hidePopover?.(); } catch { /* already hidden */ } }, 250);
  }, 2200);
}

/* ---------- Dialogs ---------- */
export function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

/** Close on backdrop click and on any [data-close] button inside */
export function wireDialog(dialog) {
  dialog.addEventListener('click', e => {
    if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
  });
}

/* ---------- Theme ---------- */
const THEME_KEY = 'ami-theme';
const root = document.documentElement;
export const currentTheme = () =>
  root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function initTheme() {
  const saved = store.get(THEME_KEY, null);
  if (saved) root.dataset.theme = saved;
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  store.set(THEME_KEY, next);
}

/* ---------- Icons ---------- */
export const ICONS = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1z"/></svg>',
  chevron: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  cup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h12v5a6 6 0 0 1-6 6h0a6 6 0 0 1-6-6V8zM17 9h1.5a2.5 2.5 0 0 1 0 5H17M8 3c-.8 1 .8 2 0 3M12 3c-.8 1 .8 2 0 3"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};
