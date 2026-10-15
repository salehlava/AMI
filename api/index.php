<?php
/* =============================================================
   AMI café API — every request is api/index.php?r=<route>
   ============================================================= */
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

$route = (string)($_GET['r'] ?? '');
$method = $_SERVER['REQUEST_METHOD'];

$public = [
    'GET menu' => fn() => menu_payload(),
    'POST order' => fn() => place_order(body()),
    'POST track' => fn() => track_orders(body()),

    'GET club-me' => fn() => club_me(),
    'POST club-join' => fn() => club_join(body()),
    'POST club-login' => fn() => club_login(body()),
    'POST club-logout' => fn() => club_logout(),

    'GET admin-me' => fn() => admin_me(),
    'POST admin-login' => fn() => admin_login(body()),
    'POST admin-logout' => fn() => admin_logout(),
];

$admin = [
    'GET admin-orders' => fn() => admin_orders(),
    'POST admin-order-status' => fn() => set_order_status(body()),
    'POST admin-item-save' => fn() => admin_item_save(body()),
    'POST admin-item-delete' => fn() => admin_item_delete(body()),
    'GET admin-members' => fn() => admin_members(),
    'POST admin-member-stamps' => fn() => admin_member_stamps(body()),
    'GET admin-settings' => fn() => admin_settings(),
    'POST admin-settings' => fn() => admin_settings_save(body()),
    'POST admin-password' => fn() => admin_password(body()),
];

$key = "$method $route";

try {
    if (isset($public[$key])) respond($public[$key]());
    if (isset($admin[$key])) {
        require_admin();
        respond($admin[$key]());
    }
    fail('not_found', 404);
} catch (Throwable $e) {
    error_log((string)$e);
    try {
        if (db()->inTransaction()) db()->rollBack();
    } catch (Throwable) {
    }
    fail('server_error', 500);
}
