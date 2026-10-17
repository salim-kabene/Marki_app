<?php

declare(strict_types=1);

$public = require __DIR__ . '/../app/public_bootstrap.php';
$config = $public['config'];

require_once __DIR__ . '/../app/platform/StructureInvitationRepository.php';

function activationE(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

$repository = new StructureInvitationRepository();
$token = trim((string) ($_GET['token'] ?? $_POST['token'] ?? ''));
$invitation = $repository->findValidInvitation($token);
$message = '';
$fieldErrors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $invitation !== null) {
    try {
        Auth::validateCsrf(
            (string) ($_POST['csrf_token'] ?? '')
        );

        $result = $repository->activateStructure(
            $token,
            $_POST,
            (int) ($config['auth']['password_min_length'] ?? 10)
        );

        $loginUrl = rtrim(
            (string) $config['app']['base_path'],
            '/'
        ) . '/login.php?clinic=' . rawurlencode(
            (string) $result['clinic_slug']
        ) . '&activated=1';

        header('Location: ' . $loginUrl);
        exit;
    } catch (StructureActivationValidationException $exception) {
        $message = $exception->getMessage();
        $fieldErrors = $exception->errors();
        $invitation = $repository->findValidInvitation($token);
    } catch (AuthException $exception) {
        $message = $exception->getMessage();
    } catch (Throwable $exception) {
        $message = (bool) ($config['app']['debug'] ?? false)
            ? $exception->getMessage()
            : 'Impossible d’activer votre espace MARKI.';
    }
}

$recipientEmail = (string) (
    $_POST['email']
    ?? $invitation['recipient_email']
    ?? ''
);
$recipientName = (string) (
    $_POST['full_name']
    ?? $invitation['recipient_label']
    ?? ''
);
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Activer votre espace — MARKI</title>
    <link rel="stylesheet" href="assets/css/auth.css?v=20260801-preqr1">
    <link rel="stylesheet" href="assets/css/platform-setup.css?v=20260801-preqr1">
    <link rel="stylesheet" href="assets/css/password-toggle.css?v=20260801-preqr1">
    <link rel="stylesheet" href="assets/design-system/marki-theme.css?v=20260803-design-ready1">
