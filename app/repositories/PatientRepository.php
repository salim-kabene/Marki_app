<?php

declare(strict_types=1);

require_once __DIR__ . '/../db.php';

class PatientRepository
{
    private PDO $pdo;

    public function __construct()
    {
        $this->pdo = db();
    }

    public function findExisting(
        int $clinicId,
        ?string $phone,
        string $fullName,
        ?string $birthDate
    ): ?array {
        $phone = $phone !== null ? trim($phone) : null;
        $fullName = trim($fullName);
        $birthDate = $birthDate !== null ? trim($birthDate) : null;

        if ($phone !== null && $phone !== '') {
            $sql = "
                SELECT
                    id,
                    clinic_id,
                    full_name,
                    birth_date,
                    phone,
                    email,
                    address,
                    notes_non_medical,
                    created_at,
                    updated_at
                FROM patients
                WHERE clinic_id = :clinic_id
                  AND phone = :phone
                LIMIT 1
            ";

            $stmt = $this->pdo->prepare($sql);
            $stmt->execute([
                ':clinic_id' => $clinicId,
                ':phone' => $phone,
            ]);

            $patient = $stmt->fetch();

            if ($patient) {
                return $patient;
            }
        }

        if ($fullName !== '' && $birthDate !== null && $birthDate !== '') {
            $sql = "
                SELECT
                    id,
                    clinic_id,
                    full_name,
                    birth_date,
                    phone,
                    email,
                    address,
                    notes_non_medical,
                    created_at,
                    updated_at
                FROM patients
                WHERE clinic_id = :clinic_id
                  AND full_name = :full_name
                  AND birth_date = :birth_date
                LIMIT 1
            ";

            $stmt = $this->pdo->prepare($sql);
            $stmt->execute([
                ':clinic_id' => $clinicId,
                ':full_name' => $fullName,
                ':birth_date' => $birthDate,
            ]);

            $patient = $stmt->fetch();

            if ($patient) {
                return $patient;
            }
        }

        return null;
    }

    public function create(
        int $clinicId,
        string $fullName,
        ?string $phone,
        ?string $birthDate
    ): array {
        $fullName = trim($fullName);
        $phone = $phone !== null ? trim($phone) : null;
        $birthDate = $birthDate !== null ? trim($birthDate) : null;

        if ($fullName === '') {
            throw new InvalidArgumentException('Le nom complet est obligatoire.');
        }

        $sql = "
            INSERT INTO patients (
                clinic_id,
                full_name,
                birth_date,
                phone,
                created_at,
                updated_at
            ) VALUES (
                :clinic_id,
                :full_name,
                :birth_date,
                :phone,
                NOW(),
                NOW()
            )
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':clinic_id' => $clinicId,
            ':full_name' => $fullName,
            ':birth_date' => $birthDate !== '' ? $birthDate : null,
            ':phone' => $phone !== '' ? $phone : null,
        ]);

        $patientId = (int) $this->pdo->lastInsertId();

        return $this->findById($patientId, $clinicId);
    }

    public function findById(int $patientId, int $clinicId): array
    {
        $sql = "
            SELECT
                id,
                clinic_id,
                full_name,
                birth_date,
                phone,
                email,
                address,
                notes_non_medical,
                created_at,
                updated_at
            FROM patients
            WHERE id = :id
              AND clinic_id = :clinic_id
            LIMIT 1
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':id' => $patientId,
            ':clinic_id' => $clinicId,
        ]);

        $patient = $stmt->fetch();

        if (!$patient) {
            throw new RuntimeException('Patient introuvable après création.');
        }

        return $patient;
    }
}