/* =============================================================
   Menu view: bars, search, filters, folding, saved drinks
   ============================================================= */
import { $, $$, store, fold, esc, behavior, toast, ICONS } from './util.js';
import { t, pick, num, money } from './i18n.js';
import { state } from './state.js';
import { FLAVORS, SWATCH } from './flavors.js';

const KEYS = { open: 'ami-open', saved: 'ami-saved' };

const view = {
  q: '',
  filter: 'all', // all | hot | cold | saved
  open: new Set(store.get(KEYS.open, ['espresso-bar'])),
  saved: new Set(store.get(KEYS.saved, [])),
};

let cats = [];       // categories with DOM references
let onPick = () => {}; // called with an item key when a drink is tapped
let toolbarH = 150;
let activeId = null;

const el = {
  root: document.documentElement,
  masthead: $('.masthead'),
  toolbar: $('#toolbar'),
  input: $('#q'),
  clear: $('#clear'),
  kbd: $('#kbd'),
  flavors: $('#flavors'),
  filters: $('.filters'),
  expandAll: $('#expandAll'),
  status: $('#status'),
  rail: $('#rail'),
  index: $('#index'),
  menu: $('#menu'),
  empty: $('#empty'),
  savedCount: $('#savedCount'),
  lede: $('#lede'),
  toTop: $('#toTop'),
};

const isFiltering = () => view.q.trim() !== '' || view.filter !== 'all';
const visibleCats = () => cats.filter(c => !c.sec.hidden);

/* ---------- Render ---------- */
export function swatchStyle(name, fallback) {
  const colors = [];
  for (const word of fold(name).split(/[^a-z0-9]+/)) {
    const color = SWATCH[word];
    if (color && !colors.includes(color)) colors.push(color);
    if (colors.length === 2) break;
  }
  const a = colors[0] || fallback;
  return `--a:${a};--b:${colors[1] || a}`;
}

const priceHtml = price =>
  price > 0 ? `<span class="price">${money(price)}</span>` : `<span class="price tbd">${num('000')}</span>`;

function itemHtml(it, cat) {
  const name = pick(it.names);
  const dot = `<span class="sw" style="${swatchStyle(it.names[0], cat.color)}" aria-hidden="true"></span>`;
  const label = `<span class="name">${esc(name)}</span>`;
  const soldOut = !it.available;
  const priceOrState = soldOut ? `<span class="sold-out">${t('soldOut')}</span>` : priceHtml(it.price);

  if (cat.extra) {
    return `<li class="extra${soldOut ? ' is-out' : ''}" data-id="${it.id}">${dot}${label}${priceOrState}</li>`;
  }

  const saved = view.saved.has(it.id);
  return `<li class="item${soldOut ? ' is-out' : ''}" data-id="${it.id}">
    <button class="item-main" type="button" data-key="${it.key}" ${soldOut ? 'disabled' : ''} aria-label="${esc(soldOut ? `${name}, ${t('soldOut')}` : t('addLabel', name))}">
      ${dot}${label}<span class="lead" aria-hidden="true"></span>${priceOrState}<span class="add-ic" aria-hidden="true">${ICONS.plus}</span>
    </button>
    <button class="fav" type="button" aria-pressed="${saved}" aria-label="${esc(saved ? t('unsave', name) : t('save', name))}">${ICONS.heart}</button>
  </li>`;
}

function sectionHtml(c) {
  return `<section class="cat" id="${c.id}" style="--cat:${c.color}">
    <h2>
      <button class="cat-head" type="button" aria-expanded="false" aria-controls="${c.id}-body">
        <span class="cat-dot" aria-hidden="true"></span>
        <span class="cat-text"><span class="cat-title">${esc(pick(c.name))}</span><span class="cat-sub"></span></span>
        <span class="cat-count"></span>${ICONS.chevron}
      </button>
    </h2>
    <div class="cat-body" id="${c.id}-body">
      <div class="cat-inner"><ul class="${c.extra ? 'extras' : 'items'}">${c.items.map(it => itemHtml(it, c)).join('')}</ul></div>
    </div>
  </section>`;
}

const navLink = (c, withCount) =>
  `<a href="#${c.id}" data-goto="${c.id}" style="--cat:${c.color}"><span class="dot" aria-hidden="true"></span>${esc(pick(c.name))}`
  + `${withCount ? ' <span class="n"></span>' : ''}</a>`;

