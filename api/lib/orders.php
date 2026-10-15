<?php
/* Orders: placing, tracking, and status changes from the admin board */
declare(strict_types=1);

const ORDER_STATUSES = ['new', 'preparing', 'ready', 'done', 'cancelled'];
const FINAL_STATUSES = ['done', 'cancelled'];
const MAX_LINES = 30;
const MAX_QTY = 20;
const MAX_EXTRAS = 10;

/** Places an order. Prices always come from the database, never from the browser. */
function place_order(array $in): array
{
    if (setting('ordering_open') !== '1') fail('ordering_closed', 409);

    $lines = $in['lines'] ?? null;
    if (!is_array($lines) || !$lines || count($lines) > MAX_LINES) fail('empty_basket');

    $type = ($in['type'] ?? '') === 'takeaway' ? 'takeaway' : 'dine-in';
    $table = $type === 'dine-in' ? latin_digits(text($in, 'table', 10)) : '';
    $note = text($in, 'note', 200);
    $lang = ($in['lang'] ?? '') === 'fa' ? 'fa' : 'en';

    $pdo = db();
    $rows = $pdo->query('SELECT i.*, c.extra FROM items i JOIN categories c ON c.id = i.category_id')->fetchAll();
    $items = array_column($rows, null, 'id');

    $prepared = [];
    $subtotal = 0;
    $drinks = 0;
    $cheapest = null;

    foreach ($lines as $line) {
        if (!is_array($line)) fail('bad_request');
        $item = $items[(int)($line['item'] ?? 0)] ?? null;
        if (!$item || $item['extra']) fail('bad_item');
        if (!$item['available']) fail('item_unavailable', 409);

        $qty = integer($line, 'qty', 1, MAX_QTY);
        $extraIds = is_array($line['extras'] ?? null) ? array_values(array_unique(array_map('intval', $line['extras']))) : [];
        if (count($extraIds) > MAX_EXTRAS) fail('bad_request');

        $unit = (int)$item['price'];
        $extras = [];
        foreach ($extraIds as $eid) {
            $extra = $items[$eid] ?? null;
            if (!$extra || !$extra['extra']) fail('bad_item');
            if (!$extra['available']) fail('item_unavailable', 409);
            $extras[] = [$extra['name_en'], $extra['name_fa']];
            $unit += (int)$extra['price'];
        }

        $prepared[] = [
            'item_id' => (int)$item['id'],
            'name_en' => $item['name_en'],
            'name_fa' => $item['name_fa'],
            'qty' => $qty,
            'unit_price' => $unit,
            'extras' => json_encode($extras, JSON_UNESCAPED_UNICODE),
            'note' => text($line, 'note', 120),
            'line_total' => $unit * $qty,
        ];
        $subtotal += $unit * $qty;
        $drinks += $qty;
        $cheapest = min($cheapest ?? PHP_INT_MAX, (int)$item['price']);
    }

    // Club reward: the cheapest drink (without extras) is free
    $member = current_member();
    $rewardStamps = 0;
    $discount = 0;
    if (!empty($in['useReward'])) {
        $perReward = (int)setting('stamps_per_reward');
        if (!$member) fail('login_required', 401);
        if ((int)$member['stamps'] < $perReward) fail('not_enough_stamps', 409);
        $rewardStamps = $perReward;
        $discount = (int)$cheapest;
    }

    $now = time();
    $token = bin2hex(random_bytes(12));

    $pdo->beginTransaction();
    $count = $pdo->prepare('SELECT COUNT(*) FROM orders WHERE created_at >= ?');
    $count->execute([strtotime('today')]);
    $number = (int)$count->fetchColumn() + 1;

    $pdo->prepare('INSERT INTO orders (number, token, member_id, type, table_no, note, status, subtotal, discount, total,
                                       drinks, reward_stamps, lang, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, \'new\', ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$number, $token, $member['id'] ?? null, $type, $table, $note, $subtotal, $discount,
                   max(0, $subtotal - $discount), $drinks, $rewardStamps, $lang, $now, $now]);
    $orderId = (int)$pdo->lastInsertId();

    $insertLine = $pdo->prepare('INSERT INTO order_lines (order_id, item_id, name_en, name_fa, qty, unit_price, extras, note, line_total)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    foreach ($prepared as $l) {
        $insertLine->execute([$orderId, $l['item_id'], $l['name_en'], $l['name_fa'], $l['qty'], $l['unit_price'],
                              $l['extras'], $l['note'], $l['line_total']]);
    }

    if ($rewardStamps) {
        $spend = $pdo->prepare('UPDATE members SET stamps = stamps - ? WHERE id = ? AND stamps >= ?');
        $spend->execute([$rewardStamps, $member['id'], $rewardStamps]);
        if ($spend->rowCount() !== 1) {
            $pdo->rollBack();
            fail('not_enough_stamps', 409);
        }
    }
    $pdo->commit();

    return ['order' => order_view(find_order($orderId)) + ['token' => $token]];
}

