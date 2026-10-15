/* =============================================================
   AMI café — customer page entry point
   ============================================================= */
import { $, store, initTheme, toggleTheme, currentTheme } from './util.js';
import { useStrings, setLangValue, getLang, setCurrency, translatePage, t } from './i18n.js';
import { STRINGS } from './strings.js';
import { api } from './api.js';
import { setMenu, on } from './state.js';
import { initMenu, renderMenu, renderMenuError, goTo } from './menu.js';
import { initBasket, openItem, refreshBasket } from './basket.js';
import { initClub, loadMember, refreshClub } from './club.js';

const LANG_KEY = 'ami-lang';
const el = { themeBtn: $('#themeBtn'), langBtn: $('#langBtn') };

const savedLang = store.get(LANG_KEY, null);
const browserLang = (navigator.language || '').toLowerCase().startsWith('fa') ? 'fa' : null;

function labelButtons() {
  el.themeBtn.setAttribute('aria-label', t(currentTheme() === 'dark' ? 'toLight' : 'toDark'));
  el.langBtn.textContent = t('switchTo');
  el.langBtn.lang = getLang() === 'fa' ? 'en' : 'fa';
  el.langBtn.setAttribute('aria-label', t('switchToLabel'));
}

function applyLanguage(lang) {
  setLangValue(lang);
  translatePage();
  labelButtons();
}

function setLanguage(lang) {
  store.set(LANG_KEY, lang);
  applyLanguage(lang);
  renderMenu();
  refreshBasket();
  refreshClub();
}

let menuLoaded = false;
async function loadMenu() {
  try {
    const menu = await api('menu');
    setMenu(menu);
    setCurrency(menu.settings.currency);
    // The café's default language applies only when the visitor has no preference yet
    if (!menuLoaded && !savedLang && !browserLang && menu.settings.defaultLang !== getLang()) {
      applyLanguage(menu.settings.defaultLang);
    }
    renderMenu();
    refreshBasket();
    if (!menuLoaded) {
      menuLoaded = true;
      const startId = decodeURIComponent(location.hash.slice(1));
      if (startId) goTo(startId);
    }
  } catch {
    if (!menuLoaded) renderMenuError(loadMenu);
  }
}

/* ---------- Start ---------- */
useStrings(STRINGS);
initTheme();
applyLanguage(savedLang || browserLang || 'en');

initMenu({ onPickItem: key => openItem(key) });
initBasket();
initClub();

el.themeBtn.addEventListener('click', () => { toggleTheme(); labelButtons(); });
el.langBtn.addEventListener('click', () => setLanguage(getLang() === 'fa' ? 'en' : 'fa'));

on('menu-reload', loadMenu);
// Pick up price and sold-out changes when the visitor comes back to the tab
document.addEventListener('visibilitychange', () => { if (!document.hidden && menuLoaded) loadMenu(); });

loadMenu();
loadMember();
