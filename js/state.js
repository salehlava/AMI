/* Shared state for the customer page, plus a tiny event bus */
export const state = {
  menu: null,          // { categories, settings } from the server
  itemsByKey: new Map(), // database id → { item, cat }
  member: null,        // logged-in club member, or null
  menuOnly: false,     // true when there is no server (e.g. GitHub Pages): browse only
};

const bus = new EventTarget();
export const on = (type, fn) => bus.addEventListener(type, e => fn(e.detail));
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

export function setMenu(menu) {
  state.menu = menu;
  state.itemsByKey = new Map();
  for (const cat of menu.categories) {
    for (const item of cat.items) state.itemsByKey.set(item.key, { item, cat });
  }
}

export const extraCategories = () => state.menu.categories.filter(c => c.extra);
export const settings = () => state.menu?.settings ?? { orderingOpen: false, stampsPerReward: 10, currency: ['', ''] };
