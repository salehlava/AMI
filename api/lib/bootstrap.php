<?php
/* =============================================================
   AMI café — server setup. Loaded by api/index.php.
   ============================================================= */
declare(strict_types=1);

const DATA_DIR = __DIR__ . '/../../data';
const DB_FILE = DATA_DIR . '/ami.sqlite';
const SESSION_DIR = DATA_DIR . '/sessions';
const SEED_FILE = __DIR__ . '/../seed/menu.json';

// First-run admin password. Change it in Admin → Settings.
const DEFAULT_ADMIN_PASSWORD = 'ami1234';

// Decides when "today" starts for order numbers and daily stats
const TIMEZONE = 'Asia/Tehran';

const SESSION_DAYS = 90;

date_default_timezone_set(TIMEZONE);

require __DIR__ . '/http.php';
require __DIR__ . '/db.php';
require __DIR__ . '/menu.php';
require __DIR__ . '/orders.php';
require __DIR__ . '/club.php';
require __DIR__ . '/admin.php';

// Long-lived sessions stored with the app, so members stay logged in
if (!is_dir(SESSION_DIR)) mkdir(SESSION_DIR, 0775, true);
ini_set('session.save_path', SESSION_DIR);
ini_set('session.gc_maxlifetime', (string)(SESSION_DAYS * 86400));
ini_set('session.use_strict_mode', '1');
session_name('ami_session');
session_set_cookie_params([
    'lifetime' => SESSION_DAYS * 86400,
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();
