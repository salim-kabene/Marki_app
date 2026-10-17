<?php

declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers/PatientDataNormalizer.php';

final class PatientDirectoryRepository
{
    private PDO $pdo;

    public function __construct()
    {
        $this->pdo = db();
    }

    public function paginateForDoctor(
        int $clinicId,
        int $doctorId,
        string $search,
        int $page,
        int $perPage,
        string $sort = 'recent'
    ): array {
        $page = max(1, $page);
        // Nombre de patients par page proposé dans « Mes Patients ».
        $perPage = in_array($perPage, [15, 30, 50, 100], true)
            ? $perPage
            : 15;
        $offset = ($page - 1) * $perPage;
        $search = trim($search);

        $where = [
            'p.clinic_id = :clinic_id',
            '(
                EXISTS (
                    SELECT 1
                    FROM queue_entries qe_link
                    INNER JOIN queues q_link
                        ON q_link.id = qe_link.queue_id
                    WHERE qe_link.patient_id = p.id
                      AND q_link.clinic_id = :queue_clinic_id
                      AND q_link.doctor_id = :queue_doctor_id
                )
                OR EXISTS (
                    SELECT 1
                    FROM visits v_link
                    WHERE v_link.patient_id = p.id
                      AND v_link.clinic_id = :visit_clinic_id
                      AND v_link.doctor_id = :visit_doctor_id
                )
            )',
        ];

        $params = [
            ':clinic_id' => $clinicId,
            ':queue_clinic_id' => $clinicId,
            ':queue_doctor_id' => $doctorId,
            ':visit_clinic_id' => $clinicId,
            ':visit_doctor_id' => $doctorId,
        ];

        if ($search !== '') {
            $digits = preg_replace('/\D+/', '', $search) ?? '';

            $searchConditions = [
                'p.full_name LIKE :search_name',
                'DATE_FORMAT(p.birth_date, \'%Y-%m-%d\') LIKE :search_birth_iso',
                'DATE_FORMAT(p.birth_date, \'%d/%m/%Y\') LIKE :search_birth_local',
            ];

            $params[':search_name'] = '%' . $search . '%';
            $params[':search_birth_iso'] = '%' . $search . '%';
            $params[':search_birth_local'] = '%' . $search . '%';

            /*
            |------------------------------------------------------------------
            | Rechercher par téléphone seulement lorsque la saisie contient
            | réellement des chiffres.
            |------------------------------------------------------------------
            */
            if ($digits !== '') {
                $searchConditions[] = 'p.phone LIKE :search_phone_stored';
                $searchConditions[] = "CONCAT('0', SUBSTRING(p.phone, 5)) LIKE :search_phone_local";

                $params[':search_phone_stored'] = '%' . $digits . '%';
                $params[':search_phone_local'] = '%' . $digits . '%';
            }

            $where[] = '(' . implode(' OR ', $searchConditions) . ')';
        }

        $whereSql = implode("\n AND ", $where);

        /*
        |----------------------------------------------------------------------
        | Tri : liste fermée de valeurs, jamais de SQL venu du client.
        |----------------------------------------------------------------------
        */
        $orderSql = $sort === 'name'
            ? 'p.full_name ASC, p.id DESC'
            : 'COALESCE(last_visit_at, p.updated_at, p.created_at) DESC, p.full_name ASC, p.id DESC';

        $countSql = "
            SELECT COUNT(*) AS total
            FROM patients p
            WHERE {$whereSql}
        ";

        $countStmt = $this->pdo->prepare($countSql);
        $countStmt->execute($params);
        $total = (int) ($countStmt->fetch()['total'] ?? 0);

        $listSql = "
            SELECT
                p.id,
                p.full_name,
                p.birth_date,
                p.phone,
                p.email,
                p.address,
                p.notes_non_medical,
                p.created_at,
                (
                    SELECT MAX(COALESCE(v.ended_at, v.started_at, v.created_at))
                    FROM visits v
                    WHERE v.patient_id = p.id
                      AND v.clinic_id = :list_visit_clinic_id
                      AND v.doctor_id = :list_visit_doctor_id
                ) AS last_visit_at,
                (
                    SELECT COUNT(*)
                    FROM visits v_count
                    WHERE v_count.patient_id = p.id
                      AND v_count.clinic_id = :count_visit_clinic_id
                      AND v_count.doctor_id = :count_visit_doctor_id
                      AND v_count.status = 'done'
                ) AS visit_count,
                (
                    SELECT qe_last.status
                    FROM queue_entries qe_last
                    INNER JOIN queues q_last
                        ON q_last.id = qe_last.queue_id
                    WHERE qe_last.patient_id = p.id
                      AND q_last.clinic_id = :last_queue_clinic_id
                      AND q_last.doctor_id = :last_queue_doctor_id
                    ORDER BY q_last.queue_date DESC, qe_last.id DESC
                    LIMIT 1
                ) AS last_queue_status
            FROM patients p
            WHERE {$whereSql}
            ORDER BY {$orderSql}
            LIMIT :limit_rows OFFSET :offset_rows
        ";

