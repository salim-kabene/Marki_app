<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

function parseOptionalDate(?string $value): ?string
{
    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }

    $date = DateTimeImmutable::createFromFormat('Y-m-d', $value);
    if (!$date || $date->format('Y-m-d') !== $value) {
        throw new InvalidArgumentException('Date de filtre invalide.');
    }

    return $value;
}

try {
    $context = require __DIR__ . '/../../app/bootstrap.php';
    require_once __DIR__ . '/../../app/repositories/QueueHistoryRepository.php';

    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        http_response_code(405);
        echo json_encode([
            'ok' => false,
            'message' => 'Méthode non autorisée.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $dateFrom = parseOptionalDate($_GET['date_from'] ?? null);
    $dateTo = parseOptionalDate($_GET['date_to'] ?? null);

    if ($dateFrom === null && $dateTo === null) {
        $today = new DateTimeImmutable((string) $context['today']);
        $dateTo = $today->format('Y-m-d');
        $dateFrom = $today->modify('-29 days')->format('Y-m-d');
    }

    if ($dateFrom !== null && $dateTo !== null && $dateFrom > $dateTo) {
        throw new InvalidArgumentException(
            'La date de début doit précéder la date de fin.'
        );
    }

    // L'historique n'affiche jamais une journée passée encore « active ».
    require_once __DIR__ . '/../../app/repositories/QueueRepository.php';
    (new QueueRepository())->closeExpiredQueues(
        (int) $context['clinic_id'],
        (int) $context['doctor_id'],
        (new DateTimeImmutable((string) $context['today']))->format('Y-m-d')
    );

    $repository = new QueueHistoryRepository();
    $result = $repository->paginate(
        (int) $context['clinic_id'],
        (int) $context['doctor_id'],
        $dateFrom,
        $dateTo,
        trim((string) ($_GET['day_status'] ?? 'all')),
        max(1, (int) ($_GET['page'] ?? 1)),
        (int) ($_GET['per_page'] ?? 12)
    );

    $result['filters'] = [
        'date_from' => $dateFrom,
        'date_to' => $dateTo,
    ];

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
        'message' => 'Impossible de charger l’historique des listes.',
    ], JSON_UNESCAPED_UNICODE);
}
