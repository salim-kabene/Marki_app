<?php

declare(strict_types=1);

$public = require __DIR__ . '/../../app/public_bootstrap.php';

function e(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

$sessionToken = trim((string) ($_GET['session'] ?? ''));
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
    <title>MARKI — Suivi en direct de votre passage</title>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="../assets/design-system/marki-theme.css?v=20261007-wait1">
    <link rel="stylesheet" href="assets/registration.css?v=20261007-wait1">
    <script src="assets/status.js?v=20261007-wait1" defer></script>
</head>
<body>
    <?php require __DIR__ . '/../../app/partials/icons_sprite.php'; ?>

    <main
        class="public-registration-shell public-status-shell"
        id="public-status-app"
        data-session="<?= e($sessionToken) ?>"
    >
        <header class="public-registration-brand">
            <a class="public-registration-brand__logo" href="#" aria-label="MARKI">
                <span class="public-registration-brand__mark">M</span>
                <span>MARKI</span>
            </a>
            <div class="public-registration-brand__secure">
                <span class="public-registration-secure-dot" aria-hidden="true"></span>
                <svg class="mk-icon mk-icon--xs" aria-hidden="true"><use href="#mk-shield-check"></use></svg>
                <span>Inscription sécurisée &amp; privée</span>
            </div>
        </header>

        <div id="status-loading" class="public-registration-card public-registration-loading" role="status">
            <span class="public-registration-spinner" aria-hidden="true"></span>
            <span>Synchronisation de votre inscription en direct…</span>
        </div>

        <div id="status-error" class="public-registration-card public-registration-state" hidden>
            <div class="public-registration-state__icon" aria-hidden="true">
                <svg class="mk-icon mk-icon--lg"><use href="#mk-alert-circle"></use></svg>
            </div>
            <h1 id="status-error-title">Suivi indisponible</h1>
            <p id="status-error-message"></p>
        </div>

        <div id="status-content" class="public-status-layout" hidden>
            <div class="public-status-main">
                <section class="public-status-doctor" aria-label="Votre médecin">
                    <span class="public-status-doctor__avatar" aria-hidden="true">
                        <svg class="mk-icon"><use href="#mk-user"></use></svg>
                    </span>
                    <div class="public-status-doctor__text">
                        <strong id="status-doctor-name">—</strong>
                        <span id="status-doctor-line">—</span>
                        <small id="status-clinic-name">—</small>
                    </div>
                    <span class="public-status-doctor__clinic" aria-hidden="true">
                        <svg class="mk-icon"><use href="#mk-building"></use></svg>
                    </span>
                </section>

                <section class="public-status-hero" aria-labelledby="status-label">
                    <div class="public-status-hero__head">
                        <div class="public-status-hero__text">
                            <p class="public-status-hero__eyebrow">Votre position dans la file</p>
                            <h1 id="status-label">—</h1>
                            <p id="status-guidance" class="public-registration-notice"></p>
                        </div>
                        <svg class="public-status-hero__art" viewBox="0 0 120 96" aria-hidden="true">
                            <circle cx="30" cy="36" r="11" fill="#fff" fill-opacity=".38"/>
                            <path d="M10 82c0-13 9-22 20-22s20 9 20 22z" fill="#fff" fill-opacity=".38"/>
                            <circle cx="90" cy="36" r="11" fill="#fff" fill-opacity=".38"/>
                            <path d="M70 82c0-13 9-22 20-22s20 9 20 22z" fill="#fff" fill-opacity=".38"/>
                            <circle cx="60" cy="28" r="15" fill="#fff" fill-opacity=".72"/>
                            <circle cx="60" cy="28" r="5" fill="#000" fill-opacity=".18"/>
                            <path d="M33 86c0-17 12-29 27-29s27 12 27 29z" fill="#fff" fill-opacity=".72"/>
                        </svg>
                    </div>

                    <div class="public-status-stats">
                        <article class="public-status-stat public-status-stat--number">
                            <header>
                                <span class="public-status-stat__icon" aria-hidden="true">
                                    <svg class="mk-icon"><use href="#mk-ticket"></use></svg>
                                </span>
                                <span>Votre numéro</span>
                            </header>
                            <strong id="status-position">—</strong>
                        </article>

                        <article class="public-status-stat public-status-stat--ahead">
                            <header>
                                <span class="public-status-stat__icon" aria-hidden="true">
                                    <svg class="mk-icon"><use href="#mk-users"></use></svg>
                                </span>
                                <span>Personnes restantes</span>
                            </header>
                            <strong id="status-ahead">—</strong>
                            <small id="status-ahead-note">avant votre tour</small>
                        </article>
                    </div>
                </section>
            </div>

            <div class="public-status-side">
                <ol class="public-status-steps" id="status-steps" aria-label="Étapes de votre passage">
                    <li class="public-status-step" data-step="registered">
                        <span class="public-status-step__dot" aria-hidden="true">
                            <svg class="mk-icon mk-icon--sm"><use href="#mk-check"></use></svg>
                            <span>1</span>
                        </span>
                        <strong>Inscription</strong>
                        <small id="status-step-time">—</small>
                    </li>
                    <li class="public-status-step" data-step="waiting">
                        <span class="public-status-step__dot" aria-hidden="true">
                            <svg class="mk-icon mk-icon--sm"><use href="#mk-check"></use></svg>
                            <span>2</span>
                        </span>
                        <strong>En attente</strong>
                        <small data-step-note>Vous êtes ici</small>
                    </li>
                    <li class="public-status-step" data-step="consultation">
                        <span class="public-status-step__dot" aria-hidden="true">
                            <svg class="mk-icon mk-icon--sm"><use href="#mk-check"></use></svg>
                            <span>3</span>
                        </span>
                        <strong>Consultation</strong>
                        <small data-step-note>Bientôt !</small>
                    </li>
                </ol>

                <section class="public-status-tile public-status-tile--live">
                    <span class="public-status-tile__icon" aria-hidden="true">
                        <svg class="mk-icon"><use href="#mk-radio"></use></svg>
                    </span>
                    <div>
                        <strong>Mise à jour en temps réel</strong>
                        <p>Cette page se met à jour automatiquement. Dernière actualisation à <span id="status-refreshed-at">—</span>.</p>
                    </div>
                </section>

                <section class="public-status-tile public-status-tile--notify" id="status-notify-card" hidden>
                    <span class="public-status-tile__icon" aria-hidden="true">
                        <svg class="mk-icon"><use href="#mk-bell"></use></svg>
                    </span>
                    <div>
                        <strong id="status-notify-label">Notification</strong>
                        <p id="status-notify-hint">Recevez une alerte sonore quand ce sera presque votre tour.</p>
                    </div>
                    <button
                        type="button"
                        id="status-notify"
                        class="public-status-switch"
                        role="switch"
                        aria-checked="false"
                        aria-labelledby="status-notify-label"
                        aria-describedby="status-notify-hint"
                    ></button>
                </section>

                <div class="public-status-actions">
                    <button type="button" id="status-refresh" class="public-registration-button public-status-refresh">
                        <svg class="mk-icon" aria-hidden="true"><use href="#mk-refresh-cw"></use></svg>
                        <span>Actualiser maintenant</span>
                    </button>
                    <div id="status-message" class="public-registration-message" role="status" aria-live="polite"></div>
                </div>

                <section class="public-status-details" aria-labelledby="status-title">
                    <h2 id="status-title">Votre inscription</h2>
                    <dl>
                        <div>
                            <dt>Patient</dt>
                            <dd id="status-patient-name">—</dd>
                        </div>
                        <div>
                            <dt>Téléphone associé</dt>
                            <dd id="status-phone">—</dd>
                        </div>
                        <div>
                            <dt>Inscrit le</dt>
                            <dd id="status-created-at">—</dd>
                        </div>
                    </dl>
                    <button type="button" id="status-cancel" class="public-status-cancel" hidden>
                        <svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#mk-x"></use></svg>
                        <span>Annuler mon inscription</span>
                    </button>
                </section>
            </div>
        </div>
    </main>

    <div id="status-cancel-modal" class="public-registration-modal" hidden aria-hidden="true">
        <button type="button" class="public-registration-modal__backdrop" data-close-status-modal aria-label="Fermer"></button>
        <div class="public-registration-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="status-cancel-title">
            <h2 id="status-cancel-title">Annuler votre inscription à la liste d’attente ?</h2>
            <p>Votre inscription sera annulée et vous quitterez la file. Pour revenir, vous devrez vous réinscrire via le QR code ou contacter le secrétariat.</p>
            <div class="public-registration-modal__actions">
                <button type="button" class="public-registration-button public-registration-button--secondary" data-close-status-modal>Retour</button>
                <button type="button" class="public-registration-button public-registration-button--danger" id="status-confirm-cancel">Confirmer l’annulation</button>
            </div>
        </div>
    </div>
</body>
</html>
