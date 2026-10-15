<?php
/* Menu as the customer page and admin panel see it */
declare(strict_types=1);

function menu_payload(): array
{
    $pdo = db();
    $cats = $pdo->query('SELECT * FROM categories ORDER BY sort, id')->fetchAll();
    $items = $pdo->query('SELECT * FROM items ORDER BY sort, id')->fetchAll();

    $byCat = [];
    foreach ($items as $it) $byCat[$it['category_id']][] = item_view($it);

    return [
        'categories' => array_map(fn(array $c) => [
            'id' => $c['id'],
            'name' => [$c['name_en'], $c['name_fa']],
            'blurb' => [$c['blurb_en'], $c['blurb_fa']],
            'color' => $c['color'],
            'temp' => $c['temp'],
            'extra' => (bool)$c['extra'],
            'keys' => $c['keywords'],
            'items' => $byCat[$c['id']] ?? [],
        ], $cats),
        'settings' => public_settings(),
    ];
}

/** key = database id (used for ordering); id = stable code (used for saved drinks) */
function item_view(array $it): array
{
    return [
        'key' => (int)$it['id'],
        'id' => $it['code'],
        'names' => [$it['name_en'], $it['name_fa']],
        'price' => (int)$it['price'],
        'temp' => $it['temp'],
        'available' => (bool)$it['available'],
    ];
}

function public_settings(): array
{
    return [
        'orderingOpen' => setting('ordering_open') === '1',
        'currency' => [setting('currency_en'), setting('currency_fa')],
        'stampsPerReward' => (int)setting('stamps_per_reward'),
        'defaultLang' => setting('default_lang'),
    ];
}