</head>
<body class="activation-page">
    <main class="activation-shell">
        <div class="activation-brand">
            <span class="auth-brand__mark">M</span>
            <div>
                <h1>MARKI</h1>
                <p>Activation de votre espace professionnel</p>
            </div>
        </div>

        <?php if ($invitation === null): ?>
            <section class="activation-invalid">
                <h2>Lien indisponible</h2>
                <p>Cette invitation est invalide, expirée, révoquée ou a déjà été utilisée.</p>
                <p>Demandez un nouveau lien à l’équipe MARKI.</p>
            </section>
        <?php else: ?>
            <header class="activation-header">
                <p class="platform-eyebrow">Première configuration</p>
                <h2>Créez votre cabinet ou votre clinique</h2>
                <p>Vous deviendrez le premier médecin administrateur de cette structure. Vous pourrez ensuite créer les comptes de votre équipe dans MARKI.</p>
            </header>

            <?php if ($message !== ''): ?>
                <div class="platform-message is-error" role="alert">
                    <?= activationE($message) ?>
                </div>
            <?php endif; ?>

            <form method="post" class="activation-form" novalidate>
                <input type="hidden" name="csrf_token" value="<?= activationE($public['csrf_token']) ?>">
                <input type="hidden" name="token" value="<?= activationE($token) ?>">

                <section class="activation-section">
                    <div class="activation-section__header">
                        <span>1</span>
                        <div>
                            <h3>Votre structure</h3>
                            <p>Informations du cabinet ou de la clinique.</p>
                        </div>
                    </div>

                    <div class="activation-grid">
                        <label class="activation-field activation-field--wide <?= isset($fieldErrors['clinic_name']) ? 'has-error' : '' ?>">
                            <span>Nom du cabinet ou de la clinique <strong>*</strong></span>
                            <input type="text" name="clinic_name" value="<?= activationE($_POST['clinic_name'] ?? '') ?>" required>
                            <small><?= activationE($fieldErrors['clinic_name'] ?? '') ?></small>
                        </label>

                        <label class="activation-field <?= isset($fieldErrors['clinic_type']) ? 'has-error' : '' ?>">
                            <span>Type de structure <strong>*</strong></span>
                            <select name="clinic_type" required>
                                <option value="solo" <?= ($_POST['clinic_type'] ?? 'solo') === 'solo' ? 'selected' : '' ?>>Cabinet individuel</option>
                                <option value="clinic" <?= ($_POST['clinic_type'] ?? '') === 'clinic' ? 'selected' : '' ?>>Clinique</option>
                            </select>
                            <small><?= activationE($fieldErrors['clinic_type'] ?? '') ?></small>
                        </label>

                        <label class="activation-field">
                            <span>Téléphone de la structure</span>
                            <input type="tel" name="clinic_phone" value="<?= activationE($_POST['clinic_phone'] ?? '') ?>" autocomplete="tel" data-dz-phone-auto>
                        </label>

                        <label class="activation-field activation-field--wide">
                            <span>Adresse</span>
                            <input type="text" name="clinic_address" value="<?= activationE($_POST['clinic_address'] ?? '') ?>" autocomplete="street-address">
                        </label>

                        <div class="activation-location-fields activation-field--wide" data-algeria-location-group>
                            <label class="activation-field">
                                <span>Wilaya / région</span>
                                <select name="clinic_wilaya" data-algeria-wilaya data-initial-value="<?= activationE($_POST['clinic_wilaya'] ?? '') ?>">
                                    <option value="">Choisir une wilaya</option>
                                </select>
                            </label>

                            <label class="activation-field">
                                <span>Ville / commune</span>
                                <input type="text" name="clinic_city" value="<?= activationE($_POST['clinic_city'] ?? '') ?>" list="activation-city-options" data-algeria-city autocomplete="address-level2">
                                <datalist id="activation-city-options"></datalist>
                            </label>
                        </div>

                        <label class="activation-field activation-field--wide <?= isset($fieldErrors['clinic_timezone']) ? 'has-error' : '' ?>">
                            <span>Fuseau horaire <strong>*</strong></span>
                            <span class="activation-timezone-wrap">
                                <img id="activation-timezone-flag" class="activation-timezone-flag" src="assets/icons/flags/dz.svg" alt="">
                                <select id="activation-timezone" name="clinic_timezone" required>
                                <?php
                                $selectedTimezone = (string) ($_POST['clinic_timezone'] ?? 'Africa/Algiers');
                                $timezones = [
                                    'Africa/Algiers' => 'Algérie — Africa/Algiers',
                                    'America/Toronto' => 'Canada — America/Toronto',
                                    'Europe/Paris' => 'France — Europe/Paris',
                                    'Africa/Tunis' => 'Tunisie — Africa/Tunis',
                                    'America/New_York' => 'États-Unis — America/New_York',
                                ];
                                foreach ($timezones as $value => $label):
                                ?>
                                    <option value="<?= activationE($value) ?>" <?= $selectedTimezone === $value ? 'selected' : '' ?>><?= activationE($label) ?></option>
                                <?php endforeach; ?>
                                </select>
                            </span>
                            <small><?= activationE($fieldErrors['clinic_timezone'] ?? '') ?></small>
                        </label>
                    </div>
                </section>

                <section class="activation-section">
                    <div class="activation-section__header">
                        <span>2</span>
                        <div>
                            <h3>Votre compte médecin administrateur</h3>
                            <p>Ce compte gérera la structure, les médecins et le secrétariat.</p>
                        </div>
                    </div>

                    <div class="activation-grid">
                        <label class="activation-field activation-field--wide <?= isset($fieldErrors['full_name']) ? 'has-error' : '' ?>">
                            <span>Nom complet <strong>*</strong></span>
                            <input type="text" name="full_name" value="<?= activationE($recipientName) ?>" autocomplete="name" required>
                            <small><?= activationE($fieldErrors['full_name'] ?? '') ?></small>
                        </label>

                        <label class="activation-field <?= isset($fieldErrors['email']) ? 'has-error' : '' ?>">
                            <span>Courriel</span>
                            <input type="email" name="email" value="<?= activationE($recipientEmail) ?>" autocomplete="email">
                            <small><?= activationE($fieldErrors['email'] ?? '') ?></small>
                        </label>

                        <label class="activation-field <?= isset($fieldErrors['phone']) ? 'has-error' : '' ?>">
                            <span>Téléphone mobile</span>
                            <input
                                type="tel"
                                id="activation-phone"
                                name="phone"
                                value="<?= activationE($_POST['phone'] ?? '') ?>"
                                inputmode="numeric"
                                autocomplete="tel"
                                maxlength="13"
                                placeholder="0550 80 30 90"
                                data-dz-mobile
                            >
                            <small><?= activationE($fieldErrors['phone'] ?? '') ?></small>
                        </label>

                        <p class="activation-help activation-field--wide">Un courriel ou un téléphone mobile est obligatoire.</p>

                        <label class="activation-field <?= isset($fieldErrors['password']) ? 'has-error' : '' ?>">
                            <span>Mot de passe <strong>*</strong></span>
                            <input type="password" name="password" autocomplete="new-password" required>
                            <small><?= activationE($fieldErrors['password'] ?? '') ?></small>
                        </label>

                        <label class="activation-field <?= isset($fieldErrors['password_confirmation']) ? 'has-error' : '' ?>">
                            <span>Confirmer le mot de passe <strong>*</strong></span>
                            <input type="password" name="password_confirmation" autocomplete="new-password" required>
                            <small><?= activationE($fieldErrors['password_confirmation'] ?? '') ?></small>
                        </label>

                        <p class="activation-help activation-field--wide">10 caractères minimum, avec une majuscule, une minuscule et un chiffre.</p>
                    </div>
                </section>

                <section class="activation-section">
                    <div class="activation-section__header">
                        <span>3</span>
                        <div>
                            <h3>Votre profil professionnel</h3>
                            <p>Informations visibles dans l’espace médical.</p>
                        </div>
                    </div>

                    <div class="activation-grid">
                        <label class="activation-field activation-field--wide <?= isset($fieldErrors['doctor_display_name']) ? 'has-error' : '' ?>">
                            <span>Nom affiché du médecin <strong>*</strong></span>
                            <input type="text" name="doctor_display_name" value="<?= activationE($_POST['doctor_display_name'] ?? $recipientName) ?>" required>
                            <small><?= activationE($fieldErrors['doctor_display_name'] ?? '') ?></small>
                        </label>

                        <label class="activation-field activation-field--wide">
                            <span>Spécialité</span>
                            <input type="text" name="doctor_specialty" value="<?= activationE($_POST['doctor_specialty'] ?? '') ?>" placeholder="Médecine générale">
                        </label>

                        <label class="activation-field">
                            <span>Numéro d’agrément / licence</span>
                            <input type="text" name="doctor_license_number" value="<?= activationE($_POST['doctor_license_number'] ?? '') ?>">
                        </label>

                        <label class="activation-field">
                            <span>Adresse professionnelle</span>
                            <input type="text" name="doctor_address" value="<?= activationE($_POST['doctor_address'] ?? '') ?>">
                        </label>
                    </div>
                </section>

                <button type="submit" class="activation-submit">Créer et activer mon espace MARKI</button>
                <p class="activation-legal">Ce lien est personnel, utilisable une seule fois et expirera le <?= activationE(markiFormatFrenchDateTime((string) $invitation['expires_at'])) ?>.</p>
            </form>
        <?php endif; ?>
    </main>

    <script nonce="<?= activationE($public['csp_nonce']) ?>">
        (function () {
            const fullName = document.querySelector('[name="full_name"]');
            const doctorName = document.querySelector('[name="doctor_display_name"]');

            fullName?.addEventListener('input', () => {
                if (doctorName && !doctorName.dataset.edited) {
                    doctorName.value = fullName.value;
                }
            });

            doctorName?.addEventListener('input', () => {
                doctorName.dataset.edited = 'true';
            });
        })();
    </script>
    <script src="assets/js/phone-input.js?v=20260801-preqr1" defer></script>
    <script src="assets/js/password-toggle.js?v=20260801-preqr1" defer></script>
    <script src="assets/js/algeria-locations.js?v=20260802-local1" defer></script>
    <script nonce="<?= activationE($public['csp_nonce']) ?>">
    document.addEventListener('DOMContentLoaded', () => {
      const select = document.getElementById('activation-timezone');
      const flag = document.getElementById('activation-timezone-flag');
      const flags = {
        'Africa/Algiers': 'dz.svg', 'America/Toronto': 'ca.svg',
        'Europe/Paris': 'fr.svg', 'Africa/Tunis': 'tn.svg',
        'America/New_York': 'us.svg'
      };
      const update = () => { if (select && flag) flag.src = `assets/icons/flags/${flags[select.value] || 'dz.svg'}`; };
      select?.addEventListener('change', update); update();
    });
    </script>
</body>
</html>
