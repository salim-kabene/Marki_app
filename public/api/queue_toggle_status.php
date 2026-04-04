<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| API : queue_toggle_status.php
|--------------------------------------------------------------------------
| Rôle :
| - récupérer le contexte dev
| - récupérer ou créer la queue du jour
| - basculer son statut open <-> closed
| - renvoyer le nouvel état au front
|--------------------------------------------------------------------------
|
| Pourquoi une API dédiée ?
| - logique claire
| - action métier isolée
| - plus simple à brancher sur le bouton du dashboard
|--------------------------------------------------------------------------
*/

ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

/*
|--------------------------------------------------------------------------
| Réponse JSON
|--------------------------------------------------------------------------
*/
header('Content-Type: application/json; charset=utf-8');

/*
|--------------------------------------------------------------------------
| Charger la configuration
|--------------------------------------------------------------------------
*/
$config = require __DIR__ . '/../../app/config.php';

/*
|--------------------------------------------------------------------------
| Charger le repository queue
|--------------------------------------------------------------------------
*/
require_once __DIR__ . '/../../app/repositories/QueueRepository.php';

/*
|--------------------------------------------------------------------------
| Sécurité simple : POST uniquement
|--------------------------------------------------------------------------
| On bloque le GET pour éviter qu’un simple accès URL déclenche l’action.
|--------------------------------------------------------------------------
*/
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);

    echo json_encode([
        'ok' => false,
        'message' => 'Méthode non autorisée. Utilisez POST.',
    ], JSON_UNESCAPED_UNICODE);

    exit;
}

try {
    /*
    |--------------------------------------------------------------------------
    | 1) Récupérer le contexte dev
    |--------------------------------------------------------------------------
    | Ces valeurs viennent de app/config.php
    */
    $clinicId = (int) $config['dev_context']['clinic_id'];
    $doctorId = (int) $config['dev_context']['doctor_id'];
    $userId   = (int) $config['dev_context']['user_id'];

    /*
    |--------------------------------------------------------------------------
    | 2) Déterminer la date du jour
    |--------------------------------------------------------------------------
    */
    $today = date('Y-m-d');

    /*
    |--------------------------------------------------------------------------
    | 3) Récupérer ou créer la queue du jour
    |--------------------------------------------------------------------------
    | Si la queue n’existe pas encore, elle sera créée automatiquement.
    */
    $queueRepository = new QueueRepository();

    $todayQueue = $queueRepository->getOrCreateTodayQueue(
        $clinicId,
        $doctorId,
        $userId,
        $today
    );

    /*
    |--------------------------------------------------------------------------
    | 4) Basculer le statut de la liste
    |--------------------------------------------------------------------------
    | - open   -> closed
    | - closed -> open
    */
    $updatedQueue = $queueRepository->toggleStatus(
        (int) $todayQueue['id'],
        $clinicId,
        $userId
    );

    /*
    |--------------------------------------------------------------------------
    | 5) Construire un message lisible pour le front
    |--------------------------------------------------------------------------
    */
    $message = $updatedQueue['status'] === 'open'
        ? 'La liste a été réouverte avec succès.'
        : 'La liste a été fermée avec succès.';

    /*
    |--------------------------------------------------------------------------
    | 6) Retour JSON
    |--------------------------------------------------------------------------
    */
    echo json_encode([
        'ok' => true,
        'message' => $message,
        'data' => [
            'queue' => $updatedQueue,
        ],
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    /*
    |--------------------------------------------------------------------------
    | Gestion d'erreur générique
    |--------------------------------------------------------------------------
    | En dev, on renvoie aussi le détail technique.
    */
    http_response_code(500);

    echo json_encode([
        'ok' => false,
        'message' => 'Impossible de modifier le statut de la liste.',
        'error' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}