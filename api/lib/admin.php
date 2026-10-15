<?php
/* Admin panel: login, menu editing, club members, settings */
declare(strict_types=1);

function require_admin(): void
{
    if (empty($_SESSION['admin'])) fail('unauthorized', 401);
}

function admin_me(): array
{
    $in = !empty($_SESSION['admin']);
    return [
        'loggedIn' => $in,
        'defaultPassword' => $in && password_verify(DEFAULT_ADMIN_PASSWORD, setting('admin_hash')),
    ];
}

function admin_login(array $in): array
{
    $password = (string)($in['password'] ?? '');
    if (!password_verify($password, setting('admin_hash'))) {
        usleep(800000); // slows down password guessing
        fail('wrong_password', 401);
    }
    session_regenerate_id(true);
    $_SESSION['admin'] = true;
    return admin_me();
}

function admin_logout(): array
{
    unset($_SESSION['admin']);
    return ['ok' => true];
}

function admin_password(array $in): array
{
    if (!password_verify((string)($in['current'] ?? ''), setting('admin_hash'))) fail('wrong_password', 401);
    $next = (string)($in['next'] ?? '');
    if (strlen($next) < 6 || strlen($next) > 200) fail('weak_password');
    save_setting('admin_hash', password_hash($next, PASSWORD_DEFAULT));
    return ['ok' => true];
}

/* ---------- Menu ---------- */

function admin_item_save(array $in): array
{
    $pdo = db();
    $id = ($in['id'] ?? null) === null ? null : integer($in, 'id', 1, PHP_INT_MAX);
    $category = text($in, 'category', 60, true);
    $nameEn = text($in, 'nameEn', 60, true);
    $nameFa = text($in, 'nameFa', 60, true);
    $price = integer($in, 'price', 0, 1_000_000_000);
    $temp = in_array($in['temp'] ?? '', ['hot', 'cold'], true) ? $in['temp'] : null;
    $available = empty($in['available']) ? 0 : 1;

    $cat = $pdo->prepare('SELECT 1 FROM categories WHERE id = ?');
    $cat->execute([$category]);
    if (!$cat->fetchColumn()) fail('bad_category');

    if ($id !== null) {
        $exists = $pdo->prepare('SELECT category_id FROM items WHERE id = ?');
        $exists->execute([$id]);
        $oldCategory = $exists->fetchColumn();
        if ($oldCategory === false) fail('not_found', 404);
        $sort = $oldCategory === $category ? null : next_sort($category);
        $pdo->prepare('UPDATE items SET category_id = ?, name_en = ?, name_fa = ?, price = ?, temp = ?, available = ?,
                       sort = COALESCE(?, sort) WHERE id = ?')
            ->execute([$category, $nameEn, $nameFa, $price, $temp, $available, $sort, $id]);
    } else {
        $pdo->prepare('INSERT INTO items (code, category_id, name_en, name_fa, price, temp, available, sort)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([unique_code($category, $nameEn), $category, $nameEn, $nameFa, $price, $temp, $available,
                       next_sort($category)]);
        $id = (int)$pdo->lastInsertId();
    }

    $row = $pdo->prepare('SELECT * FROM items WHERE id = ?');
    $row->execute([$id]);
    return ['item' => item_view($row->fetch())];
}

function admin_item_delete(array $in): array
{
    db()->prepare('DELETE FROM items WHERE id = ?')->execute([integer($in, 'id', 1, PHP_INT_MAX)]);
    return ['ok' => true];
}

function next_sort(string $category): int
{
    $stmt = db()->prepare('SELECT COALESCE(MAX(sort), -1) + 1 FROM items WHERE category_id = ?');
    $stmt->execute([$category]);
    return (int)$stmt->fetchColumn();
}

/** Stable id for a new item, used by customers' saved drinks */
function unique_code(string $category, string $nameEn): string
{
    $base = $category . '--' . slugify($nameEn);
    $stmt = db()->prepare('SELECT 1 FROM items WHERE code = ?');
    for ($code = $base, $n = 2; ; $code = "$base-$n", $n++) {
        $stmt->execute([$code]);
        if (!$stmt->fetchColumn()) return $code;
    }
}

/* ---------- Club members ---------- */

function admin_members(): array
{
    $q = trim(latin_digits((string)($_GET['q'] ?? '')));
    $like = '%' . str_replace(['%', '_'], ['\%', '\_'], $q) . '%';
    $stmt = db()->prepare("SELECT * FROM members WHERE name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\'
                           ORDER BY created_at DESC LIMIT 300");
    $stmt->execute([$like, $like]);

    return [
        'members' => array_map(fn(array $m) => [
            'id' => (int)$m['id'],
            'name' => $m['name'],
            'phone' => $m['phone'],
            'stamps' => (int)$m['stamps'],
            'totalDrinks' => (int)$m['total_drinks'],
            'tier' => tier_for((int)$m['total_drinks']),
            'joinedAt' => (int)$m['created_at'],
        ], $stmt->fetchAll()),
        'total' => (int)db()->query('SELECT COUNT(*) FROM members')->fetchColumn(),
        'stampsPerReward' => (int)setting('stamps_per_reward'),
    ];
}

function admin_member_stamps(array $in): array
{
    $id = integer($in, 'id', 1, PHP_INT_MAX);
    $delta = integer($in, 'delta', -1000, 1000);
    db()->prepare('UPDATE members SET stamps = MAX(0, stamps + ?) WHERE id = ?')->execute([$delta, $id]);
    $m = find_member($id) ?? fail('not_found', 404);
    return ['stamps' => (int)$m['stamps']];
}

/* ---------- Settings ---------- */

function admin_settings(): array
{
    return public_settings();
}

function admin_settings_save(array $in): array
{
    save_setting('ordering_open', empty($in['orderingOpen']) ? '0' : '1');
    save_setting('currency_en', text($in, 'currencyEn', 12));
    save_setting('currency_fa', text($in, 'currencyFa', 12));
    save_setting('stamps_per_reward', (string)integer($in, 'stampsPerReward', 3, 50));
    save_setting('default_lang', ($in['defaultLang'] ?? '') === 'fa' ? 'fa' : 'en');
    return public_settings();
}
