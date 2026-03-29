<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Repository de la liste du jour
|--------------------------------------------------------------------------
| Ce fichier contient les requêtes SQL liées à la table "queues".
|
| Son rôle :
| - chercher la liste du jour d’un médecin
| - créer la liste si elle n’existe pas encore
| - retourner cette liste au backend
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
    | Chercher la liste du jour d’un médecin
    |--------------------------------------------------------------------------
    | Paramètres :
    | - doctorId : identifiant du médecin
    | - queueDate : date du jour au format YYYY-MM-DD
    |
    | Retour :
    | - tableau associatif si trouvé
    | - null sinon
    |--------------------------------------------------------------------------
    */
    public function findTodayQueue(int $doctorId, string $queueDate): ?array
    {
        $sql = "
            SELECT
                q.id,
                q.clinic_id,
                q.doctor_id,
                q.queue_date,
                q.status,
                q.opened_at,
                q.closed_at,
                q.opened_by_user_id,
                q.closed_by_user_id,
                q.created_at,
                q.updated_at
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

        $queue = $stmt->fetch();

        return $queue ?: null;
    }

    /*
    |--------------------------------------------------------------------------
    | Créer la liste du jour
    |--------------------------------------------------------------------------
    | Si le médecin n’a pas encore de liste pour aujourd’hui,
    | on crée une nouvelle ligne dans la table queues.
    |
    | Retour :
    | - l'id de la queue créée
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
    | C’est la méthode principale utilisée par l’API.
    |
    | Logique :
    | - on cherche si la liste existe déjà
    | - si oui, on la retourne
    | - sinon, on la crée puis on la retourne
    |--------------------------------------------------------------------------
    */
    public function getOrCreateTodayQueue(
        int $clinicId,
        int $doctorId,
        int $userId,
        string $queueDate
    ): array {
        $queue = $this->findTodayQueue($doctorId, $queueDate);

        if ($queue) {
            return $queue;
        }

        $this->createTodayQueue(
            $clinicId,
            $doctorId,
            $userId,
            $queueDate
        );

        $createdQueue = $this->findTodayQueue($doctorId, $queueDate);

        if (!$createdQueue) {
            throw new RuntimeException('Impossible de récupérer la liste du jour après création.');
        }

        return $createdQueue;
    }
}