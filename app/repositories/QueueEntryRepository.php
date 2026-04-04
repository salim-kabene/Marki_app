<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Repository des entrées de la liste du jour
|--------------------------------------------------------------------------
| Ce fichier gère les requêtes SQL liées aux patients inscrits
| dans une queue (liste du jour).
|
| Son rôle :
| - récupérer toutes les entrées d’une liste
| - compter les entrées par statut
| - créer une nouvelle entrée patient dans la liste
|--------------------------------------------------------------------------
*/

require_once __DIR__ . '/../db.php';

class QueueEntryRepository
{
    private PDO $pdo;

    public function __construct()
    {
        $this->pdo = db();
    }

    /*
    |--------------------------------------------------------------------------
    | Récupérer toutes les entrées d’une queue
    |--------------------------------------------------------------------------
    */
    public function findByQueueId(int $queueId): array
    {
        $sql = "
            SELECT
                qe.id,
                qe.queue_id,
                qe.clinic_id,
                qe.patient_id,
                qe.display_name,
                qe.phone,
                qe.birth_date,
                qe.source,
                qe.status,
                qe.position_number,
                qe.created_at,
                qe.called_at,
                qe.done_at,
                qe.canceled_at,
                qe.no_show_at,
                qe.created_by_user_id,
                qe.updated_by_user_id
            FROM queue_entries qe
            WHERE qe.queue_id = :queue_id
            ORDER BY
                CASE
                    WHEN qe.position_number IS NULL THEN 1
                    ELSE 0
                END,
                qe.position_number ASC,
                qe.created_at ASC
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':queue_id' => $queueId,
        ]);

        $rows = $stmt->fetchAll();

        $entries = [];

        foreach ($rows as $index => $row) {
            $entries[] = [
                'id' => (int) $row['id'],
                'queue_id' => (int) $row['queue_id'],
                'patient_id' => $row['patient_id'] !== null ? (int) $row['patient_id'] : null,

                'number' => $row['position_number'] !== null
                    ? (int) $row['position_number']
                    : ($index + 1),

                'display_name' => $row['display_name'],
                'phone' => $row['phone'],
                'birth_date' => $row['birth_date'],
                'source' => $row['source'],
                'status' => $row['status'],

                'time' => date('H:i', strtotime($row['created_at'])),

                'created_at' => $row['created_at'],
                'called_at' => $row['called_at'],
                'done_at' => $row['done_at'],
                'canceled_at' => $row['canceled_at'],
                'no_show_at' => $row['no_show_at'],
            ];
        }

        return $entries;
    }

    /*
    |--------------------------------------------------------------------------
    | Compter les entrées par statut
    |--------------------------------------------------------------------------
    */
    public function countByStatus(int $queueId): array
    {
        $sql = "
            SELECT
                qe.status,
                COUNT(*) AS total
            FROM queue_entries qe
            WHERE qe.queue_id = :queue_id
            GROUP BY qe.status
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':queue_id' => $queueId,
        ]);

        $rows = $stmt->fetchAll();

        $counts = [
            'waiting' => 0,
            'absent' => 0,
            'done' => 0,
        ];

        foreach ($rows as $row) {
            $status = $row['status'];
            $total = (int) $row['total'];

            if ($status === 'waiting') {
                $counts['waiting'] = $total;
            }

            if ($status === 'no_show') {
                $counts['absent'] = $total;
            }

            if ($status === 'done') {
                $counts['done'] = $total;
            }
        }

        return $counts;
    }

    public function findById(int $entryId, int $clinicId): ?array
{
    $sql = "
        SELECT
            qe.id,
            qe.queue_id,
            qe.clinic_id,
            qe.patient_id,
            qe.display_name,
            qe.phone,
            qe.birth_date,
            qe.source,
            qe.status,
            qe.position_number,
            qe.created_at,
            qe.called_at,
            qe.done_at,
            qe.canceled_at,
            qe.no_show_at,
            qe.created_by_user_id,
            qe.updated_by_user_id
        FROM queue_entries qe
        WHERE qe.id = :id
          AND qe.clinic_id = :clinic_id
        LIMIT 1
    ";

    $stmt = $this->pdo->prepare($sql);
    $stmt->execute([
        ':id' => $entryId,
        ':clinic_id' => $clinicId,
    ]);

    $row = $stmt->fetch();

    if (!$row) {
        return null;
    }

    return [
        'id' => (int) $row['id'],
        'queue_id' => (int) $row['queue_id'],
        'clinic_id' => (int) $row['clinic_id'],
        'patient_id' => $row['patient_id'] !== null ? (int) $row['patient_id'] : null,
        'number' => $row['position_number'] !== null ? (int) $row['position_number'] : null,
        'display_name' => $row['display_name'],
        'phone' => $row['phone'],
        'birth_date' => $row['birth_date'],
        'source' => $row['source'],
        'status' => $row['status'],
        'time' => date('H:i', strtotime($row['created_at'])),
        'created_at' => $row['created_at'],
        'called_at' => $row['called_at'],
        'done_at' => $row['done_at'],
        'canceled_at' => $row['canceled_at'],
        'no_show_at' => $row['no_show_at'],
    ];
}

