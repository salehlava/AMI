/* Flavor shortcuts and dot colors for the menu. Menu items themselves live in the database. */

// Flavor shortcuts in the header: tapping one searches for it
export const FLAVORS = [
  { label: ['Matcha', 'ماچا'], q: ['matcha', 'ماچا'], color: '#7FA34A' },
  { label: ['Pistachio', 'پسته'], q: ['pistachio', 'پسته'], color: '#A7BC5B' },
  { label: ['Ube', 'اوبه'], q: ['ube', 'اوبه'], color: '#7B58A8' },
  { label: ['Spirulina', 'اسپرولینا'], q: ['spirulina', 'اسپرولینا'], color: '#2E8C83' },
  { label: ['Chocolate', 'شکلات'], q: ['choco', 'شکلات'], color: '#5A3424' },
  { label: ['Pumpkin', 'پامکین'], q: ['pumpkin', 'پامکین'], color: '#E07B2A' },
  { label: ['Strawberry', 'توت فرنگی'], q: ['strawberry', 'توت فرنگی'], color: '#D6455B' },
  { label: ['Lotus', 'لوتوس'], q: ['lotus', 'لوتوس'], color: '#C08A4A' },
  { label: ['Mango', 'انبه'], q: ['mango', 'انبه'], color: '#F5A623' },
  { label: ['Saffron', 'زعفران'], q: ['saffron', 'زعفران'], color: '#E7A10F' },
];

// Extra Persian search words for English words in drink names. The menu uses
// spoken names (هات چاکلت, پامکین), so searching the everyday word (شکلات, کدو) finds them too.
export const FA_ALIASES = {
  chocolate: 'شکلات چاکلت چوکو', choco: 'شکلات چاکلت چوکو', mocha: 'شکلات',
  pumpkin: 'کدو پامکین', cinnamon: 'دارچین سینامون',
  strawberry: 'توت فرنگی استرابری', coconut: 'نارگیل کوکونات کوکو', coco: 'نارگیل کوکونات کوکو',
  spirulina: 'اسپیرولینا اسپرولینا', biscuit: 'بیسکویت بیسکو', vanilla: 'وانیل وانیلا',
  lime: 'لیمو لایم', lemon: 'لیمو لیمون لایمون', lemonade: 'لیموناد لیمو',
  peanut: 'بادام زمینی', whey: 'وی پروتئین', robusta: 'روبوستا ربوستا', affogato: 'آفوگاتو آفاگاتو',
  guava: 'گواوا گوآوا', blueberry: 'بلوبری بلو بری', bubble: 'آدامس بابل گام', green: 'سبز گرین گیرین',
  black: 'سیاه مشکی بلک', red: 'قرمز رد', pink: 'صورتی پینک', white: 'سفید وایت', dark: 'تلخ دارک',
  coffee: 'قهوه کافی', brew: 'قهوه', espresso: 'قهوه', americano: 'قهوه', latte: 'لاته',
  tea: 'چای', herbal: 'دمنوش گیاهی', mango: 'انبه', honey: 'عسل', saffron: 'زعفران',
};

// English word → dot color. A drink's dot shows the first one or two flavors in its name.
export const SWATCH = {
  // coffee
  espresso: '#3E2418', robusta: '#2E1B12', arabica: '#6B4430', americano: '#3E2418', latte: '#C9A27E',
  cappuccino: '#B88A5E', mocha: '#5A3A2A', affogato: '#EDE2CC', cortado: '#94653F', macchiato: '#A97A52',
  v60: '#7A4B2F', coffee: '#5B3A26', brew: '#3E2A1F',
  // chocolate, nuts, sweets
  chocolate: '#5A3424', choco: '#5A3424', dark: '#2B1810', pink: '#E890B0', white: '#F1E9DA',
  nutella: '#6A3B22', peanut: '#C79A5A', oreo: '#2A2A2A', biscuit: '#C99A5B', cookie: '#B98A55',
  lotus: '#C08A4A', caramel: '#C47A2C', tiramisu: '#A57B5A', popcorn: '#F2DFA0', bubble: '#F59AC0',
  hazelnut: '#8B5A2B', almond: '#D8B48A', pistachio: '#A7BC5B', vanilla: '#F0E3C0', irish: '#6E4B2E',
  // milk, spice, tea
  milk: '#F3EEE4', honey: '#E3A72F', whey: '#D9CBB0', coconut: '#EFE9DD', coco: '#EFE9DD',
  cinnamon: '#B5652B', pumpkin: '#E07B2A', masala: '#A0522D', karak: '#B0703A', saffron: '#E7A10F',
  tea: '#A8692C', black: '#1E1A18', green: '#5BAF5B', thyme: '#8A9A5B', borage: '#5E6FC0', blossom: '#F6D7B0',
  matcha: '#7FA34A', spirulina: '#2E8C83', ube: '#7B58A8',
  // fruit and fresh
  strawberry: '#D6455B', berry: '#8E3B6E', blueberry: '#4A5FB5', ruby: '#B8263F', red: '#C8323C',
  lime: '#9CC63B', lemon: '#F2D74B', lemonade: '#F2D74B', orange: '#F28C28', mango: '#F5A623',
  peach: '#F4A07A', passion: '#E8B23A', guava: '#E87A80', tropical: '#F2A33A', pina: '#F4D35E',
  mojito: '#8FCB5C', fizz: '#F2C6CF', cactus: '#5F9E5A', blue: '#3F7FD8', vinko: '#8C2F4A', triple: '#F2A03D',
  // bottled
  coca: '#5A1E14', soda: '#D6ECF3', monster: '#7AC943', water: '#BFE3F2',
};