/** Builds everything that depends on the menu data and the language */
export function renderMenu() {
  cats = state.menu.categories.map(c => ({
    ...c,
    items: c.items.map(it => ({ ...it, hay: fold(`${it.names.join(' ')} ${c.name.join(' ')} ${c.keys || ''}`) })),
  }));

  const count = extra => cats.filter(c => c.extra === extra).reduce((n, c) => n + c.items.length, 0);
  el.lede.textContent = t('lede', num(count(false)), num(count(true)), num(cats.length));

  el.flavors.innerHTML = FLAVORS.map((f, i) =>
    `<button class="flavor" type="button" data-flavor="${i}" aria-pressed="false"><span class="sw" style="--a:${f.color}" aria-hidden="true"></span>${esc(pick(f.label))}</button>`
  ).join('');
  el.rail.innerHTML = cats.map(c => navLink(c, false)).join('');
  el.index.innerHTML = cats.map(c => `<li>${navLink(c, true)}</li>`).join('');
  el.menu.innerHTML = cats.map(sectionHtml).join('');

  for (const c of cats) {
    c.sec = document.getElementById(c.id);
    c.head = $('.cat-head', c.sec);
    c.body = $('.cat-body', c.sec);
    c.sub = $('.cat-sub', c.sec);
    c.count = $('.cat-count', c.sec);
    c.rail = $(`[data-goto="${c.id}"]`, el.rail);
    c.idx = $(`[data-goto="${c.id}"]`, el.index);
    c.idxCount = $('.n', c.idx);
    for (const it of c.items) {
      it.el = $(`[data-id="${it.id}"]`, c.sec);
      it.nameEl = $('.name', it.el);
    }
  }
  el.savedCount.textContent = num(view.saved.size);
  activeId = null;
  applyFilters();
}

export function renderMenuError(onRetry) {
  el.menu.innerHTML = `<div class="empty">
    <h3>${t('menuLoadTitle')}</h3>
    <p>${t('menuLoadBody')}</p>
    <div class="row"><button class="btn" type="button" id="retryMenu">${t('retry')}</button></div>
  </div>`;
  $('#retryMenu').addEventListener('click', onRetry);
}

/* ---------- Folding ---------- */
function setOpen(c, open) {
  c.sec.classList.toggle('open', open);
  c.head.setAttribute('aria-expanded', String(open));
  c.body.inert = !open;
}

// Remember fold state only for the normal view, not while searching/filtering
function rememberOpen(c, open) {
  if (isFiltering()) return;
  open ? view.open.add(c.id) : view.open.delete(c.id);
  store.set(KEYS.open, [...view.open]);
}

function updateExpandLabel() {
  const visible = visibleCats();
  const allOpen = visible.length > 0 && visible.every(c => c.sec.classList.contains('open'));
  el.expandAll.textContent = t(allOpen ? 'collapseAll' : 'expandAll');
  el.expandAll.hidden = visible.length < 2;
}

/* ---------- Search + filter ---------- */
function highlight(name, toks) {
  if (!toks.length) return esc(name);
  const chars = [...name];
  const low = chars.map(ch => fold(ch).charAt(0) || ' ').join(''); // same length as chars
  const hit = new Array(chars.length).fill(false);
  for (const tok of toks) {
    for (let i = low.indexOf(tok); i !== -1; i = low.indexOf(tok, i + 1)) hit.fill(true, i, i + tok.length);
  }
  return chars.map((ch, i) =>
    (hit[i] && !hit[i - 1] ? '<mark>' : '') + esc(ch) + (hit[i] && !hit[i + 1] ? '</mark>' : '')
  ).join('');
}

function matchesFilter(it, cat) {
  if (view.filter === 'all') return true;
  if (view.filter === 'saved') return view.saved.has(it.id);
  return !cat.extra && (it.temp || cat.temp) === view.filter;
}

