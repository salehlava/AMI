# AMI Café

**[Open the menu →](https://salehlava.github.io/AMI/)**

Menu, ordering and customer club for AMI café, in English and Persian (فارسی).

- **Menu**: search, flavor shortcuts, hot/cold filters, foldable sections, saved drinks, light and dark themes.
- **Basket (سبد خرید)**: pick syrups and milk, add notes, order for a table or takeaway, follow the order status live. Customers pay at the counter.
- **Customer club (باشگاه مشتریان)**: join with a mobile number and a 4-digit PIN, one stamp per drink, a free drink every 10 stamps, Member / Silver / Gold tiers.
- **Admin panel**: live order board with a sound alert, menu and price editing, sold-out switch, club members, settings.

## Online menu

https://salehlava.github.io/AMI/ shows the menu straight from this repository (GitHub Pages). GitHub Pages cannot run PHP, so that copy is browse-only: search, filters, saved drinks, Persian and dark mode work; the basket, club and admin panel need the PHP server below. It shows the starting menu from `api/seed/menu.json`, so prices you set in the admin panel appear only on the café server.

## Run it

Needs PHP 8.1+ with the `pdo_sqlite` extension. Nothing else to install.

```
php -S 127.0.0.1:8080 router.php
```

On Windows, double-click `start.bat` (menu) or `start-admin.bat` (admin panel). Edit `PHP_EXE` in those files if PHP lives somewhere else.

- Menu: http://127.0.0.1:8080/
- Admin: http://127.0.0.1:8080/admin.html

The first run creates `data/ami.sqlite` and fills the menu from `api/seed/menu.json`.

**The first admin password is `ami1234`. Change it in Admin → Settings before customers use the site.**

## Project layout

```
index.html, admin.html   pages
css/                     style.css (menu), components.css (shared), admin.css
js/                      ES modules: app.js and admin.js are the entry points
api/index.php            JSON API (api/index.php?r=<route>)
api/lib/                 database, orders, club, admin logic
api/seed/menu.json       starting menu
router.php               router for PHP's built-in server; keeps data/ and api/lib/ private
data/                    SQLite database and sessions (not in git)
```

Interface text lives in `js/strings.js` (menu) and `js/admin-strings.js` (admin). Menu items and prices are edited in the admin panel.

## Backups

Everything the café enters (menu changes, orders, club members) is in `data/ami.sqlite`. Copy that file to back it up.
