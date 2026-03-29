<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Endpoint de test de santé
|--------------------------------------------------------------------------
| But :
| vérifier rapidement que :
| - PHP fonctionne
| - le routing du dossier public fonctionne
| - la connexion PDO à MySQL fonctionne
|
| Si tout va bien, on retourne un JSON propre.
|--------------------------------------------------------------------------
*/

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../app/db.php';

try {
    $pdo = db();

    /*
    |--------------------------------------------------------------------------
    | Petite requête très simple
    |--------------------------------------------------------------------------
    | SELECT 1 permet juste de vérifier que la connexion DB répond.
    |--------------------------------------------------------------------------
    */
    $stmt = $pdo->query('SELECT 1 AS db_ok');
    $row = $stmt->fetch();

    echo json_encode([
        'ok' => true,
        'message' => 'Connexion PHP / PDO / MySQL OK',
        'data' => [
            'db_ok' => (int) ($row['db_ok'] ?? 0),
            'php_version' => PHP_VERSION,
            'timestamp' => date('Y-m-d H:i:s'),
        ],
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);

    echo json_encode([
        'ok' => false,
        'message' => 'Le test de santé a échoué.',
        'error' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}