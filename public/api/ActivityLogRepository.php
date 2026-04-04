<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Repository des logs d'activité
|--------------------------------------------------------------------------
| Ce repository centralise les INSERT dans la table activity_logs.
|
| IMPORTANT :
| Structure réelle de la table :
| - clinic_id
| - actor_user_id
| - action
| - entity_type
| - entity_id
| - metadata_json
| - created_at
|--------------------------------------------------------------------------
*/

require_once __DIR__ . '/../db.php';

class ActivityLogRepository
{
    /*
    |--------------------------------------------------------------------------
    | Connexion PDO
    |--------------------------------------------------------------------------
    */
    private PDO $pdo;

    public function __construct()
    {
        $this->pdo = db();
    }

    /*
    |--------------------------------------------------------------------------
    | Créer un log
    |--------------------------------------------------------------------------
    | Paramètres :
    | - clinicId
    | - actorUserId
    | - action
    | - entityType
    | - entityId
    | - metadata
    |--------------------------------------------------------------------------
    */
    public function create(
        int $clinicId,
        ?int $actorUserId,
        string $action,
        string $entityType,
        ?int $entityId,
        array $metadata = []
    ): int {
        /*
        |--------------------------------------------------------------
        | Nettoyage minimal
        |--------------------------------------------------------------
        */
        $action = trim($action);
        $entityType = trim($entityType);

        if ($action === '') {
            throw new InvalidArgumentException('Le champ action est obligatoire.');
        }

        if ($entityType === '') {
            throw new InvalidArgumentException('Le champ entityType est obligatoire.');
        }

        /*
        |--------------------------------------------------------------
        | Encodage JSON
        |--------------------------------------------------------------
        */
        $metadataJson = !empty($metadata)
            ? json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            : null;

        /*
        |--------------------------------------------------------------
        | Insert SQL aligné sur la vraie table
        |--------------------------------------------------------------
        */
        $sql = "
            INSERT INTO activity_logs (
                clinic_id,
                actor_user_id,
                action,
                entity_type,
                entity_id,
                metadata_json,
                created_at
            ) VALUES (
                :clinic_id,
                :actor_user_id,
                :action,
                :entity_type,
                :entity_id,
                :metadata_json,
                NOW()
            )
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':clinic_id' => $clinicId,
            ':actor_user_id' => $actorUserId,
            ':action' => $action,
            ':entity_type' => $entityType,
            ':entity_id' => $entityId,
            ':metadata_json' => $metadataJson,
        ]);

        return (int) $this->pdo->lastInsertId();
    }
}