<?php

declare(strict_types=1);

/**
 * Ecrit une erreur technique dans storage/logs sans l'afficher au client.
 */
function markiLogThrowable(
    string $channel,
    Throwable $exception,
    array $context = []
): string {
    $errorId = bin2hex(random_bytes(6));
    $root = dirname(__DIR__);
    $directory = $root . '/storage/logs';

    if (!is_dir($directory)) {
        @mkdir($directory, 0775, true);
    }

    $payload = [
        'time' => date(DATE_ATOM),
        'error_id' => $errorId,
        'channel' => $channel,
        'message' => $exception->getMessage(),
        'type' => get_class($exception),
        'file' => $exception->getFile(),
        'line' => $exception->getLine(),
        'request_uri' => (string) ($_SERVER['REQUEST_URI'] ?? ''),
        'request_method' => (string) ($_SERVER['REQUEST_METHOD'] ?? ''),
        'session_id' => session_status() === PHP_SESSION_ACTIVE
            ? session_id()
            : '',
        'context' => $context,
        'trace' => $exception->getTraceAsString(),
    ];

    $line = json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    if (is_string($line)) {
        @file_put_contents(
            $directory . '/marki-api-' . date('Y-m-d') . '.log',
            $line . PHP_EOL,
            FILE_APPEND | LOCK_EX
        );
    }

    return $errorId;
}

/**
 * Retourne une erreur JSON coherente et conserve le detail dans les logs.
 */
function markiJsonException(
    string $channel,
    Throwable $exception,
    array $config,
    string $publicMessage,
    array $context = [],
    int $status = 500
): never {
    $errorId = markiLogThrowable($channel, $exception, $context);

    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-MARKI-Error-Id: ' . $errorId);

    $payload = [
        'ok' => false,
        'message' => $publicMessage,
        'error_id' => $errorId,
    ];

    if ((bool) ($config['app']['debug'] ?? false)) {
        $payload['error'] = $exception->getMessage();
    }

    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Formate une date en francais avec le mois ecrit en lettres (ex. 15 mars 2026).
 */
function markiFormatFrenchDate(?string $value): string
{
    if ($value === null || trim($value) === '') {
        return '-';
    }

    $timestamp = is_numeric($value) ? (int) $value : strtotime($value);
    if ($timestamp === false || $timestamp <= 0) {
        return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    }

    $months = [
        1 => 'janvier', 2 => 'février', 3 => 'mars', 4 => 'avril',
        5 => 'mai', 6 => 'juin', 7 => 'juillet', 8 => 'août',
        9 => 'septembre', 10 => 'octobre', 11 => 'novembre', 12 => 'décembre'
    ];

    $day = (int) date('j', $timestamp);
    $monthNum = (int) date('n', $timestamp);
    $year = date('Y', $timestamp);

    return sprintf('%d %s %s', $day, $months[$monthNum] ?? '', $year);
}

/**
 * Formate une date et heure en francais avec le mois en lettres (ex. 15 mars 2026 a 14:30).
 */
function markiFormatFrenchDateTime(?string $value): string
{
    if ($value === null || trim($value) === '') {
        return '-';
    }

    $timestamp = is_numeric($value) ? (int) $value : strtotime($value);
    if ($timestamp === false || $timestamp <= 0) {
        return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    }

    $months = [
        1 => 'janvier', 2 => 'février', 3 => 'mars', 4 => 'avril',
        5 => 'mai', 6 => 'juin', 7 => 'juillet', 8 => 'août',
        9 => 'septembre', 10 => 'octobre', 11 => 'novembre', 12 => 'décembre'
    ];

    $day = (int) date('j', $timestamp);
    $monthNum = (int) date('n', $timestamp);
    $year = date('Y', $timestamp);
    $time = date('H:i', $timestamp);

    return sprintf('%d %s %s à %s', $day, $months[$monthNum] ?? '', $year, $time);
}

