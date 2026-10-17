<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

try {
    $context = require __DIR__ . '/../../app/bootstrap.php';
    require_once __DIR__ . '/../../app/repositories/PatientDirectoryRepository.php';

    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        http_response_code(405);
        echo json_encode([
            'ok' => false,
            'message' => 'Méthode non autorisée.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $repository = new PatientDirectoryRepository();
    $result = $repository->paginateForDoctor(
        (int) $context['clinic_id'],
        (int) $context['doctor_id'],
        trim((string) ($_GET['q'] ?? '')),
        max(1, (int) ($_GET['page'] ?? 1)),
        (int) ($_GET['per_page'] ?? 15),
        ($_GET['sort'] ?? '') === 'name' ? 'name' : 'recent'
    );

    echo json_encode([
        'ok' => true,
        'data' => $result,
    ], JSON_UNESCAPED_UNICODE);
} catch (InvalidArgumentException $exception) {
    http_response_code(422);
    echo json_encode([
        'ok' => false,
        'message' => $exception->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'message' => 'Impossible de charger les patients.',
    ], JSON_UNESCAPED_UNICODE);
}
