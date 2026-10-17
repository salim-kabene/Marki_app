<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Repository de la liste du jour
|--------------------------------------------------------------------------
| Ce repository centralise la logique SQL de la table queues.
|
| Nouveau modèle métier :
| - registration_status : open | closed
| - day_status          : active | paused | completed
|
| La colonne legacy "status" est conservée temporairement pour ne pas
| casser les anciennes parties du projet pendant la transition.
|--------------------------------------------------------------------------
*/

require_once __DIR__ . '/../db.php';

class QueueRepository
{
    private PDO $pdo;

    public function __construct()
    {
        $this->pdo = db();
    }

    /*
    |--------------------------------------------------------------------------
    | Convertir une ligne SQL en tableau typé
    |--------------------------------------------------------------------------
    */
    private function mapQueueRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'clinic_id' => (int) $row['clinic_id'],
            'doctor_id' => (int) $row['doctor_id'],
            'queue_date' => $row['queue_date'],
            'registration_status' => $row['registration_status'],
            'day_status' => $row['day_status'],
            'registration_status_before_completion' =>
                $row['registration_status_before_completion'],
            'day_status_before_completion' =>
                $row['day_status_before_completion'],

            /*
            |----------------------------------------------------------------------
            | Champ legacy gardé temporairement pour compatibilité
            |----------------------------------------------------------------------
            */
            'status' => $row['status'],

            'opened_at' => $row['opened_at'],
            'closed_at' => $row['closed_at'],
            'paused_at' => $row['paused_at'],
            'resumed_at' => $row['resumed_at'],
            'completed_at' => $row['completed_at'],
            'opened_by_user_id' => $row['opened_by_user_id'] !== null
                ? (int) $row['opened_by_user_id']
                : null,
            'closed_by_user_id' => $row['closed_by_user_id'] !== null
                ? (int) $row['closed_by_user_id']
                : null,
            'paused_by_user_id' => $row['paused_by_user_id'] !== null
                ? (int) $row['paused_by_user_id']
                : null,
            'completed_by_user_id' => $row['completed_by_user_id'] !== null
                ? (int) $row['completed_by_user_id']
                : null,
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Fragment SELECT réutilisé par les méthodes de lecture
    |--------------------------------------------------------------------------
    */
    private function queueSelectColumns(): string
    {
        return "
            q.id,
            q.clinic_id,
            q.doctor_id,
            q.queue_date,
            q.registration_status,
            q.day_status,
            q.registration_status_before_completion,
            q.day_status_before_completion,
            q.status,
            q.opened_at,
            q.closed_at,
            q.paused_at,
            q.resumed_at,
            q.completed_at,
            q.opened_by_user_id,
            q.closed_by_user_id,
            q.paused_by_user_id,
            q.completed_by_user_id,
            q.created_at,
            q.updated_at
        ";
    }