export function applyFilters() {
  if (!cats.length) return;
  const toks = fold(view.q).split(/\s+/).filter(Boolean);
  const filtering = isFiltering();
  let total = 0;
  let shownCats = 0;

  for (const c of cats) {
    let n = 0;
    for (const it of c.items) {
      const show = toks.every(tok => it.hay.includes(tok)) && matchesFilter(it, c);
      it.el.hidden = !show;
      it.nameEl.innerHTML = highlight(pick(it.names), toks);
      if (show) n++;
    }
    total += n;
    if (n) shownCats++;

    c.sec.hidden = c.rail.hidden = c.idx.parentElement.hidden = n === 0;
    c.count.textContent = c.idxCount.textContent = num(n);
    c.sub.textContent = filtering ? `${t('matches', num(n))} · ${pick(c.blurb)}` : pick(c.blurb);
    setOpen(c, filtering ? n > 0 : view.open.has(c.id));
  }

  el.status.textContent = filtering && total ? t('showing', num(total), num(shownCats)) : '';
  const q = fold(view.q.trim());
  $$('.flavor', el.flavors).forEach(b =>
    b.setAttribute('aria-pressed', String(q !== '' && q === fold(pick(FLAVORS[b.dataset.flavor].q)))));
  $$('[data-filter]', el.filters).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === view.filter)));
  renderEmpty(total);
  updateExpandLabel();
  spy();
}

function renderEmpty(total) {
  el.empty.hidden = total > 0;
  if (total > 0) return;

  if (view.filter === 'saved' && !view.q.trim()) {
    el.empty.innerHTML = `<h3>${t('noSavedTitle')}</h3>
      <p>${t('noSavedBody')}</p>
      <div class="row"><button class="btn" type="button" data-reset>${t('browseMenu')}</button></div>`;
    return;
  }

  const where = { all: '', saved: t('whereSaved'), hot: t('whereHot'), cold: t('whereCold') }[view.filter];
  const tries = t('suggestions')
    .map(s => `<button class="chip" type="button" data-try="${esc(s)}">${esc(s)}</button>`).join('');
  el.empty.innerHTML = `<h3>${esc(t('noMatch', view.q.trim()))}${where}</h3>
    <p>${t('trySuggestions')}</p>
    <div class="row">${tries}</div>
    <div class="row"><button class="btn" type="button" data-reset>${t('showAll')}</button></div>`;
}

function setQuery(q, { scroll = true } = {}) {
  view.q = q;
  el.input.value = q;
  el.clear.hidden = !q;
  applyFilters();
  // Bring results into view if the visitor was far down the page
  const menuTop = el.masthead.offsetHeight;
  if (scroll && scrollY > menuTop) scrollTo({ top: menuTop, behavior: 'auto' });
}

function resetView() {
  view.filter = 'all';
  setQuery('');
}

/* ---------- Navigation ---------- */
function measureToolbar() {
  toolbarH = el.toolbar.offsetHeight;
  el.root.style.setProperty('--toolbar-h', `${toolbarH}px`);
}

function scrollToSection(c) {
  const y = c.sec.getBoundingClientRect().top + scrollY - toolbarH - 4;
  scrollTo({ top: Math.max(0, y), behavior: behavior() });
}

export function goTo(id) {
  const c = cats.find(x => x.id === id);
  if (!c) return;
  if (c.sec.hidden) resetView(); // target is filtered out: show everything again
  rememberOpen(c, true);
  applyFilters();
  setOpen(c, true);
  requestAnimationFrame(() => scrollToSection(c));
  try { history.replaceState(null, '', `#${id}`); } catch { /* sandboxed: ignore */ }
}

// Highlight the bar currently under the toolbar in the rail and index
function spy() {
  const visible = visibleCats();
  let current = visible[0];
  for (const c of visible) {
    if (c.sec.getBoundingClientRect().top - toolbarH - 60 <= 0) current = c;
  }
  const id = current?.id ?? null;
  if (id === activeId) return;
  activeId = id;

  for (const c of cats) {
    for (const link of [c.rail, c.idx]) {
      link.classList.toggle('active', c.id === id);
      c.id === id ? link.setAttribute('aria-current', 'true') : link.removeAttribute('aria-current');
    }
  }

  // Center the active chip in the strip (works for left-to-right and right-to-left)
  const chip = current?.rail;
  if (chip && el.rail.offsetParent) {
    const r = el.rail.getBoundingClientRect();
    const ch = chip.getBoundingClientRect();
    el.rail.scrollBy({ left: (ch.left + ch.width / 2) - (r.left + r.width / 2), behavior: behavior() });
  }
}