/** Status of orders this browser placed. Each needs its secret token. */
function track_orders(array $in): array
{
    $refs = $in['orders'] ?? [];
    if (!is_array($refs)) fail('bad_request');

    $out = [];
    foreach (array_slice($refs, 0, 10) as $ref) {
        if (!is_array($ref)) continue;
        $order = find_order((int)($ref['id'] ?? 0));
        if ($order && hash_equals($order['token'], (string)($ref['token'] ?? ''))) $out[] = order_view($order);
    }
    return ['orders' => $out];
}

function find_order(int $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM orders WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch() ?: null;
}

function order_view(array $o, bool $forAdmin = false): array
{
    $stmt = db()->prepare('SELECT * FROM order_lines WHERE order_id = ? ORDER BY id');
    $stmt->execute([$o['id']]);

    $view = [
        'id' => (int)$o['id'],
        'number' => (int)$o['number'],
        'status' => $o['status'],
        'type' => $o['type'],
        'table' => $o['table_no'],
        'note' => $o['note'],
        'subtotal' => (int)$o['subtotal'],
        'discount' => (int)$o['discount'],
        'total' => (int)$o['total'],
        'drinks' => (int)$o['drinks'],
        'createdAt' => (int)$o['created_at'],
        'updatedAt' => (int)$o['updated_at'],
        'lines' => array_map(fn(array $l) => [
            'names' => [$l['name_en'], $l['name_fa']],
            'qty' => (int)$l['qty'],
            'unitPrice' => (int)$l['unit_price'],
            'extras' => json_decode($l['extras'], true) ?: [],
            'note' => $l['note'],
            'lineTotal' => (int)$l['line_total'],
        ], $stmt->fetchAll()),
    ];

    if ($forAdmin) {
        $view['rewardUsed'] = (int)$o['reward_stamps'] > 0;
        $view['lang'] = $o['lang'];
        $view['member'] = null;
        if ($o['member_id']) {
            $m = find_member((int)$o['member_id']);
            if ($m) $view['member'] = ['name' => $m['name'], 'phone' => $m['phone']];
        }
    }
    return $view;
}

/** Admin board: everything still open, plus today's finished orders and totals. */
function admin_orders(): array
{
    $today = strtotime('today');
    $stmt = db()->prepare("SELECT * FROM orders
                           WHERE status IN ('new', 'preparing', 'ready') OR created_at >= ?
                           ORDER BY created_at DESC LIMIT 300");
    $stmt->execute([$today]);
    $orders = array_map(fn(array $o) => order_view($o, true), $stmt->fetchAll());

    $stats = db()->prepare("SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue, COALESCE(SUM(drinks), 0) AS drinks
                            FROM orders WHERE created_at >= ? AND status != 'cancelled'");
    $stats->execute([$today]);

    return ['orders' => $orders, 'stats' => array_map('intval', $stats->fetch()), 'now' => time()];
}

/** Moves an order along. Finishing credits club stamps; cancelling refunds a used reward. */
function set_order_status(array $in): array
{
    $id = integer($in, 'id', 1, PHP_INT_MAX);
    $status = $in['status'] ?? '';
    if (!in_array($status, ORDER_STATUSES, true)) fail('bad_status');

    $pdo = db();
    $pdo->beginTransaction();
    $order = find_order($id) ?? fail('not_found', 404);
    if (in_array($order['status'], FINAL_STATUSES, true)) fail('order_closed', 409);

    $earned = 0;
    if ($order['member_id']) {
        if ($status === 'done') {
            $earned = (int)$order['drinks'];
            $pdo->prepare('UPDATE members SET stamps = stamps + ?, total_drinks = total_drinks + ? WHERE id = ?')
                ->execute([$earned, $earned, $order['member_id']]);
        } elseif ($status === 'cancelled' && (int)$order['reward_stamps'] > 0) {
            $pdo->prepare('UPDATE members SET stamps = stamps + ? WHERE id = ?')
                ->execute([$order['reward_stamps'], $order['member_id']]);
        }
    }

    $pdo->prepare('UPDATE orders SET status = ?, stamps_earned = ?, updated_at = ? WHERE id = ?')
        ->execute([$status, $earned, time(), $id]);
    $pdo->commit();

    return ['order' => order_view(find_order($id), true)];
}
