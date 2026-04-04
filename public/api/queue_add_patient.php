<?php

declare(strict_types=1);

ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');

$config = require __DIR__ . '/../../app/config.php';

require_once __DIR__ . '/../../app/repositories/QueueRepository.php';
require_once __DIR__ . '/../../app/repositories/QueueEntryRepository.php';
require_once __DIR__ . '/../../app/repositories/PatientRepository.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);

    echo json_encode([
        'ok' => false,
        'message' => 'Méthode non autorisée. Utilisez POST.',
    ], JSON_UNESCAPED_UNICODE);

    exit;
}

try {
    $clinicId = (int) $config['dev_context']['clinic_id'];
    $doctorId = (int) $config['dev_context']['doctor_id'];
    $userId   = (int) $config['dev_context']['user_id'];

    $today = date('Y-m-d');

    $rawInput = file_get_contents('php://input');
    $jsonInput = json_decode($rawInput, true);

    $input = is_array($jsonInput) && !empty($jsonInput)
        ? $jsonInput
        : $_POST;

    $fullName = trim((string) ($input['full_name'] ?? $input['display_name'] ?? ''));
    $phone = isset($input['phone']) ? trim((string) $input['phone']) : null;
    $birthDate = isset($input['birth_date']) ? trim((string) $input['birth_date']) : null;
    $source = isset($input['source']) ? trim((string) $input['source']) : 'secretary';

    if ($fullName === '') {
        http_response_code(422);

        echo json_encode([
            'ok' => false,
            'message' => 'Le nom complet est obligatoire.',
            'errors' => [
                'full_name' => 'Le nom complet est obligatoire.',
            ],
        ], JSON_UNESCAPED_UNICODE);

        exit;
    }

    if ($birthDate !== null && $birthDate !== '') {
        $date = DateTime::createFromFormat('Y-m-d', $birthDate);
        $isValidBirthDate = $date && $date->format('Y-m-d') === $birthDate;

        if (!$isValidBirthDate) {
            http_response_code(422);

            echo json_encode([
                'ok' => false,
                'message' => 'La date de naissance est invalide. Format attendu : YYYY-MM-DD.',
                'errors' => [
                    'birth_date' => 'Format attendu : YYYY-MM-DD.',
                ],
            ], JSON_UNESCAPED_UNICODE);

            exit;
        }
    } else {
        $birthDate = null;
    }

    $patientRepository = new PatientRepository();

    $existingPatient = $patientRepository->findExisting(
        $clinicId,
        $phone,
        $fullName,
        $birthDate
    );

    $patient = $existingPatient ?: $patientRepository->create(
        $clinicId,
        $fullName,
        $phone,
        $birthDate
    );

    $queueRepository = new QueueRepository();
    $queue = $queueRepository->getOrCreateTodayQueue(
        $clinicId,
        $doctorId,
        $userId,
        $today
    );

    /*
|--------------------------------------------------------------------------
| Règle métier V1 : impossible d'ajouter un patient si la liste est fermée
|--------------------------------------------------------------------------
| Pourquoi cette vérification côté backend ?
| - sécurité métier réelle
| - empêche les appels API forcés
| - garde le système cohérent même si le front change plus tard
|--------------------------------------------------------------------------
*/
if (($queue['status'] ?? '') !== 'open') {
    http_response_code(409);

    echo json_encode([
        'ok' => false,
        'message' => 'La liste du jour est fermée. Impossible d’ajouter un nouveau patient.',
        'data' => [
            'queue' => $queue,
        ],
    ], JSON_UNESCAPED_UNICODE);

    exit;
}
   $queueEntryRepository = new QueueEntryRepository();

$existingWaitingEntry = $queueEntryRepository->findWaitingByQueueAndPatientId(
    (int) $queue['id'],
    (int) $patient['id']
);

if ($existingWaitingEntry !== null) {
    http_response_code(409);

    echo json_encode([
        'ok' => false,
        'message' => 'Ce patient est déjà présent dans la liste du jour.',
        'data' => [
            'patient' => $patient,
            'queue' => $queue,
            'existing_entry' => $existingWaitingEntry,
            'patient_was_created' => $existingPatient ? false : true,
        ],
    ], JSON_UNESCAPED_UNICODE);

    exit;
}

$createdEntry = $queueEntryRepository->create(
    (int) $queue['id'],
    $clinicId,
    (int) $patient['id'],
    $patient['full_name'],
    $patient['phone'] ?? null,
    $patient['birth_date'] ?? null,
    $source !== '' ? $source : 'secretary',
    $userId
);

echo json_encode([
    'ok' => true,
    'message' => 'Patient ajouté à la liste du jour avec succès.',
    'data' => [
        'patient' => $patient,
        'queue' => $queue,
        'entry' => $createdEntry,
        'patient_was_created' => $existingPatient ? false : true,
    ],
], JSON_UNESCAPED_UNICODE);

} catch (InvalidArgumentException $e) {
    http_response_code(422);

    echo json_encode([
        'ok' => false,
        'message' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);

    echo json_encode([
        'ok' => false,
        'message' => 'Impossible d’ajouter le patient à la liste du jour.',
        'error' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}