public function updateStatus(
    int $entryId,
    int $clinicId,
    string $newStatus,
    int $updatedByUserId
): array {
    $allowedStatuses = ['waiting', 'done', 'no_show'];

    if (!in_array($newStatus, $allowedStatuses, true)) {
        throw new InvalidArgumentException('Statut invalide.');
    }

    $existingEntry = $this->findById($entryId, $clinicId);

    if (!$existingEntry) {
        throw new RuntimeException('Entrée introuvable.');
    }

    $doneAt = null;
    $noShowAt = null;

    if ($newStatus === 'done') {
        $doneAt = date('Y-m-d H:i:s');
    }

    if ($newStatus === 'no_show') {
        $noShowAt = date('Y-m-d H:i:s');
    }

    if ($newStatus === 'waiting') {
        $doneAt = null;
        $noShowAt = null;
    }

    $sql = "
        UPDATE queue_entries
        SET
            status = :status,
            done_at = :done_at,
            no_show_at = :no_show_at,
            updated_by_user_id = :updated_by_user_id
        WHERE id = :id
          AND clinic_id = :clinic_id
        LIMIT 1
    ";

    $stmt = $this->pdo->prepare($sql);
    $stmt->execute([
        ':status' => $newStatus,
        ':done_at' => $doneAt,
        ':no_show_at' => $noShowAt,
        ':updated_by_user_id' => $updatedByUserId,
        ':id' => $entryId,
        ':clinic_id' => $clinicId,
    ]);

    $updatedEntry = $this->findById($entryId, $clinicId);

    if (!$updatedEntry) {
        throw new RuntimeException('Impossible de récupérer l’entrée après mise à jour.');
    }

    return $updatedEntry;
}
    /*
    |--------------------------------------------------------------------------
    | Récupérer la prochaine position dans la queue
    |--------------------------------------------------------------------------
    */
    private function getNextPositionNumber(int $queueId): int
    {
        $sql = "
            SELECT COALESCE(MAX(qe.position_number), 0) + 1 AS next_position
            FROM queue_entries qe
            WHERE qe.queue_id = :queue_id
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':queue_id' => $queueId,
        ]);

        $row = $stmt->fetch();

        return (int) ($row['next_position'] ?? 1);
    }
    public function findWaitingByQueueAndPatientId(int $queueId, int $patientId): ?array
    {
        $sql = "
            SELECT
                qe.id,
                qe.queue_id,
                qe.clinic_id,
                qe.patient_id,
                qe.display_name,
                qe.phone,
                qe.birth_date,
                qe.source,
                qe.status,
                qe.position_number,
                qe.created_at,
                qe.called_at,
                qe.done_at,
                qe.canceled_at,
                qe.no_show_at
            FROM queue_entries qe
            WHERE qe.queue_id = :queue_id
            AND qe.patient_id = :patient_id
            AND qe.status = 'waiting'
            LIMIT 1
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':queue_id' => $queueId,
            ':patient_id' => $patientId,
        ]);

        $row = $stmt->fetch();

        if (!$row) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'queue_id' => (int) $row['queue_id'],
            'patient_id' => $row['patient_id'] !== null ? (int) $row['patient_id'] : null,
            'number' => $row['position_number'] !== null ? (int) $row['position_number'] : null,
            'display_name' => $row['display_name'],
            'phone' => $row['phone'],
            'birth_date' => $row['birth_date'],
            'source' => $row['source'],
            'status' => $row['status'],
            'time' => date('H:i', strtotime($row['created_at'])),
            'created_at' => $row['created_at'],
            'called_at' => $row['called_at'],
            'done_at' => $row['done_at'],
            'canceled_at' => $row['canceled_at'],
            'no_show_at' => $row['no_show_at'],
        ];
    }
    /*
    |--------------------------------------------------------------------------
    | Créer une nouvelle entrée patient dans la liste du jour
    |--------------------------------------------------------------------------
    | Données attendues :
    | - queue_id
    | - clinic_id
    | - patient_id nullable
    | - display_name
    | - phone nullable
    | - birth_date nullable
    | - source
    | - created_by_user_id
    |--------------------------------------------------------------------------
    */
    public function create(
        int $queueId,
        int $clinicId,
        ?int $patientId,
        string $displayName,
        ?string $phone,
        ?string $birthDate,
        string $source,
        int $createdByUserId
    ): array {
        $displayName = trim($displayName);
        $phone = $phone !== null ? trim($phone) : null;
        $birthDate = $birthDate !== null ? trim($birthDate) : null;
        $source = trim($source);

        if ($displayName === '') {
            throw new InvalidArgumentException('Le nom complet est obligatoire.');
        }

        if ($source === '') {
            $source = 'manual';
        }

        $positionNumber = $this->getNextPositionNumber($queueId);

        $sql = "
            INSERT INTO queue_entries (
                queue_id,
                clinic_id,
                patient_id,
                display_name,
                phone,
                birth_date,
                source,
                status,
                position_number,
                created_by_user_id,
                updated_by_user_id,
                created_at
            ) VALUES (
                :queue_id,
                :clinic_id,
                :patient_id,
                :display_name,
                :phone,
                :birth_date,
                :source,
                'waiting',
                :position_number,
                :created_by_user_id,
                :updated_by_user_id,
                NOW()
            )
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':queue_id' => $queueId,
            ':clinic_id' => $clinicId,
            ':patient_id' => $patientId,
            ':display_name' => $displayName,
            ':phone' => $phone !== '' ? $phone : null,
            ':birth_date' => $birthDate !== '' ? $birthDate : null,
            ':source' => $source,
            ':position_number' => $positionNumber,
            ':created_by_user_id' => $createdByUserId,
            ':updated_by_user_id' => $createdByUserId,
        ]);

        $entryId = (int) $this->pdo->lastInsertId();

        $selectSql = "
            SELECT
                qe.id,
                qe.queue_id,
                qe.clinic_id,
                qe.patient_id,
                qe.display_name,
                qe.phone,
                qe.birth_date,
                qe.source,
                qe.status,
                qe.position_number,
                qe.created_at,
                qe.called_at,
                qe.done_at,
                qe.canceled_at,
                qe.no_show_at,
                qe.created_by_user_id,
                qe.updated_by_user_id
            FROM queue_entries qe
            WHERE qe.id = :id
            LIMIT 1
        ";

        $selectStmt = $this->pdo->prepare($selectSql);
        $selectStmt->execute([
            ':id' => $entryId,
        ]);

        $row = $selectStmt->fetch();

        if (!$row) {
            throw new RuntimeException('Impossible de récupérer le patient après insertion.');
        }

        return [
            'id' => (int) $row['id'],
            'queue_id' => (int) $row['queue_id'],
            'patient_id' => $row['patient_id'] !== null ? (int) $row['patient_id'] : null,
            'number' => $row['position_number'] !== null ? (int) $row['position_number'] : null,
            'display_name' => $row['display_name'],
            'phone' => $row['phone'],
            'birth_date' => $row['birth_date'],
            'source' => $row['source'],
            'status' => $row['status'],
            'time' => date('H:i', strtotime($row['created_at'])),
            'created_at' => $row['created_at'],
            'called_at' => $row['called_at'],
            'done_at' => $row['done_at'],
            'canceled_at' => $row['canceled_at'],
            'no_show_at' => $row['no_show_at'],
        ];
    }
}