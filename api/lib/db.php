<?php
/* SQLite database: connection, schema, first-run seed, settings */
declare(strict_types=1);

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    if (!is_dir(DATA_DIR)) mkdir(DATA_DIR, 0775, true);
    $pdo = new PDO('sqlite:' . DB_FILE, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA busy_timeout = 3000');
    migrate($pdo);
    return $pdo;
}

function migrate(PDO $pdo): void
{
    $pdo->exec(<<<SQL
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS categories (
            id       TEXT PRIMARY KEY,
            name_en  TEXT NOT NULL,
            name_fa  TEXT NOT NULL,
            blurb_en TEXT NOT NULL DEFAULT '',
            blurb_fa TEXT NOT NULL DEFAULT '',
            color    TEXT NOT NULL,
            temp     TEXT,
            extra    INTEGER NOT NULL DEFAULT 0,
            keywords TEXT NOT NULL DEFAULT '',
            sort     INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS items (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            code        TEXT NOT NULL UNIQUE,
            category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            name_en     TEXT NOT NULL,
            name_fa     TEXT NOT NULL,
            price       INTEGER NOT NULL DEFAULT 0,
            temp        TEXT,
            available   INTEGER NOT NULL DEFAULT 1,
            sort        INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS members (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            phone         TEXT NOT NULL UNIQUE,
            name          TEXT NOT NULL,
            pin_hash      TEXT NOT NULL,
            stamps        INTEGER NOT NULL DEFAULT 0,
            total_drinks  INTEGER NOT NULL DEFAULT 0,
            failed_logins INTEGER NOT NULL DEFAULT 0,
            locked_until  INTEGER NOT NULL DEFAULT 0,
            created_at    INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS orders (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            number        INTEGER NOT NULL,
            token         TEXT NOT NULL,
            member_id     INTEGER REFERENCES members(id) ON DELETE SET NULL,
            type          TEXT NOT NULL,
            table_no      TEXT NOT NULL DEFAULT '',
            note          TEXT NOT NULL DEFAULT '',
            status        TEXT NOT NULL DEFAULT 'new',
            subtotal      INTEGER NOT NULL,
            discount      INTEGER NOT NULL DEFAULT 0,
            total         INTEGER NOT NULL,
            drinks        INTEGER NOT NULL,
            reward_stamps INTEGER NOT NULL DEFAULT 0,
            stamps_earned INTEGER NOT NULL DEFAULT 0,
            lang          TEXT NOT NULL DEFAULT 'en',
            created_at    INTEGER NOT NULL,
            updated_at    INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS orders_by_status ON orders(status, created_at);
        CREATE INDEX IF NOT EXISTS orders_by_member ON orders(member_id, created_at);
        CREATE TABLE IF NOT EXISTS order_lines (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            item_id    INTEGER REFERENCES items(id) ON DELETE SET NULL,
            name_en    TEXT NOT NULL,
            name_fa    TEXT NOT NULL,
            qty        INTEGER NOT NULL,
            unit_price INTEGER NOT NULL,
            extras     TEXT NOT NULL DEFAULT '[]',
            note       TEXT NOT NULL DEFAULT '',
            line_total INTEGER NOT NULL
        );
        SQL);

    if ((int)$pdo->query('SELECT COUNT(*) FROM categories')->fetchColumn() === 0) seed_menu($pdo);

    $defaults = [
        'ordering_open' => '1',
        'currency_en' => '',
        'currency_fa' => '',
        'stamps_per_reward' => '10',
        'default_lang' => 'en',
    ];
    $insert = $pdo->prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    foreach ($defaults as $k => $v) $insert->execute([$k, $v]);
    if ($pdo->query("SELECT 1 FROM settings WHERE key = 'admin_hash'")->fetchColumn() === false) {
        $insert->execute(['admin_hash', password_hash(DEFAULT_ADMIN_PASSWORD, PASSWORD_DEFAULT)]);
    }
}

function seed_menu(PDO $pdo): void
{
    $menu = json_decode((string)file_get_contents(SEED_FILE), true, 64, JSON_THROW_ON_ERROR);
    $cat = $pdo->prepare('INSERT INTO categories (id, name_en, name_fa, blurb_en, blurb_fa, color, temp, extra, keywords, sort)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $item = $pdo->prepare('INSERT INTO items (code, category_id, name_en, name_fa, price, temp, sort)
                           VALUES (?, ?, ?, ?, ?, ?, ?)');
    $pdo->beginTransaction();
    foreach ($menu as $ci => $c) {
        $cat->execute([$c['id'], $c['name'][0], $c['name'][1], $c['blurb'][0], $c['blurb'][1], $c['color'],
                       $c['temp'], $c['extra'] ? 1 : 0, $c['keys'], $ci]);
        foreach ($c['items'] as $ii => $it) {
            $item->execute([$it['code'], $c['id'], $it['name'][0], $it['name'][1], (int)$it['price'], $it['temp'], $ii]);
        }
    }
    $pdo->commit();
}

function setting(string $key): string
{
    $stmt = db()->prepare('SELECT value FROM settings WHERE key = ?');
    $stmt->execute([$key]);
    return (string)$stmt->fetchColumn();
}

function save_setting(string $key, string $value): void
{
    db()->prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        ->execute([$key, $value]);
}
