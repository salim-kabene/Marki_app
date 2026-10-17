<?php

declare(strict_types=1);

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$context = require __DIR__ . '/../app/web_bootstrap.php';

function e(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

$capabilities = $context['capabilities'];
$doctor = $context['doctor'];
$doctors = $context['doctors'];
$basePath = rtrim((string) $context['config']['app']['base_path'], '/');
?>
<!DOCTYPE html>
<html lang="fr">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="assets/icons/marki-app-192.png" type="image/png">
    <meta name="csrf-token" content="<?= e($context['csrf_token']) ?>">
    <meta name="marki-base-path" content="<?= e($basePath) ?>">
    <meta name="marki-timezone" content="<?= e($context['timezone']) ?>">
    <script nonce="<?= e($context['csp_nonce']) ?>">
        window.MARKI_CONTEXT = <?= json_encode([
            'capabilities' => $capabilities,
            'role_label' => $context['role_label'],
            'user_id' => (int) $context['user_id'],
            'doctor_id' => (int) $context['doctor_id'],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    </script>
    <title>MARKI — Gestion des patients</title>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="assets/css/styles.css?v=20261017-header2">
    <link rel="stylesheet" href="assets/css/v1-tabs.css?v=20261017-header2">
    <link rel="stylesheet" href="assets/css/session-ui.css?v=20261017-header2">
    <link rel="stylesheet" href="assets/css/password-toggle.css?v=20261017-header2">
    <link rel="stylesheet" href="assets/css/public-registration-admin.css?v=20261017-header2">
    <link rel="stylesheet" href="assets/css/desktop-density.css?v=20261017-header2">

    <script src="assets/js/auth-client.js?v=20261017-header2" defer></script>
    <script src="assets/js/phone-input.js?v=20261017-header2" defer></script>
    <script src="assets/js/password-toggle.js?v=20261017-header2" defer></script>
    <script src="assets/js/algeria-locations.js?v=20261017-header2" defer></script>
    <script src="assets/js/app.js?v=20261017-header2" defer></script>
    <script
        src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"
        integrity="sha512-CNgIRecGo7nphbeZ04Sc13ka07paqdeTu0WR1IM4kNcpmBAUSHSQX0FslNhTDadL4O5SAGapGt4FodqL8My0mA=="
        crossorigin="anonymous"
        referrerpolicy="no-referrer"
        defer
    ></script>
    <script src="assets/js/v1-tabs.js?v=20261017-header2" defer></script>
    <script src="assets/js/public-registration-admin.js?v=20261017-header2" defer></script>
    <script src="assets/js/team.js?v=20261017-header2" defer></script>
    <script src="assets/js/header.js?v=20261017-header2" defer></script>
    <script src="assets/js/marki-motion.js?v=20261017-header2" defer></script>
    <script src="assets/js/help-tips.js?v=20261017-header2" defer></script>
    <script src="assets/js/marki-datepicker.js?v=20261017-header2" defer></script>
    <link rel="stylesheet" href="assets/design-system/marki-theme.css?v=20261017-header2">
</head>

<body>
    <?php require __DIR__ . '/../app/partials/icons_sprite.php'; ?>

    <div class="app">
        <header class="header" data-timezone="<?= e($context['timezone']) ?>">
            <div class="header__profile">
                <div class="avatar">
                    <img src="assets/icons/avatar_docteur01.svg" alt="">
                </div>

                <div class="profile-info">
                    <h1 id="header-doctor-name"><?= e($doctor['display_name']) ?></h1>
                    <p id="header-doctor-specialty"><?= e($doctor['specialty'] ?: 'Médecin') ?></p>

                    <?php if (count($doctors) > 1): ?>
                        <label class="header-doctor-switcher" for="header-doctor-select">
                            <span class="sr-only">Changer de médecin</span>
                            <select id="header-doctor-select">
                                <?php foreach ($doctors as $availableDoctor): ?>
                                    <option
                                        value="<?= (int) $availableDoctor['id'] ?>"
                                        data-specialty="<?= e($availableDoctor['specialty'] ?: 'Médecin') ?>"
                                        <?= (int) $availableDoctor['id'] === (int) $context['doctor_id'] ? 'selected' : '' ?>
                                    >
                                        <?= e($availableDoctor['display_name']) ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </label>
                    <?php endif; ?>
                </div>
            </div>

            <div class="header__right">
                <div class="header__datetime" aria-live="polite">
                    <svg class="mk-icon mk-icon--sm header__datetime-icon" aria-hidden="true"><use href="#mk-clock"></use></svg>
                    <p class="date" id="header-current-date">—</p>
                    <p class="time" id="header-current-time">—</p>
                </div>

                <details class="account-menu">
                    <summary>
                        <?php
                        $accountInitials = '';
                        foreach (array_slice(preg_split('/\s+/u', trim((string) $context['user']['full_name'])) ?: [], 0, 3) as $namePart) {
                            if ($namePart !== '' && !preg_match('/^dr\.?$/iu', $namePart)) {
                                $accountInitials .= mb_strtoupper(mb_substr($namePart, 0, 1));
                            }
                        }
                        ?>
                        <span class="account-menu__avatar" aria-hidden="true"><?= e(mb_substr($accountInitials, 0, 2) ?: '•') ?></span>
                        <span class="account-menu__text">
                            <span class="account-menu__name"><?= e($context['user']['full_name']) ?></span>
                            <span class="account-menu__role"><?= e($context['role_label']) ?></span>
                        </span>
                        <svg class="mk-icon mk-icon--sm account-menu__chevron" aria-hidden="true"><use href="#mk-chevron-down"></use></svg>
                    </summary>
                    <div class="account-menu__panel">
                        <div class="account-menu__identity">
                            <span class="account-menu__eyebrow">Connecté en tant que</span>
                            <strong><?= e($context['user']['full_name']) ?></strong>
                            <span><?= e($context['role_label']) ?></span>
                        </div>
                        <p class="account-menu__clinic">
                            <svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#mk-building"></use></svg>
                            <span><?= e($context['clinic']['name']) ?></span>
                        </p>
                        <a href="change-password.php" class="account-menu__item">
                            <svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#mk-lock"></use></svg>
                            <span>Changer le mot de passe</span>
                        </a>
                        <form action="api/auth_logout.php" method="post">
                            <input type="hidden" name="csrf_token" value="<?= e($context['csrf_token']) ?>">
                            <button type="submit" class="account-menu__item account-menu__item--danger">
                                <svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#mk-log-out"></use></svg>
                                <span>Se déconnecter</span>
                            </button>
                        </form>
                    </div>
                </details>
            </div>
        </header>

        <div class="layout">
            <nav class="sidebar" id="app-sidebar" aria-label="Navigation principale">
                <div class="sidebar__inner">
                    <ul class="sidebar__menu">
                        <?php if ($capabilities['queue.view'] ?? false): ?>
                            <li class="sidebar__item active" data-page="dashboard" tabindex="0" role="button" title="Liste du jour">
                                <i class="icon">
                                    <svg class="mk-icon mk-icon--lg" aria-hidden="true"><use href="#mk-queue"></use></svg>
                                </i>
                                <span>Liste du jour</span>
                            </li>
                        <?php endif; ?>

                        <?php if ($capabilities['patients.view'] ?? false): ?>
                            <li class="sidebar__item" data-page="patients" tabindex="0" role="button" title="Mes Patients">
                                <i class="icon">
                                    <svg class="mk-icon mk-icon--lg" aria-hidden="true"><use href="#mk-patients"></use></svg>
                                </i>
                                <span>Mes Patients</span>
                            </li>
                        <?php endif; ?>

                        <?php if ($capabilities['lists.view'] ?? false): ?>
                            <li class="sidebar__item" data-page="lists" tabindex="0" role="button" title="Toutes les listes">
                                <i class="icon">
                                    <svg class="mk-icon mk-icon--lg" aria-hidden="true"><use href="#mk-archive"></use></svg>
                                </i>
                                <span>Toutes les listes</span>
                            </li>
                        <?php endif; ?>

                        <?php if ($capabilities['settings.view'] ?? false): ?>
                            <li class="sidebar__item" data-page="settings" tabindex="0" role="button" title="Paramètres">
                                <i class="icon">
                                    <svg class="mk-icon mk-icon--lg" aria-hidden="true"><use href="#mk-settings"></use></svg>
                                </i>
                                <span>Paramètres</span>
                            </li>
                        <?php endif; ?>
                    </ul>

                    <div class="sidebar__footer">
                        <button
                            type="button"
                            class="sidebar__toggle"
                            id="sidebarToggleBtn"
                            aria-label="Réduire ou agrandir la barre latérale"
                            title="Réduire le menu"
                        >
                            <span class="sidebar__toggle-icon">
                                <svg class="mk-icon" aria-hidden="true"><use href="#mk-chevron-left"></use></svg>
                            </span>
                            <span class="sidebar__toggle-text">Réduire le menu</span>
                        </button>
                    </div>
                </div>
            </nav>

            <main class="main-content" id="main-content">
                <!-- Les pages internes sont chargées ici. -->
            </main>
        </div>

        <nav class="mobile-bottom-nav" id="mobile-bottom-nav" aria-label="Navigation mobile">
            <ul class="mobile-bottom-nav__list">
                <?php if ($capabilities['queue.view'] ?? false): ?>
                    <li class="mobile-bottom-nav__item active" data-page="dashboard" role="button" tabindex="0">
                        <span class="mobile-bottom-nav__icon">
                            <svg class="mk-icon" aria-hidden="true"><use href="#mk-queue"></use></svg>
                        </span>
                        <span class="mobile-bottom-nav__label">Liste du jour</span>
                    </li>
                <?php endif; ?>

                <?php if ($capabilities['patients.view'] ?? false): ?>
                    <li class="mobile-bottom-nav__item" data-page="patients" role="button" tabindex="0">
                        <span class="mobile-bottom-nav__icon">
                            <svg class="mk-icon" aria-hidden="true"><use href="#mk-patients"></use></svg>
                        </span>
                        <span class="mobile-bottom-nav__label">Patients</span>
                    </li>
                <?php endif; ?>

                <?php if ($capabilities['queue.manage'] ?? false): ?>
                    <li class="mobile-bottom-nav__fab-slot">
                        <button
                            type="button"
                            class="mobile-bottom-nav__fab"
                            id="mobileFabAddPatient"
                            aria-label="Ajouter un patient"
                            title="Nouveau patient"
                        >
                            <svg class="mk-icon" aria-hidden="true"><use href="#mk-plus"></use></svg>
                        </button>
                    </li>
                <?php endif; ?>

                <?php if ($capabilities['lists.view'] ?? false): ?>
                    <li class="mobile-bottom-nav__item" data-page="lists" role="button" tabindex="0">
                        <span class="mobile-bottom-nav__icon">
                            <svg class="mk-icon" aria-hidden="true"><use href="#mk-archive"></use></svg>
                        </span>
                        <span class="mobile-bottom-nav__label">Listes</span>
                    </li>
                <?php endif; ?>

                <?php if ($capabilities['settings.view'] ?? false): ?>
                    <li class="mobile-bottom-nav__item" data-page="settings" role="button" tabindex="0">
                        <span class="mobile-bottom-nav__icon">
                            <svg class="mk-icon" aria-hidden="true"><use href="#mk-settings"></use></svg>
                        </span>
                        <span class="mobile-bottom-nav__label">Paramètres</span>
                    </li>
                <?php endif; ?>
            </ul>
        </nav>
    </div>
    <div
        class="marki-toast-container"
        id="marki-toast-container"
        aria-live="polite"
        aria-atomic="true"
    ></div>

</body>

</html>