    /*
    |--------------------------------------------------------------------------
    | Chercher la liste du jour d'un médecin
    |--------------------------------------------------------------------------
    */
    public function findTodayQueue(int $doctorId, string $queueDate): ?array
    {
        $sql = "
            SELECT {$this->queueSelectColumns()}
            FROM queues q
            WHERE q.doctor_id = :doctor_id
              AND q.queue_date = :queue_date
            LIMIT 1
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':doctor_id' => $doctorId,
            ':queue_date' => $queueDate,
        ]);

        $row = $stmt->fetch();

        return $row ? $this->mapQueueRow($row) : null;
    }

    /*
    |--------------------------------------------------------------------------
    | Créer la liste du jour
    |--------------------------------------------------------------------------
    | Une nouvelle liste démarre avec :
    | - inscriptions ouvertes
    | - journée active
    |--------------------------------------------------------------------------
    */
    public function createTodayQueue(
        int $clinicId,
        int $doctorId,
        int $openedByUserId,
        string $queueDate
    ): int {
        $sql = "
            INSERT INTO queues (
                clinic_id,
                doctor_id,
                queue_date,
                registration_status,
                day_status,
                status,
                opened_at,
                opened_by_user_id,
                created_at,
                updated_at
            ) VALUES (
                :clinic_id,
                :doctor_id,
                :queue_date,
                'open',
                'active',
                'open',
                NOW(),
                :opened_by_user_id,
                NOW(),
                NOW()
            )
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':clinic_id' => $clinicId,
            ':doctor_id' => $doctorId,
            ':queue_date' => $queueDate,
            ':opened_by_user_id' => $openedByUserId,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /*
    |--------------------------------------------------------------------------
    | Récupérer ou créer la liste du jour
    |--------------------------------------------------------------------------
    */
    /*
    |--------------------------------------------------------------------------
    | Clôturer automatiquement les journées passées
    |--------------------------------------------------------------------------
    | Une liste d'un jour passé ne peut plus être active ni en pause.
    | Elle est clôturée comme une fin de journée : les patients encore
    | en attente sont annulés (motif end_of_day) et la journée est
    | marquée terminée à 23:59:59 de son propre jour. Aucun utilisateur
    | n'est enregistré : c'est MARKI qui clôture.
    |--------------------------------------------------------------------------
    */
    public function closeExpiredQueues(int $clinicId, int $doctorId, string $today): int
    {
        // Appelée parfois depuis une transaction déjà ouverte : on s'y joint.
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) {
            $this->pdo->beginTransaction();
        }

        try {
            $cancelSql = "
                UPDATE queue_entries qe
                INNER JOIN queues q
                    ON q.id = qe.queue_id
                SET
                    qe.status_before_completion = qe.status,
                    qe.canceled_by_completion = 1,
                    qe.status = 'canceled',
                    qe.canceled_at = TIMESTAMP(q.queue_date, '23:59:59'),
                    qe.cancellation_reason = 'end_of_day',
                    qe.done_at = NULL,
                    qe.no_show_at = NULL
                WHERE q.clinic_id = :clinic_id
                  AND q.doctor_id = :doctor_id
                  AND q.queue_date < :today
                  AND q.day_status <> 'completed'
                  AND qe.status IN ('waiting', 'called')
            ";

            $cancelStmt = $this->pdo->prepare($cancelSql);
            $cancelStmt->execute([
                ':clinic_id' => $clinicId,
                ':doctor_id' => $doctorId,
                ':today' => $today,
            ]);

            $queueSql = "
                UPDATE queues
                SET
                    registration_status_before_completion = registration_status,
                    day_status_before_completion = day_status,
                    registration_status = 'closed',
                    day_status = 'completed',
                    status = 'archived',
                    closed_at = COALESCE(closed_at, TIMESTAMP(queue_date, '23:59:59')),
                    completed_at = TIMESTAMP(queue_date, '23:59:59'),
                    updated_at = NOW()
                WHERE clinic_id = :clinic_id
                  AND doctor_id = :doctor_id
                  AND queue_date < :today
                  AND day_status <> 'completed'
            ";

            $queueStmt = $this->pdo->prepare($queueSql);
            $queueStmt->execute([
                ':clinic_id' => $clinicId,
                ':doctor_id' => $doctorId,
                ':today' => $today,
            ]);

            if ($ownsTransaction) {
                $this->pdo->commit();
            }

            return $queueStmt->rowCount();
        } catch (Throwable $exception) {
            if ($ownsTransaction) {
                $this->pdo->rollBack();
            }
            throw $exception;
        }
    }

    public function getOrCreateTodayQueue(
        int $clinicId,
        int $doctorId,
        int $userId,
        string $queueDate
    ): array {
        // Les journées précédentes restées ouvertes sont clôturées d'abord.
        $this->closeExpiredQueues($clinicId, $doctorId, $queueDate);

        $queue = $this->findTodayQueue($doctorId, $queueDate);

        if ($queue !== null) {
            return $queue;
        }

        $this->createTodayQueue(
            $clinicId,
            $doctorId,
            $userId,
            $queueDate
        );

        $createdQueue = $this->findTodayQueue($doctorId, $queueDate);

        if ($createdQueue === null) {
            throw new RuntimeException(
                'Impossible de récupérer la liste du jour après création.'
            );
        }

        return $createdQueue;
    }

    /*
    |--------------------------------------------------------------------------
    | Récupérer une queue par son identifiant
    |--------------------------------------------------------------------------
    */
    public function findById(int $queueId, int $clinicId): ?array
    {
        $sql = "
            SELECT {$this->queueSelectColumns()}
            FROM queues q
            WHERE q.id = :id
              AND q.clinic_id = :clinic_id
            LIMIT 1
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':id' => $queueId,
            ':clinic_id' => $clinicId,
        ]);

        $row = $stmt->fetch();

        return $row ? $this->mapQueueRow($row) : null;
    }

    /*
    |--------------------------------------------------------------------------
    | Verrouiller une queue pendant une transaction
    |--------------------------------------------------------------------------
    */
    private function findByIdForUpdate(int $queueId, int $clinicId): ?array
    {
        $sql = "
            SELECT {$this->queueSelectColumns()}
            FROM queues q
            WHERE q.id = :id
              AND q.clinic_id = :clinic_id
            LIMIT 1
            FOR UPDATE
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':id' => $queueId,
            ':clinic_id' => $clinicId,
        ]);

        $row = $stmt->fetch();

        return $row ? $this->mapQueueRow($row) : null;
    }

    /*
    |--------------------------------------------------------------------------
    | Ouvrir ou fermer les nouvelles inscriptions
    |--------------------------------------------------------------------------
    | Cette action ne bloque jamais le traitement des patients déjà inscrits.
    |--------------------------------------------------------------------------
    */
    public function toggleRegistrationStatus(
        int $queueId,
        int $clinicId,
        int $userId
    ): array {
        $queue = $this->findById($queueId, $clinicId);

        if ($queue === null) {
            throw new RuntimeException('Liste introuvable.');
        }

        if ($queue['day_status'] === 'completed') {
            throw new RuntimeException(
                'La journée est clôturée. Les inscriptions ne peuvent plus être modifiées.'
            );
        }

        $nextStatus = $queue['registration_status'] === 'open'
            ? 'closed'
            : 'open';

        if (
            $nextStatus === 'open'
            && $queue['day_status'] !== 'active'
        ) {
            throw new RuntimeException(
                'Reprenez d’abord la liste avant de rouvrir les inscriptions.'
            );
        }

        if ($nextStatus === 'closed') {
            $sql = "
                UPDATE queues
                SET
                    registration_status = 'closed',
                    status = 'closed',
                    closed_at = NOW(),
                    closed_by_user_id = :user_id,
                    updated_at = NOW()
                WHERE id = :id
                  AND clinic_id = :clinic_id
                LIMIT 1
            ";
        } else {
            $sql = "
                UPDATE queues
                SET
                    registration_status = 'open',
                    status = 'open',
                    opened_at = NOW(),
                    opened_by_user_id = :user_id,
                    closed_at = NULL,
                    closed_by_user_id = NULL,
                    updated_at = NOW()
                WHERE id = :id
                  AND clinic_id = :clinic_id
                LIMIT 1
            ";
        }

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':user_id' => $userId,
            ':id' => $queueId,
            ':clinic_id' => $clinicId,
        ]);

        $updatedQueue = $this->findById($queueId, $clinicId);

        if ($updatedQueue === null) {
            throw new RuntimeException(
                'Impossible de récupérer la liste après mise à jour.'
            );
        }

        return $updatedQueue;
    }

    /*
    |--------------------------------------------------------------------------
    | Alias temporaire pour préserver les anciens appels du projet
    |--------------------------------------------------------------------------
    */
    public function toggleStatus(
        int $queueId,
        int $clinicId,
        int $userId
    ): array {
        return $this->toggleRegistrationStatus(
            $queueId,
            $clinicId,
            $userId
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Mettre la liste en pause
    |--------------------------------------------------------------------------
    | Les patients conservent leur position. Les inscriptions sont fermées.
    |--------------------------------------------------------------------------
    */
    public function pauseDay(
        int $queueId,
        int $clinicId,
        int $userId
    ): array {
        $queue = $this->findById($queueId, $clinicId);

        if ($queue === null) {
            throw new RuntimeException('Liste introuvable.');
        }

        if ($queue['day_status'] === 'completed') {
            throw new RuntimeException('La journée est déjà clôturée.');
        }

        if ($queue['day_status'] === 'paused') {
            return $queue;
        }

        $sql = "
            UPDATE queues
            SET
                registration_status = 'closed',
                day_status = 'paused',
                status = 'closed',
                closed_at = COALESCE(closed_at, NOW()),
                closed_by_user_id = COALESCE(
                    closed_by_user_id,
                    :closed_by_user_id
                ),
                paused_at = NOW(),
                paused_by_user_id = :paused_by_user_id,
                updated_at = NOW()
            WHERE id = :id
              AND clinic_id = :clinic_id
            LIMIT 1
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':closed_by_user_id' => $userId,
            ':paused_by_user_id' => $userId,
            ':id' => $queueId,
            ':clinic_id' => $clinicId,
        ]);

        $updatedQueue = $this->findById($queueId, $clinicId);

        if ($updatedQueue === null) {
            throw new RuntimeException(
                'Impossible de récupérer la liste après la mise en pause.'
            );
        }

        return $updatedQueue;
    }

    /*
    |--------------------------------------------------------------------------
    | Reprendre une liste en pause
    |--------------------------------------------------------------------------
    | Les inscriptions restent fermées après la reprise. La secrétaire peut
    | ensuite les rouvrir explicitement si le cabinet accepte encore du monde.
    |--------------------------------------------------------------------------
    */
    public function resumeDay(
        int $queueId,
        int $clinicId,
        int $userId
    ): array {
        $queue = $this->findById($queueId, $clinicId);

        if ($queue === null) {
            throw new RuntimeException('Liste introuvable.');
        }

        if ($queue['day_status'] === 'completed') {
            throw new RuntimeException('La journée est déjà clôturée.');
        }

        if ($queue['day_status'] !== 'paused') {
            throw new RuntimeException('La liste n’est pas en pause.');
        }

        $sql = "
            UPDATE queues
            SET
                day_status = 'active',
                status = 'closed',
                resumed_at = NOW(),
                updated_at = NOW()
            WHERE id = :id
              AND clinic_id = :clinic_id
            LIMIT 1
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':id' => $queueId,
            ':clinic_id' => $clinicId,
        ]);

        $updatedQueue = $this->findById($queueId, $clinicId);

        if ($updatedQueue === null) {
            throw new RuntimeException(
                'Impossible de récupérer la liste après la reprise.'
            );
        }

        return $updatedQueue;
    }

    /*
    |--------------------------------------------------------------------------
    | Clôturer la journée et annuler globalement les patients restants
    |--------------------------------------------------------------------------
    | Cette opération est atomique :
    | - soit toutes les entrées restantes sont annulées et la journée clôturée
    | - soit aucune modification n'est conservée
    |--------------------------------------------------------------------------
    */
    public function completeDayAndCancelWaiting(
        int $queueId,
        int $clinicId,
        int $userId,
        string $cancellationReason = 'end_of_day'
    ): array {
        $allowedReasons = [
            'doctor_unavailable',
            'end_of_day',
        ];

        if (!in_array($cancellationReason, $allowedReasons, true)) {
            throw new InvalidArgumentException(
                'Raison de clôture invalide.'
            );
        }

        $this->pdo->beginTransaction();

        try {
            $queue = $this->findByIdForUpdate($queueId, $clinicId);

            if ($queue === null) {
                throw new RuntimeException('Liste introuvable.');
            }

            if ($queue['day_status'] === 'completed') {
                $this->pdo->commit();

                return [
                    'queue' => $queue,
                    'canceled_count' => 0,
                ];
            }

            /*
            |----------------------------------------------------------------------
            | Verrouiller les entrées encore actives avant la mise à jour globale
            |----------------------------------------------------------------------
            */
            $waitingSql = "
                SELECT id
                FROM queue_entries
                WHERE queue_id = :queue_id
                  AND clinic_id = :clinic_id
                  AND status IN ('waiting', 'called')
                ORDER BY id ASC
                FOR UPDATE
            ";

            $waitingStmt = $this->pdo->prepare($waitingSql);
            $waitingStmt->execute([
                ':queue_id' => $queueId,
                ':clinic_id' => $clinicId,
            ]);

            $waitingRows = $waitingStmt->fetchAll(PDO::FETCH_COLUMN);
            $canceledCount = count($waitingRows);

            if ($canceledCount > 0) {
                $cancelSql = "
                    UPDATE queue_entries
                    SET
                        status_before_completion = status,
                        canceled_by_completion = 1,
                        status = 'canceled',
                        canceled_at = NOW(),
                        cancellation_reason = :cancellation_reason,
                        done_at = NULL,
                        no_show_at = NULL,
                        updated_by_user_id = :user_id
                    WHERE queue_id = :queue_id
                      AND clinic_id = :clinic_id
                      AND status IN ('waiting', 'called')
                ";

                $cancelStmt = $this->pdo->prepare($cancelSql);
                $cancelStmt->execute([
                    ':cancellation_reason' => $cancellationReason,
                    ':user_id' => $userId,
                    ':queue_id' => $queueId,
                    ':clinic_id' => $clinicId,
                ]);
            }

            $queueSql = "
                UPDATE queues
                SET
                    registration_status_before_completion = registration_status,
                    day_status_before_completion = day_status,
                    registration_status = 'closed',
                    day_status = 'completed',
                    status = 'archived',
                    closed_at = COALESCE(closed_at, NOW()),
                    closed_by_user_id = COALESCE(
                        closed_by_user_id,
                        :closed_by_user_id
                    ),
                    completed_at = NOW(),
                    completed_by_user_id = :completed_by_user_id,
                    updated_at = NOW()
                WHERE id = :id
                  AND clinic_id = :clinic_id
                LIMIT 1
            ";

            $queueStmt = $this->pdo->prepare($queueSql);
            $queueStmt->execute([
                ':closed_by_user_id' => $userId,
                ':completed_by_user_id' => $userId,
                ':id' => $queueId,
                ':clinic_id' => $clinicId,
            ]);

            $this->pdo->commit();

            $updatedQueue = $this->findById($queueId, $clinicId);

            if ($updatedQueue === null) {
                throw new RuntimeException(
                    'Impossible de récupérer la liste après clôture.'
                );
            }

            return [
                'queue' => $updatedQueue,
                'canceled_count' => $canceledCount,
            ];
        } catch (Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }

            throw $exception;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Annuler la clôture et restaurer exactement l'état précédent
    |--------------------------------------------------------------------------
    | Cette action de secours :
    | - restaure l'état de la journée avant clôture
    | - restaure l'état des inscriptions avant clôture
    | - remet uniquement les patients annulés automatiquement
    | - conserve leur position FIFO et leur ancien statut waiting/called
    |--------------------------------------------------------------------------
    */
    public function reopenCompletedDayAndRestoreEntries(
        int $queueId,
        int $clinicId,
        int $userId
    ): array {
        $this->pdo->beginTransaction();

        try {
            $queue = $this->findByIdForUpdate($queueId, $clinicId);

            if ($queue === null) {
                throw new RuntimeException('Liste introuvable.');
            }

            if ($queue['day_status'] !== 'completed') {
                throw new RuntimeException(
                    'La journée n’est pas clôturée.'
                );
            }

            $previousRegistrationStatus =
                $queue['registration_status_before_completion']
                ?? 'closed';

            $previousDayStatus =
                $queue['day_status_before_completion']
                ?? 'active';

            if (!in_array(
                $previousRegistrationStatus,
                ['open', 'closed'],
                true
            )) {
                $previousRegistrationStatus = 'closed';
            }

            if (!in_array(
                $previousDayStatus,
                ['active', 'paused'],
                true
            )) {
                $previousDayStatus = 'active';
            }

            /*
            |----------------------------------------------------------------------
            | Restaurer uniquement les annulations produites par la clôture
            |----------------------------------------------------------------------
            */
            $restoreEntriesSql = "
                UPDATE queue_entries
                SET
                    status = status_before_completion,
                    canceled_at = NULL,
                    cancellation_reason = NULL,
                    status_before_completion = NULL,
                    canceled_by_completion = 0,
                    updated_by_user_id = :restored_by_user_id
                WHERE queue_id = :queue_id
                  AND clinic_id = :clinic_id
                  AND status = 'canceled'
                  AND canceled_by_completion = 1
                  AND status_before_completion IN ('waiting', 'called')
            ";

            $restoreEntriesStmt = $this->pdo->prepare(
                $restoreEntriesSql
            );

            $restoreEntriesStmt->execute([
                ':restored_by_user_id' => $userId,
                ':queue_id' => $queueId,
                ':clinic_id' => $clinicId,
            ]);

            $restoredCount = $restoreEntriesStmt->rowCount();

            $legacyStatus =
                $previousDayStatus === 'active'
                && $previousRegistrationStatus === 'open'
                    ? 'open'
                    : 'closed';

            /*
            |----------------------------------------------------------------------
            | Restaurer la queue et retirer les informations de clôture
            |----------------------------------------------------------------------
            | Si les inscriptions étaient ouvertes, closed_at/closed_by sont
            | remis à NULL. Si elles étaient fermées, leurs valeurs sont gardées.
            |----------------------------------------------------------------------
            */
            $restoreQueueSql = "
                UPDATE queues
                SET
                    registration_status = :restored_registration_status,
                    day_status = :restored_day_status,
                    status = :restored_legacy_status,
                    closed_at = CASE
                        WHEN :registration_for_closed_at = 'open'
                        THEN NULL
                        ELSE closed_at
                    END,
                    closed_by_user_id = CASE
                        WHEN :registration_for_closed_by = 'open'
                        THEN NULL
                        ELSE closed_by_user_id
                    END,
                    completed_at = NULL,
                    completed_by_user_id = NULL,
                    registration_status_before_completion = NULL,
                    day_status_before_completion = NULL,
                    updated_at = NOW()
                WHERE id = :id
                  AND clinic_id = :clinic_id
                LIMIT 1
            ";

            $restoreQueueStmt = $this->pdo->prepare(
                $restoreQueueSql
            );

            $restoreQueueStmt->execute([
                ':restored_registration_status' =>
                    $previousRegistrationStatus,
                ':restored_day_status' => $previousDayStatus,
                ':restored_legacy_status' => $legacyStatus,
                ':registration_for_closed_at' =>
                    $previousRegistrationStatus,
                ':registration_for_closed_by' =>
                    $previousRegistrationStatus,
                ':id' => $queueId,
                ':clinic_id' => $clinicId,
            ]);

            $this->pdo->commit();

            $updatedQueue = $this->findById($queueId, $clinicId);

            if ($updatedQueue === null) {
                throw new RuntimeException(
                    'Impossible de récupérer la liste après restauration.'
                );
            }

            return [
                'queue' => $updatedQueue,
                'restored_count' => $restoredCount,
            ];
        } catch (Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }

            throw $exception;
        }
    }

}