function onScroll() {
  spy();
  el.toolbar.classList.toggle('stuck', scrollY > el.masthead.offsetHeight - 1);
  el.toTop.classList.toggle('show', scrollY > 700);
}

/* ---------- Saved drinks ---------- */
function toggleSaved(btn) {
  const id = btn.closest('[data-id]').dataset.id;
  const it = cats.flatMap(c => c.items).find(x => x.id === id);
  const name = pick(it.names);
  const on = !view.saved.has(id);
  on ? view.saved.add(id) : view.saved.delete(id);
  store.set(KEYS.saved, [...view.saved]);

  btn.setAttribute('aria-pressed', String(on));
  btn.setAttribute('aria-label', on ? t('unsave', name) : t('save', name));
  el.savedCount.textContent = num(view.saved.size);
  toast(on ? t('savedToast', name) : t('removedToast', name));
  if (view.filter === 'saved') applyFilters();
}

/* ---------- Events ---------- */
export function initMenu({ onPickItem }) {
  onPick = onPickItem;
  new ResizeObserver(measureToolbar).observe(el.toolbar);
  measureToolbar();

  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; onScroll(); });
  }, { passive: true });

  // Search box
  el.input.addEventListener('input', () => setQuery(el.input.value));
  el.input.addEventListener('keydown', e => {
    if (e.key === 'Escape') el.input.value ? setQuery('') : el.input.blur();
    if (e.key === 'Enter') el.input.blur();
  });
  el.input.addEventListener('focus', () => { el.kbd.hidden = true; });
  el.input.addEventListener('blur', () => { el.kbd.hidden = false; });
  el.clear.addEventListener('click', e => { e.preventDefault(); setQuery(''); el.input.focus(); });

  // "/" jumps to search
  document.addEventListener('keydown', e => {
    const a = document.activeElement;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(a?.tagName) || a?.isContentEditable;
    if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !document.querySelector('dialog[open]')) {
      e.preventDefault();
      el.input.focus();
      el.input.select();
    }
  });

  // Flavor shortcuts toggle a search
  el.flavors.addEventListener('click', e => {
    const btn = e.target.closest('.flavor');
    if (!btn) return;
    const on = btn.getAttribute('aria-pressed') === 'true';
    setQuery(on ? '' : pick(FLAVORS[btn.dataset.flavor].q), { scroll: false });
    if (!on) scrollTo({ top: el.masthead.offsetHeight, behavior: behavior() });
  });

  // Filter chips + expand/collapse all
  el.filters.addEventListener('click', e => {
    const chip = e.target.closest('[data-filter]');
    if (chip) {
      view.filter = chip.dataset.filter === view.filter ? 'all' : chip.dataset.filter;
      applyFilters();
      return;
    }
    if (e.target.closest('#expandAll')) {
      const visible = visibleCats();
      const open = !visible.every(c => c.sec.classList.contains('open'));
      for (const c of visible) { setOpen(c, open); rememberOpen(c, open); }
      updateExpandLabel();
    }
  });

  // Drinks, hearts and section headers
  el.menu.addEventListener('click', e => {
    const fav = e.target.closest('.fav');
    if (fav) { toggleSaved(fav); return; }

    const pickBtn = e.target.closest('.item-main');
    if (pickBtn) { onPick(Number(pickBtn.dataset.key)); return; }

    const head = e.target.closest('.cat-head');
    if (!head) return;
    const c = cats.find(x => x.head === head);
    const open = !c.sec.classList.contains('open');
    setOpen(c, open);
    rememberOpen(c, open);
    updateExpandLabel();
    if (open && c.sec.getBoundingClientRect().top < toolbarH) scrollToSection(c);
  });

  // Empty-state suggestions
  el.empty.addEventListener('click', e => {
    const tryBtn = e.target.closest('[data-try]');
    if (tryBtn) setQuery(tryBtn.dataset.try);
    else if (e.target.closest('[data-reset]')) resetView();
  });

  // Any link to a bar (rail, index, footer)
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-goto]');
    if (!a) return;
    e.preventDefault();
    goTo(a.dataset.goto);
  });

  el.toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: behavior() }));
}
