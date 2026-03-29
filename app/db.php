<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Connexion PDO centralisée
|--------------------------------------------------------------------------
| Ce fichier :
| - lit la configuration depuis app/config.php
| - crée une connexion PDO vers MySQL
| - applique les bons réglages PDO
| - retourne toujours la même connexion si on le rappelle
|
| But :
| éviter de réécrire la connexion partout dans le projet.
|--------------------------------------------------------------------------
*/

function db(): PDO
{
    /*
    |--------------------------------------------------------------------------
    | Connexion "statique"
    |--------------------------------------------------------------------------
    | On garde l’objet PDO en mémoire pendant l’exécution du script.
    | Si db() est appelée plusieurs fois, on ne recrée pas 10 connexions.
    |--------------------------------------------------------------------------
    */
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    /*
    |--------------------------------------------------------------------------
    | Charger la configuration
    |--------------------------------------------------------------------------
    */
    $config = require __DIR__ . '/config.php';
    $db = $config['db'];
    date_default_timezone_set($config['app']['timezone']);
    /*
    |--------------------------------------------------------------------------
    | Construire le DSN PDO
    |--------------------------------------------------------------------------
    | Exemple :
    | mysql:host=127.0.0.1;port=3307;dbname=marki_dev;charset=utf8mb4
    |--------------------------------------------------------------------------
    */
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $db['host'],
        $db['port'],
        $db['dbname'],
        $db['charset']
    );

    /*
    |--------------------------------------------------------------------------
    | Options PDO
    |--------------------------------------------------------------------------
    | ATTR_ERRMODE => EXCEPTION
    |   Pour avoir de vraies erreurs claires si quelque chose casse.
    |
    | ATTR_DEFAULT_FETCH_MODE => FETCH_ASSOC
    |   Pour récupérer les résultats sous forme de tableau associatif.
    |
    | ATTR_EMULATE_PREPARES => false
    |   Pour utiliser les vraies requêtes préparées MySQL.
    |--------------------------------------------------------------------------
    */
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    try {
        $pdo = new PDO(
            $dsn,
            $db['username'],
            $db['password'],
            $options
        );

        return $pdo;
    } catch (PDOException $e) {
        /*
        |--------------------------------------------------------------------------
        | En dev, on affiche l’erreur
        | Plus tard en prod, on masquera le détail technique.
        |--------------------------------------------------------------------------
        */
        http_response_code(500);

        header('Content-Type: application/json; charset=utf-8');

        echo json_encode([
            'ok' => false,
            'message' => 'Erreur de connexion à la base de données.',
            'error' => $e->getMessage(),
        ], JSON_UNESCAPED_UNICODE);

        exit;
    }
}