/* =============================================================
   Online admin text (admin/) — English and Persian.
   Builds on the café admin's text, so shared words stay the same.
   ============================================================= */
import { ADMIN_STRINGS } from './admin-strings.js';

const EN = {
  onlineAdmin: 'Online admin',
  signInTitle: 'Sign in',
  signInBody: 'Edit the menu on salehlava.github.io/AMI from anywhere.',
  username: 'Username',
  rememberMe: 'Keep me signed in on this device',
  setupLink: 'Set up sign-in again (needs a GitHub key)',

  setupTitle: 'Set up the online admin',
  setupBody: 'Do this once. The GitHub key is locked with your username and password, so after this you only need those two.',
  setupStep1: 'Sign in to GitHub as salehlava and open',
  setupStep2: 'Token name: “AMI admin”. Expiration: 1 year.',
  setupStep3: 'Repository access: Only select repositories → salehlava/AMI.',
  setupStep4: 'Permissions → Repository permissions → Contents: Read and write.',
  setupStep5: 'Press Generate token and paste the key (it starts with github_pat_) below.',
  ghKey: 'GitHub key',
  chooseUsername: 'Choose a username',
  choosePassword: 'Choose a password',
  passwordRule: 'At least 10 characters. Use a password you don’t use anywhere else.',
  setupButton: 'Save and open the admin',
  backToSignIn: 'Back to sign in',
  checking: 'Checking…',

  tabMenu: 'Menu',
  tabAccount: 'Account',
  viewMenu: 'Open the menu',

  unsaved: n => (n === 1 ? '1 unsaved change' : `${n} unsaved changes`),
  noChanges: 'All changes are published',
  publish: 'Publish',
  publishing: 'Publishing…',
  discard: 'Discard',
  confirmDiscard: 'Tap again to discard',
  discarded: 'Changes discarded',
  published: 'Published. The menu updates in about a minute.',
  leaveWarning: 'You have changes that are not published yet.',
  priceChanged: name => `${name}: new price (not published yet)`,
  availabilityChanged: (name, on) => (on ? `${name}: available (not published yet)` : `${name}: sold out (not published yet)`),
  changedNotPublished: 'Changed. Press Publish to put it on the menu.',
  reloadMenu: 'Load the newest menu',

  changeLogin: 'Change username or password',
  currentUsername: 'Current username',
  newUsername: 'New username',
  loginChanged: 'Username and password changed',
  newKeyTitle: 'GitHub key',
  newKeyBody: 'When the key expires (GitHub emails you first), make a new one and set up again.',
  newKeyButton: 'Set up with a new key',
  historyTitle: 'Change history',
  historyBody: 'Every publish is saved on GitHub, so an old menu can always be brought back.',
  historyLink: 'See all menu changes',
  cafeAdminNote: 'Orders, the basket and the club run on the café computer (start-admin.bat). This page edits the online menu.',
};

