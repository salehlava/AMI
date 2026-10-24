# AMI Café

**[Open the menu →](https://salehlava.github.io/AMI/)**

Menu, ordering and customer club for AMI café, in English and Persian (فارسی).

- **Menu**: search, flavor shortcuts, hot/cold filters, foldable sections, saved drinks, light and dark themes.
- **Basket (سبد خرید)**: pick syrups and milk, add notes, order for a table or takeaway, follow the order status live. Customers pay at the counter.
- **Customer club (باشگاه مشتریان)**: join with a mobile number and a 4-digit PIN, one stamp per drink, a free drink every 10 stamps, Member / Silver / Gold tiers.
- **Admin panel**: live order board with a sound alert, menu and price editing, sold-out switch, club members, settings.

## Online menu

https://salehlava.github.io/AMI/ shows the menu straight from this repository (GitHub Pages). GitHub Pages cannot run PHP, so that copy is browse-only: search, filters, saved drinks, Persian and dark mode work; the basket, club and admin panel need the PHP server below. It shows the menu from `api/seed/menu.json`.

## Online admin

https://salehlava.github.io/AMI/admin/ edits the online menu from anywhere: prices, sold out, names, adding and deleting drinks. Changes collect in a Publish bar; Publish saves `api/seed/menu.json` to this repository through the GitHub API, and the menu updates about a minute later. Every publish is a commit, so old menus can be brought back.

First visit: the page asks once for a fine-grained GitHub token (only this repository, Contents: Read and write) and a username + password. The token is stored in `admin/auth.json`, locked with AES-256-GCM using a key made from the username and password (PBKDF2-SHA256, 600,000 rounds). That file is public, so use a strong password (at least 10 characters).

The café server's admin panel (below) keeps its own database; the online admin changes only the online menu.

## Run it

Needs PHP 8.1+ with the `pdo_sqlite` extension. Nothing else to install.

```
php -S 127.0.0.1:8080 router.php
```

On Windows, double-click `start.bat` (menu) or `start-admin.bat` (admin panel). Edit `PHP_EXE` in those files if PHP lives somewhere else.

- Menu: http://127.0.0.1:8080/
- Admin: http://127.0.0.1:8080/admin.html

The first run creates `data/ami.sqlite` and fills the menu from `api/seed/menu.json`.

**The first admin password is `ami1234`. On first sign-in the panel stays locked until you choose a new one** (after 5 wrong passwords, sign-in pauses for 10 minutes).

## Project layout

```
index.html, admin.html   pages (admin.html needs the PHP server)
admin/                   online admin for GitHub Pages (admin/auth.json = locked GitHub token)
css/                     style.css (menu), components.css (shared), admin.css
js/                      ES modules: app.js, admin.js and gh-admin.js are the entry points
api/index.php            JSON API (api/index.php?r=<route>)
api/lib/                 database, orders, club, admin logic
api/seed/menu.json       starting menu
router.php               router for PHP's built-in server; keeps data/ and api/lib/ private
data/                    SQLite database and sessions (not in git)
```

Interface text lives in `js/strings.js` (menu) and `js/admin-strings.js` (admin). Menu items and prices are edited in the admin panel.

## Backups

Everything the café enters (menu changes, orders, club members) is in `data/ami.sqlite`. Copy that file to back it up.
