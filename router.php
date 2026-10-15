<?php
/* Router for PHP's built-in server (used by start.bat).
   Keeps the database, sessions and server code private. */
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

return false; // serve the file as-is
