/* =============================================================
   Language helpers shared by the menu and the admin panel.
   Each page registers its own dictionary with useStrings().
   ============================================================= */
let strings = { en: {}, fa: {} };
let lang = 'en';
let currency = ['', ''];

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export const useStrings = dict => { strings = dict; };
export const getLang = () => lang;
export const setLangValue = value => { lang = value === 'fa' ? 'fa' : 'en'; };
export const setCurrency = pair => { currency = pair; };

/** Translated text. Values may be functions that take arguments. */
export function t(key, ...args) {
  const v = strings[lang][key] ?? strings.en[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

/** Picks the current language from an [english, persian] pair */
export const pick = pair => (lang === 'fa' ? pair[1] || pair[0] : pair[0]);

/** Digits in the current language */
export const num = n => (lang === 'fa' ? String(n).replace(/\d/g, d => FA_DIGITS[d]) : String(n));

/** 85000 → { amount: "85,000", unit: "T" } */
export function moneyParts(n) {
  return {
    amount: new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US').format(n),
    unit: pick(currency).trim(),
  };
}

/** 85000 → "85,000 T" or "۸۵٬۰۰۰ تومان" */
export function money(n) {
  const { amount, unit } = moneyParts(n);
  return unit ? `${amount} ${unit}` : amount;
}

/** Message for an API error code */
export function errorText(code) {
  const errors = t('errors');
  return errors[code] || errors.generic;
}

/** Fills elements marked with data-i18n, data-i18n-html, data-i18n-placeholder, data-i18n-aria */
export function translatePage(root = document) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  root.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach(n => { n.innerHTML = t(n.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(n => { n.placeholder = t(n.dataset.i18nPlaceholder); });
  root.querySelectorAll('[data-i18n-aria]').forEach(n => n.setAttribute('aria-label', t(n.dataset.i18nAria)));
}

/** Relative time like "3 min ago" in the current language */
export function timeAgo(unixSeconds) {
  const diff = Math.round(unixSeconds - Date.now() / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang === 'fa' ? 'fa' : 'en', { numeric: 'auto', style: 'short' });
  if (Math.abs(diff) < 60) return rtf.format(0, 'second');
  if (Math.abs(diff) < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (Math.abs(diff) < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

/** Clock time like "14:05" in the current language */
export const clock = unixSeconds =>
  new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(unixSeconds * 1000);

export const shortDate = unixSeconds =>
  new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-GB', { day: 'numeric', month: 'short' }).format(unixSeconds * 1000);
