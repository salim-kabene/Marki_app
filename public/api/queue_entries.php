<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| API : queue_entries.php
|--------------------------------------------------------------------------
| Rôle :
| - récupérer la liste du jour
| - récupérer ses entrées (patients du jour)
| - récupérer les compteurs
| - retourner tout ça en JSON
|--------------------------------------------------------------------------
*/

ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');

$config = require __DIR__ . '/../../app/config.php';

require_once __DIR__ . '/../../app/repositories/QueueRepository.php';
require_once __DIR__ . '/../../app/repositories/QueueEntryRepository.php';

try {
    /*
    |--------------------------------------------------------------------------
    | Contexte de développement temporaire
    |--------------------------------------------------------------------------
    */
    $clinicId = (int) $config['dev_context']['clinic_id'];
    $doctorId = (int) $config['dev_context']['doctor_id'];
    $userId   = (int) $config['dev_context']['user_id'];

    /*
    |--------------------------------------------------------------------------
    | Date du jour
    |--------------------------------------------------------------------------
    */
    $today = date('Y-m-d');

    /*
    |--------------------------------------------------------------------------
    | Récupérer ou créer la queue du jour
    |--------------------------------------------------------------------------
    */
    $queueRepository = new QueueRepository();
    $queue = $queueRepository->getOrCreateTodayQueue(
        $clinicId,
        $doctorId,
        $userId,
        $today
    );

    /*
    |--------------------------------------------------------------------------
    | Récupérer les entrées de la queue
    |--------------------------------------------------------------------------
    */
    $queueEntryRepository = new QueueEntryRepository();
    $entries = $queueEntryRepository->findByQueueId((int) $queue['id']);

    /*
    |--------------------------------------------------------------------------
    | Récupérer les compteurs
    |--------------------------------------------------------------------------
    */
    $counts = $queueEntryRepository->countByStatus((int) $queue['id']);

    /*
    |--------------------------------------------------------------------------
    | Retour JSON final
    |--------------------------------------------------------------------------
    */
    echo json_encode([
        'ok' => true,
        'message' => 'Entrées de la liste du jour récupérées avec succès.',
        'data' => [
            'queue' => $queue,
            'entries' => $entries,
            'counts' => $counts,
        ],
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);

    echo json_encode([
        'ok' => false,
        'message' => 'Impossible de récupérer les entrées de la liste du jour.',
        'error' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}