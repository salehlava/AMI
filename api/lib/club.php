<?php
/* Customer club: join, log in, stamp card */
declare(strict_types=1);

const MAX_PIN_TRIES = 5;
const LOCK_SECONDS = 600;

function find_member(int $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM members WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch() ?: null;
}

function current_member(): ?array
{
    $id = (int)($_SESSION['member_id'] ?? 0);
    return $id ? find_member($id) : null;
}

function read_pin(array $in): string
{
    $pin = latin_digits(text($in, 'pin', 4, true));
    if (!preg_match('/^\d{4}$/', $pin)) fail('bad_pin');
    return $pin;
}

function club_join(array $in): array
{
    $name = text($in, 'name', 40, true);
    $phone = normalize_phone(text($in, 'phone', 20, true));
    $pin = read_pin($in);

    $exists = db()->prepare('SELECT 1 FROM members WHERE phone = ?');
    $exists->execute([$phone]);
    if ($exists->fetchColumn()) fail('phone_taken', 409);

    db()->prepare('INSERT INTO members (phone, name, pin_hash, created_at) VALUES (?, ?, ?, ?)')
        ->execute([$phone, $name, password_hash($pin, PASSWORD_DEFAULT), time()]);

    session_regenerate_id(true);
    $_SESSION['member_id'] = (int)db()->lastInsertId();
    return ['member' => member_view(current_member())];
}

function club_login(array $in): array
{
    $phone = normalize_phone(text($in, 'phone', 20, true));
    $pin = read_pin($in);

    $stmt = db()->prepare('SELECT * FROM members WHERE phone = ?');
    $stmt->execute([$phone]);
    $m = $stmt->fetch();
    if (!$m) fail('wrong_login', 401);
    if ((int)$m['locked_until'] > time()) fail('locked', 429);

    if (!password_verify($pin, $m['pin_hash'])) {
        $tries = (int)$m['failed_logins'] + 1;
        $locked = $tries >= MAX_PIN_TRIES;
        db()->prepare('UPDATE members SET failed_logins = ?, locked_until = ? WHERE id = ?')
            ->execute([$locked ? 0 : $tries, $locked ? time() + LOCK_SECONDS : 0, $m['id']]);
        fail($locked ? 'locked' : 'wrong_login', $locked ? 429 : 401);
    }

    db()->prepare('UPDATE members SET failed_logins = 0, locked_until = 0 WHERE id = ?')->execute([$m['id']]);
    session_regenerate_id(true);
    $_SESSION['member_id'] = (int)$m['id'];
    return ['member' => member_view(find_member((int)$m['id']))];
}

function club_logout(): array
{
    unset($_SESSION['member_id']);
    return ['ok' => true];
}

function club_me(): array
{
    $m = current_member();
    return ['member' => $m ? member_view($m) : null];
}

function tier_for(int $drinks): string
{
    return $drinks >= 80 ? 'gold' : ($drinks >= 30 ? 'silver' : 'member');
}

function member_view(array $m): array
{
    $stmt = db()->prepare('SELECT * FROM orders WHERE member_id = ? ORDER BY created_at DESC LIMIT 8');
    $stmt->execute([$m['id']]);

    return [
        'name' => $m['name'],
        'phone' => $m['phone'],
        'stamps' => (int)$m['stamps'],
        'totalDrinks' => (int)$m['total_drinks'],
        'tier' => tier_for((int)$m['total_drinks']),
        'joinedAt' => (int)$m['created_at'],
        'orders' => array_map(fn(array $o) => [
            'number' => (int)$o['number'],
            'status' => $o['status'],
            'total' => (int)$o['total'],
            'drinks' => (int)$o['drinks'],
            'createdAt' => (int)$o['created_at'],
        ], $stmt->fetchAll()),
    ];
}