const FA = {
  onlineAdmin: 'پنل آنلاین',
  signInTitle: 'ورود',
  signInBody: 'منوی salehlava.github.io/AMI را از هر جا ویرایش کنید.',
  username: 'نام کاربری',
  rememberMe: 'روی این دستگاه وارد بمانم',
  setupLink: 'راه‌اندازی دوباره‌ی ورود (کلید GitHub لازم است)',

  setupTitle: 'راه‌اندازی پنل آنلاین',
  setupBody: 'فقط یک بار لازم است. کلید GitHub با نام کاربری و رمز شما قفل می‌شود و از این به بعد فقط همین دو را لازم دارید.',
  setupStep1: 'با حساب salehlava وارد GitHub شوید و این صفحه را باز کنید:',
  setupStep2: 'Token name: «AMI admin». Expiration: یک سال.',
  setupStep3: 'Repository access: گزینه‌ی Only select repositories و بعد salehlava/AMI.',
  setupStep4: 'Permissions ← Repository permissions ← Contents: Read and write.',
  setupStep5: 'Generate token را بزنید و کلید (با github_pat_ شروع می‌شود) را این پایین وارد کنید.',
  ghKey: 'کلید GitHub',
  chooseUsername: 'یک نام کاربری انتخاب کنید',
  choosePassword: 'یک رمز انتخاب کنید',
  passwordRule: 'دست‌کم ۱۰ کاراکتر. رمزی بگذارید که جای دیگری استفاده نمی‌کنید.',
  setupButton: 'ذخیره و ورود به پنل',
  backToSignIn: 'بازگشت به ورود',
  checking: 'در حال بررسی…',

  tabMenu: 'منو',
  tabAccount: 'حساب',
  viewMenu: 'باز کردن منو',

  unsaved: n => `${String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d])} تغییر منتشرنشده`,
  noChanges: 'همه‌ی تغییرها منتشر شده‌اند',
  publish: 'انتشار',
  publishing: 'در حال انتشار…',
  discard: 'لغو تغییرها',
  confirmDiscard: 'برای لغو دوباره بزنید',
  discarded: 'تغییرها لغو شد',
  published: 'منتشر شد. منو تا حدود یک دقیقه‌ی دیگر به‌روز می‌شود.',
  leaveWarning: 'تغییرهایی دارید که هنوز منتشر نشده‌اند.',
  priceChanged: name => `${name}: قیمت تازه (هنوز منتشر نشده)`,
  availabilityChanged: (name, on) => (on ? `${name}: موجود (هنوز منتشر نشده)` : `${name}: ناموجود (هنوز منتشر نشده)`),
  changedNotPublished: 'تغییر کرد. برای رفتن روی منو «انتشار» را بزنید.',
  reloadMenu: 'دریافت تازه‌ترین منو',

  changeLogin: 'تغییر نام کاربری یا رمز',
  currentUsername: 'نام کاربری فعلی',
  newUsername: 'نام کاربری تازه',
  loginChanged: 'نام کاربری و رمز عوض شد',
  newKeyTitle: 'کلید GitHub',
  newKeyBody: 'وقتی کلید منقضی شد (GitHub پیش از آن ایمیل می‌زند)، کلید تازه‌ای بسازید و دوباره راه‌اندازی کنید.',
  newKeyButton: 'راه‌اندازی با کلید تازه',
  historyTitle: 'تاریخچه‌ی تغییرها',
  historyBody: 'هر انتشار در GitHub ذخیره می‌شود، پس همیشه می‌شود منوی قبلی را برگرداند.',
  historyLink: 'دیدن همه‌ی تغییرهای منو',
  cafeAdminNote: 'سفارش‌ها، سبد خرید و باشگاه روی کامپیوتر کافه کار می‌کنند (start-admin.bat). این صفحه منوی آنلاین را ویرایش می‌کند.',
};

const ERRORS_EN = {
  offline: 'Can’t reach GitHub. Check the internet connection and try again.',
  wrong_login: 'Wrong username or password.',
  bad_key: 'GitHub didn’t accept the key. It may have expired: set up again with a new key.',
  no_access: 'This key can’t change salehlava/AMI. Check “Only select repositories” and “Contents: Read and write”.',
  conflict: 'The menu was changed somewhere else after you opened it. Load the newest menu, then make your change again.',
  github_error: 'GitHub had a problem. Please try again.',
  not_set_up: 'The online admin isn’t set up yet.',
  missing_key: 'Paste the GitHub key.',
  missing_user: 'Enter a username.',
  weak_password: 'Use at least 10 characters.',
};

const ERRORS_FA = {
  offline: 'اتصال به GitHub برقرار نشد. اینترنت را بررسی کنید و دوباره امتحان کنید.',
  wrong_login: 'نام کاربری یا رمز درست نیست.',
  bad_key: 'GitHub کلید را نپذیرفت. شاید منقضی شده باشد؛ با کلید تازه دوباره راه‌اندازی کنید.',
  no_access: 'این کلید اجازه‌ی تغییر salehlava/AMI را ندارد. «Only select repositories» و «Contents: Read and write» را بررسی کنید.',
  conflict: 'منو بعد از باز کردن این صفحه جای دیگری تغییر کرده است. تازه‌ترین منو را دریافت کنید و تغییرتان را دوباره انجام دهید.',
  github_error: 'GitHub به مشکل خورد. دوباره امتحان کنید.',
  not_set_up: 'پنل آنلاین هنوز راه‌اندازی نشده است.',
  missing_key: 'کلید GitHub را وارد کنید.',
  missing_user: 'نام کاربری را وارد کنید.',
  weak_password: 'دست‌کم ۱۰ کاراکتر وارد کنید.',
};

export const GH_STRINGS = {
  en: { ...ADMIN_STRINGS.en, ...EN, errors: { ...ADMIN_STRINGS.en.errors, ...ERRORS_EN } },
  fa: { ...ADMIN_STRINGS.fa, ...FA, errors: { ...ADMIN_STRINGS.fa.errors, ...ERRORS_FA } },
};
