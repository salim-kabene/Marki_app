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
| - récupérer une queue précise par son id
| - basculer son statut open <-> closed
|--------------------------------------------------------------------------
|
| IMPORTANT :
| Ce repository est utilisé par les APIs du dashboard.
| Il doit donc rester simple, clair, et centraliser toute la logique SQL
| concernant la table "queues".
|--------------------------------------------------------------------------
*/

require_once __DIR__ . '/../db.php';

class QueueRepository
{
    /*
    |--------------------------------------------------------------------------
    | Connexion PDO partagée
    |--------------------------------------------------------------------------
    | On la stocke dans une propriété pour réutiliser la même connexion
    | dans toutes les méthodes du repository.
    |--------------------------------------------------------------------------
    */
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
    |
    | Pourquoi cette méthode ?
    | - c’est la base du dashboard "Liste du jour"
    | - elle permet de savoir si une queue existe déjà pour aujourd’hui
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
    |
    | IMPORTANT :
    | La queue est créée directement en statut "open".
    | Cela correspond à la logique métier actuelle de la V1.
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
    |
    | Pourquoi cette méthode est utile ?
    | - elle simplifie les endpoints
    | - elle évite de répéter la logique "find or create"
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

    /*
    |--------------------------------------------------------------------------
    | Récupérer une queue par son id
    |--------------------------------------------------------------------------
    | Paramètres :
    | - queueId  : identifiant de la queue
    | - clinicId : identifiant du cabinet
    |
    | Retour :
    | - tableau associatif si trouvé
    | - null sinon
    |--------------------------------------------------------------------------
    |
    | Pourquoi cette méthode ?
    | - utile après une mise à jour
    | - permet de relire l’état exact de la queue après toggle
    | - sera aussi réutilisable plus tard pour "Toutes les listes"
    |--------------------------------------------------------------------------
    */
    public function findById(int $queueId, int $clinicId): ?array
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
            WHERE q.id = :id
              AND q.clinic_id = :clinic_id
            LIMIT 1
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':id' => $queueId,
            ':clinic_id' => $clinicId,
        ]);

        $queue = $stmt->fetch();

        if (!$queue) {
            return null;
        }

        return [
            'id' => (int) $queue['id'],
            'clinic_id' => (int) $queue['clinic_id'],
            'doctor_id' => (int) $queue['doctor_id'],
            'queue_date' => $queue['queue_date'],
            'status' => $queue['status'],
            'opened_at' => $queue['opened_at'],
            'closed_at' => $queue['closed_at'],
            'opened_by_user_id' => $queue['opened_by_user_id'] !== null ? (int) $queue['opened_by_user_id'] : null,
            'closed_by_user_id' => $queue['closed_by_user_id'] !== null ? (int) $queue['closed_by_user_id'] : null,
            'created_at' => $queue['created_at'],
            'updated_at' => $queue['updated_at'],
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Basculer le statut d'une queue : open <-> closed
    |--------------------------------------------------------------------------
    | Paramètres :
    | - queueId  : identifiant de la queue
    | - clinicId : identifiant du cabinet
    | - userId   : utilisateur qui effectue l'action
    |
    | Retour :
    | - la queue mise à jour
    |--------------------------------------------------------------------------
    |
    | Règle métier V1 :
    | - si la liste est ouverte, on la ferme
    | - si la liste est fermée, on la réouvre
    |
    | Pourquoi une méthode dédiée ?
    | - logique claire
    | - évite de mettre du SQL métier dans l’API
    | - plus simple à maintenir plus tard
    |--------------------------------------------------------------------------
    */
    public function toggleStatus(int $queueId, int $clinicId, int $userId): array
    {
        /*
        |--------------------------------------------------------------
        | 1) Charger la queue actuelle
        |--------------------------------------------------------------
        | On relit d'abord l'état actuel avant de décider quoi faire.
        */
        $queue = $this->findById($queueId, $clinicId);

        if (!$queue) {
            throw new RuntimeException('Liste introuvable.');
        }

        /*
        |--------------------------------------------------------------
        | 2) Déterminer le prochain statut
        |--------------------------------------------------------------
        | open   -> closed
        | closed -> open
        */
        $currentStatus = $queue['status'];
        $nextStatus = $currentStatus === 'open' ? 'closed' : 'open';

        /*
        |--------------------------------------------------------------
        | 3) Préparer les champs temporels et user
        |--------------------------------------------------------------
        | Si on ferme :
        | - on garde opened_at tel quel
        | - on remplit closed_at
        | - on remplit closed_by_user_id
        |
        | Si on réouvre :
        | - on met opened_at à maintenant
        | - on met opened_by_user_id à l'utilisateur courant
        | - on vide closed_at
        | - on vide closed_by_user_id
        |
        | Pourquoi cette logique ?
        | - elle garde un historique minimal cohérent
        | - elle reste simple pour la V1
        */
        $openedAt = $queue['opened_at'];
        $closedAt = $queue['closed_at'];
        $openedByUserId = $queue['opened_by_user_id'];
        $closedByUserId = $queue['closed_by_user_id'];

        if ($nextStatus === 'closed') {
            $closedAt = date('Y-m-d H:i:s');
            $closedByUserId = $userId;
        } else {
            $openedAt = date('Y-m-d H:i:s');
            $openedByUserId = $userId;
            $closedAt = null;
            $closedByUserId = null;
        }

        /*
        |--------------------------------------------------------------
        | 4) Mise à jour SQL
        |--------------------------------------------------------------
        | La table queues contient bien updated_at,
        | donc on le met à jour ici.
        */
        $sql = "
            UPDATE queues
            SET
                status = :status,
                opened_at = :opened_at,
                closed_at = :closed_at,
                opened_by_user_id = :opened_by_user_id,
                closed_by_user_id = :closed_by_user_id,
                updated_at = NOW()
            WHERE id = :id
              AND clinic_id = :clinic_id
            LIMIT 1
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':status' => $nextStatus,
            ':opened_at' => $openedAt,
            ':closed_at' => $closedAt,
            ':opened_by_user_id' => $openedByUserId,
            ':closed_by_user_id' => $closedByUserId,
            ':id' => $queueId,
            ':clinic_id' => $clinicId,
        ]);

        /*
        |--------------------------------------------------------------
        | 5) Relire la queue mise à jour
        |--------------------------------------------------------------
        | On renvoie la version fraîche depuis la base,
        | pas un tableau bricolé à la main.
        */
        $updatedQueue = $this->findById($queueId, $clinicId);

        if (!$updatedQueue) {
            throw new RuntimeException('Impossible de récupérer la liste après mise à jour.');
        }

        return $updatedQueue;
    }
}