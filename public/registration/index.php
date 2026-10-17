<?php

declare(strict_types=1);

$public = require __DIR__ . '/../../app/public_bootstrap.php';

function e(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

$link = trim((string) ($_GET['link'] ?? ''));
$token = trim((string) ($_GET['token'] ?? ''));
$basePath = rtrim((string) ($public['config']['app']['base_path'] ?? ''), '/');
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="../assets/icons/marki-app-192.png" type="image/png">
    <meta name="theme-color" content="#6d4aff">
    <meta name="csrf-token" content="<?= e($public['csrf_token']) ?>">
    <meta name="marki-base-path" content="<?= e($basePath) ?>">
    <title>MARKI — Inscription à la liste d’attente</title>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="../assets/design-system/marki-theme.css?v=20261017-dates1">
    <link rel="stylesheet" href="assets/registration.css?v=20260830-ui1">
    <script src="../assets/js/phone-input.js?v=20260830-ui1" defer></script>
    <script src="assets/registration.js?v=20260830-ui1" defer></script>
    <script src="../assets/js/marki-datepicker.js?v=20261017-dates1" defer></script>
</head>
<body>
    <?php require __DIR__ . '/../../app/partials/icons_sprite.php'; ?>

    <main
        class="public-registration-shell"
        id="public-registration-app"
        data-link="<?= e($link) ?>"
        data-token="<?= e($token) ?>"
    >
        <header class="public-registration-brand">
            <a class="public-registration-brand__logo" href="#" aria-label="MARKI">
                <span class="public-registration-brand__mark">M</span>
                <span>MARKI</span>
            </a>
            <div class="public-registration-brand__secure">
                <span class="public-registration-secure-dot" aria-hidden="true"></span>
                <svg class="mk-icon mk-icon--xs" aria-hidden="true"><use href="#mk-shield-check"></use></svg>
                <span>Inscription sécurisée & privée</span>
            </div>
        </header>

        <section class="public-registration-card" aria-labelledby="registration-title">
            <div class="public-registration-card__hero">
                <div class="public-registration-card__icon" aria-hidden="true">
                    <svg class="mk-icon mk-icon--md"><use href="#mk-user-plus"></use></svg>
                </div>
                <div class="public-registration-card__hero-text">
                    <p class="public-registration-eyebrow">Salle d’attente</p>
                    <h1 id="registration-title">Rejoindre la file</h1>
                    <p id="registration-introduction">
                        Prenez votre numéro de passage en quelques secondes.
                    </p>
                </div>
            </div>

            <div id="registration-loading" class="public-registration-loading" role="status">
                <span class="public-registration-spinner" aria-hidden="true"></span>
                <span>Vérification du lien et des disponibilités…</span>
            </div>

            <div id="registration-unavailable" class="public-registration-state" hidden>
                <div class="public-registration-state__icon" aria-hidden="true">
                    <svg class="mk-icon mk-icon--lg"><use href="#mk-info"></use></svg>
                </div>
                <h2 id="registration-unavailable-title">Inscription indisponible</h2>
                <p id="registration-unavailable-message"></p>
                <div class="public-registration-contact" id="registration-contact" hidden></div>
            </div>

            <div id="registration-content" hidden>
                <div class="public-registration-doctor">
                    <div class="public-registration-doctor__avatar" aria-hidden="true">
                        <svg class="mk-icon mk-icon--lg"><use href="#mk-user"></use></svg>
                    </div>
                    <div>
                        <strong id="registration-doctor-name">—</strong>
                        <span id="registration-doctor-specialty">—</span>
                        <small id="registration-clinic-name">—</small>
                    </div>
                </div>

                <div class="public-registration-notice public-registration-notice--success" id="registration-open-message"></div>

                <form id="public-registration-form" class="public-registration-form" novalidate>
                    <div class="public-registration-field">
                        <label for="registration-full-name">
                            Nom complet <span aria-hidden="true">*</span>
                        </label>
                        <div class="public-input-wrapper">
                            <input
                                type="text"
                                id="registration-full-name"
                                name="full_name"
                                autocomplete="name"
                                maxlength="191"
                                placeholder="Votre nom et prénom"
                                required
                            >
                            <svg class="mk-icon mk-icon--sm public-input-icon" aria-hidden="true"><use href="#mk-user"></use></svg>
                        </div>
                        <small class="public-registration-error" data-error-for="full_name"></small>
                    </div>

                    <div class="public-registration-field">
                        <label for="registration-phone">
                            Numéro de téléphone <span aria-hidden="true">*</span>
                        </label>
                        <div class="public-input-wrapper">
                            <input
                                type="tel"
                                id="registration-phone"
                                name="phone"
                                inputmode="numeric"
                                autocomplete="tel"
                                maxlength="13"
                                placeholder="05XX / 06XX / 07XX"
                                data-dz-mobile
                                required
                            >
                            <svg class="mk-icon mk-icon--sm public-input-icon" aria-hidden="true"><use href="#mk-phone"></use></svg>
                        </div>
                        <small class="public-registration-hint">Format : 0550 80 30 90</small>
                        <small class="public-registration-error" data-error-for="phone"></small>
                    </div>

                    <div class="public-registration-field" id="registration-birth-date-field">
                        <label for="registration-birth-date">
                            Date de naissance
                            <span id="registration-birth-date-required" aria-hidden="true" hidden>*</span>
                        </label>
                        <div class="public-input-wrapper">
                            <input
                                type="text"
                                id="registration-birth-date"
                                name="birth_date"
                                inputmode="numeric"
                                maxlength="10"
                                placeholder="JJ/MM/AAAA"
                                autocomplete="bday"
                            >
                            <svg class="mk-icon mk-icon--sm public-input-icon" aria-hidden="true"><use href="#mk-calendar"></use></svg>
                        </div>
                        <small class="public-registration-error" data-error-for="birth_date"></small>
                    </div>

                    <label class="public-registration-consent">
                        <input
                            type="checkbox"
                            id="registration-privacy-consent"
                            name="privacy_consent"
                            value="1"
                            required
                        >
                        <span>
                            J’accepte que mes informations soient utilisées uniquement par le cabinet médical pour gérer mon passage dans la liste d’attente.
                        </span>
                    </label>
                    <small class="public-registration-error" data-error-for="privacy_consent"></small>

                    <div id="registration-shared-phone" class="public-registration-notice public-registration-notice--warning" hidden>
                        <strong>Numéro familial détecté</strong>
                        <p id="registration-shared-phone-message"></p>
                        <button type="button" id="registration-confirm-shared-phone" class="public-registration-button public-registration-button--warning">
                            Confirmer et continuer
                        </button>
                    </div>

                    <div id="registration-form-message" class="public-registration-message" role="alert" aria-live="polite"></div>

                    <button type="submit" id="registration-submit" class="public-registration-button public-registration-button--primary">
                        <svg class="mk-icon" aria-hidden="true"><use href="#mk-user-plus"></use></svg>
                        <span>Rejoindre la liste d’attente</span>
                    </button>
                </form>

                <p class="public-registration-privacy-note">
                    <svg class="mk-icon mk-icon--xs" aria-hidden="true"><use href="#mk-lock"></use></svg>
                    <span>Votre numéro et votre suivi restent strictement confidentiels et privés.</span>
                </p>
            </div>
        </section>

        <footer class="public-registration-footer">
            <span>Service propulsé par <strong>MARKI</strong></span>
        </footer>
    </main>
</body>
</html>
