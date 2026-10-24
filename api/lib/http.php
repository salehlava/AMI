<?php
/* Request and response helpers */
declare(strict_types=1);

function respond(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Stops with an error code the front end translates (see js/strings.js → errors). */
function fail(string $error, int $status = 400): never
{
    respond(['error' => $error], $status);
}

/** JSON body of a POST. Requiring the JSON content type blocks cross-site form posts. */
function body(): array
{
    if (!str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) fail('bad_request', 415);
    $data = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($data)) fail('bad_request');
    return $data;
}

/** Persian and Arabic digits → 0-9 */
function latin_digits(string $s): string
{
    static $map = null;
    if ($map === null) {
        $map = [];
        foreach (['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as $i => $d) $map[$d] = (string)$i;
        foreach (['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as $i => $d) $map[$d] = (string)$i;
    }
    return strtr($s, $map);
}

/** A trimmed single-line string from the input, at most $max characters. */
function text(array $in, string $key, int $max, bool $required = false): string
{
    $v = $in[$key] ?? '';
    if (is_int($v)) $v = (string)$v;
    if (!is_string($v)) fail('bad_request');
    $v = trim(preg_replace('/\s+/u', ' ', $v) ?? '');
    if ($required && $v === '') fail("missing_$key");
    if (iconv_strlen($v, 'UTF-8') > $max) fail("too_long_$key");
    return $v;
}

/** A whole number from the input, within [$min, $max]. */
function integer(array $in, string $key, int $min, int $max): int
{
    $v = $in[$key] ?? null;
    if (is_string($v)) $v = latin_digits(trim($v));
    if (is_string($v) && preg_match('/^-?\d+$/', $v)) $v = (int)$v;
    if (!is_int($v) || $v < $min || $v > $max) fail("bad_$key");
    return $v;
}

/** Normalizes a mobile number to digits only (Iranian numbers become 09…). */
function normalize_phone(string $raw): string
{
    $d = preg_replace('/\D+/', '', latin_digits($raw)) ?? '';
    if (str_starts_with($d, '0098')) $d = '0' . substr($d, 4);
    elseif (str_starts_with($d, '98') && strlen($d) === 12) $d = '0' . substr($d, 2);
    elseif (strlen($d) === 10 && $d[0] === '9') $d = '0' . $d;
    if (strlen($d) < 8 || strlen($d) > 15) fail('bad_phone');
    return $d;
}

function slugify(string $s): string
{
    $s = strtolower(strtr($s, [
        'ñ' => 'n', 'Ñ' => 'n', 'á' => 'a', 'à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e',
        'í' => 'i', 'ï' => 'i', 'ó' => 'o', 'ô' => 'o', 'ö' => 'o', 'ú' => 'u', 'ü' => 'u', 'ç' => 'c',
    ]));
    return trim(preg_replace('/[^a-z0-9]+/', '-', $s) ?? '', '-') ?: 'item';
}
