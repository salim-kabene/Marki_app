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
| - préparer les données pour le tableau du dashboard
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
    | Paramètre :
    | - queueId : identifiant de la liste du jour
    |
    | Retour :
    | - tableau de lignes prêtes à afficher dans le dashboard
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

        /*
        |--------------------------------------------------------------------------
        | On reformate légèrement les données
        |--------------------------------------------------------------------------
        | But :
        | préparer un résultat propre et pratique pour le frontend
        |--------------------------------------------------------------------------
        */
        $entries = [];

        foreach ($rows as $index => $row) {
            $entries[] = [
                'id' => (int) $row['id'],
                'queue_id' => (int) $row['queue_id'],
                'patient_id' => $row['patient_id'] !== null ? (int) $row['patient_id'] : null,

                // Numéro d'affichage dans le tableau
                'number' => $row['position_number'] !== null
                    ? (int) $row['position_number']
                    : ($index + 1),

                'display_name' => $row['display_name'],
                'phone' => $row['phone'],
                'birth_date' => $row['birth_date'],
                'source' => $row['source'],
                'status' => $row['status'],

                // Heure utile pour le tableau
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
    | Cela servira aux cartes :
    | - en attente
    | - absents
    | - terminés
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

        /*
        |--------------------------------------------------------------------------
        | Valeurs par défaut
        |--------------------------------------------------------------------------
        */
        $counts = [
            'waiting' => 0,
            'absent' => 0,
            'done' => 0,
        ];

        foreach ($rows as $row) {
            $status = $row['status'];
            $total = (int) $row['total'];

            /*
            |--------------------------------------------------------------------------
            | Mapping DB -> UI
            |--------------------------------------------------------------------------
            | Dans la DB :
            | - no_show = absent
            | - done = terminé
            | - waiting = en attente
            |--------------------------------------------------------------------------
            */
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
}