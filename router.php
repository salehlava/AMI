<?php
/* Router for PHP's built-in server (used by start.bat).
   Keeps the database, sessions and server code private, and tells browsers
   to always check for the newest page files so changes show up right away. */
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');

if (preg_match('#^/(data|api/lib|api/seed)(/|$)#i', $path)
    || preg_match('#\.(sqlite|sqlite-wal|sqlite-shm|bat|md)$#i', $path)
    || $path === '/router.php') {
    http_response_code(404);
    exit('Not found');
}

if ($path === '/admin' || $path === '/admin/') {
    header('Location: /admin.html');
    exit;
}

// Page files: serve them with "check for a newer version every time"
$types = [
    'html' => 'text/html; charset=utf-8',
    'js' => 'text/javascript; charset=utf-8',
    'css' => 'text/css; charset=utf-8',
    'json' => 'application/json; charset=utf-8',
];
$file = realpath(__DIR__ . ($path === '/' ? '/index.html' : $path));
$ext = strtolower(pathinfo($file ?: '', PATHINFO_EXTENSION));
if ($file && is_file($file) && str_starts_with($file, __DIR__) && isset($types[$ext])) {
    header('Content-Type: ' . $types[$ext]);
    header('Cache-Control: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY'); // no other site can show these pages in a frame
    header('Referrer-Policy: same-origin');
    readfile($file);
    return true;
}

return false; // everything else (API, images) as usual