        $listParams = $params;
        $listParams[':list_visit_clinic_id'] = $clinicId;
        $listParams[':list_visit_doctor_id'] = $doctorId;
        $listParams[':count_visit_clinic_id'] = $clinicId;
        $listParams[':count_visit_doctor_id'] = $doctorId;
        $listParams[':last_queue_clinic_id'] = $clinicId;
        $listParams[':last_queue_doctor_id'] = $doctorId;

        $listStmt = $this->pdo->prepare($listSql);
        foreach ($listParams as $name => $value) {
            $listStmt->bindValue($name, $value);
        }
        $listStmt->bindValue(':limit_rows', $perPage, PDO::PARAM_INT);
        $listStmt->bindValue(':offset_rows', $offset, PDO::PARAM_INT);
        $listStmt->execute();

        $items = array_map(
            fn(array $row): array => $this->mapPatientSummary($row),
            $listStmt->fetchAll()
        );

        return [
            'items' => $items,
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => max(1, (int) ceil($total / $perPage)),
            ],
        ];
    }

    public function findByIdForDoctor(
        int $patientId,
        int $clinicId,
        int $doctorId
    ): array {
        $sql = "
            SELECT
                p.id,
                p.clinic_id,
                p.full_name,
                p.birth_date,
                p.gender,
                p.phone,
                p.email,
                p.address,
                p.notes_non_medical,
                p.created_at,
                p.updated_at
            FROM patients p
            WHERE p.id = :patient_id
              AND p.clinic_id = :clinic_id
              AND (
                    EXISTS (
                        SELECT 1
                        FROM queue_entries qe_link
                        INNER JOIN queues q_link
                            ON q_link.id = qe_link.queue_id
                        WHERE qe_link.patient_id = p.id
                          AND q_link.clinic_id = :queue_clinic_id
                          AND q_link.doctor_id = :queue_doctor_id
                    )
                    OR EXISTS (
                        SELECT 1
                        FROM visits v_link
                        WHERE v_link.patient_id = p.id
                          AND v_link.clinic_id = :visit_clinic_id
                          AND v_link.doctor_id = :visit_doctor_id
                    )
              )
            LIMIT 1
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':patient_id' => $patientId,
            ':clinic_id' => $clinicId,
            ':queue_clinic_id' => $clinicId,
            ':queue_doctor_id' => $doctorId,
            ':visit_clinic_id' => $clinicId,
            ':visit_doctor_id' => $doctorId,
        ]);

        $patient = $stmt->fetch();

        if (!$patient) {
            throw new RuntimeException('Patient introuvable pour ce médecin.');
        }

        $patient['id'] = (int) $patient['id'];
        $patient['clinic_id'] = (int) $patient['clinic_id'];
        $patient['phone'] = PatientDataNormalizer::formatPhoneForDisplay(
            $patient['phone'] !== null ? (string) $patient['phone'] : null
        );
        $patient['recent_visits'] = $this->findRecentVisits(
            $patientId,
            $clinicId,
            $doctorId
        );

        return $patient;
    }

    public function updateAdministrativeProfile(
        int $patientId,
        int $clinicId,
        int $doctorId,
        int $actorUserId,
        array $input
    ): array {
        $existing = $this->findByIdForDoctor(
            $patientId,
            $clinicId,
            $doctorId
        );

        $fullName = PatientDataNormalizer::normalizeName(
            (string) ($input['full_name'] ?? '')
        );
        $phone = PatientDataNormalizer::normalizePhone(
            (string) ($input['phone'] ?? '')
        );
        $birthDate = trim((string) ($input['birth_date'] ?? ''));
        $email = trim((string) ($input['email'] ?? ''));
        $address = trim((string) ($input['address'] ?? ''));
        $notes = trim((string) ($input['notes_non_medical'] ?? ''));

        if ($fullName === '') {
            throw new InvalidArgumentException('Le nom complet est obligatoire.');
        }

        if ($phone === '' || !PatientDataNormalizer::isValidPhone($phone)) {
            throw new InvalidArgumentException(
                PatientDataNormalizer::phoneValidationMessage()
            );
        }

        if ($birthDate !== '') {
            $date = DateTimeImmutable::createFromFormat('Y-m-d', $birthDate);
            if (!$date || $date->format('Y-m-d') !== $birthDate) {
                throw new InvalidArgumentException('Date de naissance invalide.');
            }
        } else {
            $birthDate = null;
        }

        if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            throw new InvalidArgumentException('Adresse courriel invalide.');
        }

        $email = $email !== '' ? $email : null;
        $address = $address !== '' ? $address : null;
        $notes = $notes !== '' ? $notes : null;

        $this->pdo->beginTransaction();

        try {
            $sql = "
                UPDATE patients
                SET
                    full_name = :full_name,
                    phone = :phone,
                    birth_date = :birth_date,
                    email = :email,
                    address = :address,
                    notes_non_medical = :notes,
                    updated_at = NOW()
                WHERE id = :patient_id
                  AND clinic_id = :clinic_id
                LIMIT 1
            ";

            $stmt = $this->pdo->prepare($sql);
            $stmt->execute([
                ':full_name' => $fullName,
                ':phone' => $phone,
                ':birth_date' => $birthDate,
                ':email' => $email,
                ':address' => $address,
                ':notes' => $notes,
                ':patient_id' => $patientId,
                ':clinic_id' => $clinicId,
            ]);

            $entrySql = "
                UPDATE queue_entries qe
                INNER JOIN queues q
                    ON q.id = qe.queue_id
                SET
                    qe.display_name = :entry_full_name,
                    qe.phone = :entry_phone,
                    qe.birth_date = :entry_birth_date,
                    qe.updated_by_user_id = :entry_actor_user_id
                WHERE qe.patient_id = :entry_patient_id
                  AND qe.clinic_id = :entry_clinic_id
                  AND q.doctor_id = :entry_doctor_id
                  AND q.queue_date = CURRENT_DATE()
            ";

            $entryStmt = $this->pdo->prepare($entrySql);
            $entryStmt->execute([
                ':entry_full_name' => $fullName,
                ':entry_phone' => $phone,
                ':entry_birth_date' => $birthDate,
                ':entry_actor_user_id' => $actorUserId,
                ':entry_patient_id' => $patientId,
                ':entry_clinic_id' => $clinicId,
                ':entry_doctor_id' => $doctorId,
            ]);

            $metadata = json_encode([
                'doctor_id' => $doctorId,
                'previous_full_name' => $existing['full_name'],
                'new_full_name' => $fullName,
            ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);

            $logSql = "
                INSERT INTO activity_logs (
                    clinic_id,
                    actor_user_id,
                    action,
                    entity_type,
                    entity_id,
                    metadata_json,
                    created_at
                ) VALUES (
                    :log_clinic_id,
                    :log_actor_user_id,
                    'PATIENT_UPDATED',
                    'patient',
                    :log_patient_id,
                    :log_metadata_json,
                    NOW()
                )
            ";

            $logStmt = $this->pdo->prepare($logSql);
            $logStmt->execute([
                ':log_clinic_id' => $clinicId,
                ':log_actor_user_id' => $actorUserId,
                ':log_patient_id' => $patientId,
                ':log_metadata_json' => $metadata,
            ]);

            $this->pdo->commit();
        } catch (Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        }

        return $this->findByIdForDoctor(
            $patientId,
            $clinicId,
            $doctorId
        );
    }

    private function findRecentVisits(
        int $patientId,
        int $clinicId,
        int $doctorId
    ): array {
        $sql = "
            SELECT
                v.id,
                v.status,
                v.started_at,
                v.ended_at,
                v.created_at,
                v.queue_entry_id
            FROM visits v
            WHERE v.patient_id = :patient_id
              AND v.clinic_id = :clinic_id
              AND v.doctor_id = :doctor_id
            ORDER BY
                COALESCE(v.ended_at, v.started_at, v.created_at) DESC,
                v.id DESC
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':patient_id' => $patientId,
            ':clinic_id' => $clinicId,
            ':doctor_id' => $doctorId,
        ]);

        return array_map(
            static function (array $row): array {
                return [
                    'id' => (int) $row['id'],
                    'status' => $row['status'],
                    'started_at' => $row['started_at'],
                    'ended_at' => $row['ended_at'],
                    'created_at' => $row['created_at'],
                    'queue_entry_id' => $row['queue_entry_id'] !== null
                        ? (int) $row['queue_entry_id']
                        : null,
                ];
            },
            $stmt->fetchAll()
        );
    }

    private function mapPatientSummary(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'full_name' => $row['full_name'],
            'birth_date' => $row['birth_date'],
            'phone' => PatientDataNormalizer::formatPhoneForDisplay(
                $row['phone'] !== null ? (string) $row['phone'] : null
            ),
            'email' => $row['email'],
            'address' => $row['address'],
            'notes_non_medical' => $row['notes_non_medical'],
            'created_at' => $row['created_at'],
            'last_visit_at' => $row['last_visit_at'],
            'visit_count' => (int) $row['visit_count'],
            'last_queue_status' => $row['last_queue_status'],
        ];
    }
}
