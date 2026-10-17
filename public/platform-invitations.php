<?php

declare(strict_types=1);

$public = require __DIR__ . '/../app/public_bootstrap.php';
$config = $public['config'];
markiEnforcePlatformIpAllowlist($config);

require_once __DIR__ . '/../app/platform/StructureInvitationRepository.php';
require_once __DIR__ . '/../app/platform/PlatformAuth.php';

function platformE(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function platformShortcutIcon(): string
{
    return '<svg viewBox="0 0 24 24" aria-hidden="true">'
        . '<path d="M12 3v11m0 0 4-4m-4 4-4-4"/>'
        . '<path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>'
        . '</svg>';
}

function platformAbsoluteBaseUrl(array $config): string
{
    $basePath = rtrim(
        (string) ($config['app']['base_path'] ?? ''),
        '/'
    );

    return markiApplicationOrigin($config) . $basePath;
}

$platformLoginError = '';
$platformAdmin = null;

if (
    $_SERVER['REQUEST_METHOD'] === 'POST'
    && (string) ($_POST['action'] ?? '') === 'platform_login'
) {
    try {
        Auth::validateCsrf((string) ($_POST['csrf_token'] ?? ''));
        PlatformAuth::attemptLogin(
            $config,
            (string) ($_POST['email'] ?? ''),
            (string) ($_POST['password'] ?? ''),
            !empty($_POST['remember'])
        );

        header(
            'Location: '
            . rtrim((string) $config['app']['base_path'], '/')
            . '/platform-invitations.php'
        );
        exit;
    } catch (PlatformAuthException | AuthException $exception) {
        $platformLoginError = $exception->getMessage();
    } catch (PDOException $exception) {
        $platformLoginError = str_contains($exception->getMessage(), 'platform_admins')
            ? 'La migration des comptes administrateurs MARKI n’est pas encore installée.'
            : 'Impossible de joindre la base de données. Vérifiez le fichier .env et le compte MySQL marki_app.';
    } catch (Throwable $exception) {
        $platformLoginError = (bool) ($config['app']['debug'] ?? false)
            ? $exception->getMessage()
            : 'Impossible d’ouvrir l’administration MARKI.';
    }
}

try {
    $platformAdmin = PlatformAuth::current($config);
} catch (Throwable $exception) {
    $platformLoginError = (bool) ($config['app']['debug'] ?? false)
        ? $exception->getMessage()
        : 'Impossible de vérifier la session administrateur.';
}

if ($platformAdmin === null) {
    ?>
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="icon" href="assets/icons/marki-app-192.png" type="image/png">
        <title>Administration MARKI</title>
        <link rel="stylesheet" href="assets/css/auth.css?v=20260802-platform4">
        <link rel="stylesheet" href="assets/css/password-toggle.css?v=20260802-platform4">
        <link rel="stylesheet" href="assets/css/platform-setup.css?v=20260802-platform4">
        <link rel="stylesheet" href="assets/css/desktop-density.css?v=20260803-final2">
        <link rel="stylesheet" href="assets/design-system/marki-theme.css?v=20260803-design-ready1">
</head>
    <body class="platform-page">
        <main class="platform-shell platform-shell--login">
            <section class="platform-card platform-login-card">
                <a
                    class="platform-icon-button platform-login-shortcut"
                    href="download-shortcut.php?type=platform"
                    aria-label="Créer le raccourci de l’administration MARKI"
                    title="Créer le raccourci MARKI sur le Bureau"
                    download
                >
                    <?= platformShortcutIcon() ?>
                </a>
                <p class="platform-eyebrow">Administration interne MARKI</p>
                <h1>Connexion à la plateforme</h1>
                <p>Utilisez votre compte administrateur MARKI pour créer et suivre les invitations des structures.</p>

                <?php if ($platformLoginError !== ''): ?>
                    <div class="platform-message is-error" role="alert">
                        <?= platformE($platformLoginError) ?>
                    </div>
                <?php endif; ?>

                <form method="post" class="platform-form">
                    <input type="hidden" name="csrf_token" value="<?= platformE($public['csrf_token']) ?>">
                    <input type="hidden" name="action" value="platform_login">

                    <label>
                        <span>Adresse courriel</span>
                        <input
                            type="email"
                            name="email"
                            autocomplete="username"
                            value="<?= platformE((string) ($_POST['email'] ?? '')) ?>"
                            required
                            autofocus
                        >
                    </label>

                    <label>
                        <span>Mot de passe</span>
                        <input
                            type="password"
                            name="password"
                            autocomplete="current-password"
                            required
                        >
                    </label>

                    <label class="platform-checkbox">
                        <input type="checkbox" name="remember" value="1">
                        <span>Se souvenir de cet appareil pendant 30 jours</span>
                    </label>

                    <button type="submit" class="platform-button">Ouvrir l’administration</button>
                </form>

                <p class="platform-help">Ces identifiants sont réservés à l’équipe MARKI. Les médecins et les secrétaires utilisent le lien de leur structure.</p>
            </section>
        </main>
        <script src="assets/js/password-toggle.js?v=20260802-platform4" defer></script>
    </body>
    </html>
    <?php
    exit;
}

$repository = new StructureInvitationRepository($config);
$platformAuditRepository = new PlatformAdminRepository();
$message = '';
$messageType = '';
$generatedLink = '';
$fieldErrors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        Auth::validateCsrf(
            (string) ($_POST['csrf_token'] ?? '')
        );

        $action = trim((string) ($_POST['action'] ?? 'create'));

        if ($action === 'logout_platform') {
            PlatformAuth::logout($config);
            header(
                'Location: '
                . rtrim((string) $config['app']['base_path'], '/')
                . '/platform-invitations.php'
            );
            exit;
        }

        if ($action === 'revoke') {
            $invitationId = (int) ($_POST['invitation_id'] ?? 0);
            $repository->revokeInvitation($invitationId);
            $platformAuditRepository->log(
                (int) $platformAdmin['id'],
                'STRUCTURE_INVITATION_REVOKED',
                ['invitation_id' => $invitationId]
            );
            $message = 'Invitation révoquée.';
            $messageType = 'success';
        } else {
            $invitation = $repository->createInvitation(
                $_POST['recipient_label'] ?? null,
                $_POST['recipient_email'] ?? null,
                (int) (
                    $_POST['expiry_hours']
                    ?? $config['platform']['invitation_expiry_hours']
                    ?? 72
                )
            );

            $generatedLink = platformAbsoluteBaseUrl($config)
                . '/activate-structure.php?token='
                . rawurlencode((string) $invitation['token']);

            $platformAuditRepository->log(
                (int) $platformAdmin['id'],
                'STRUCTURE_INVITATION_CREATED',
                [
                    'invitation_id' => (int) $invitation['id'],
                    'recipient_email' => $invitation['recipient_email'],
                    'expires_at' => $invitation['expires_at'],
                ]
            );

            $message = 'Invitation créée. Le lien reste disponible dans le tableau tant que l’invitation est active.';
            $messageType = 'success';
        }
    } catch (StructureActivationValidationException $exception) {
        $message = $exception->getMessage();
        $messageType = 'error';
        $fieldErrors = $exception->errors();
    } catch (AuthException $exception) {
        $message = $exception->getMessage();
        $messageType = 'error';
    } catch (Throwable $exception) {
        $message = (bool) ($config['app']['debug'] ?? false)
            ? $exception->getMessage()
            : 'Impossible de traiter cette demande.';
        $messageType = 'error';
    }
}

$invitations = array_map(
    static function (array $invitation) use ($config): array {
        $token = (string) ($invitation['token'] ?? '');
        $invitation['public_url'] = $token !== ''
            ? platformAbsoluteBaseUrl($config)
                . '/activate-structure.php?token='
                . rawurlencode($token)
            : null;

        return $invitation;
    },
    $repository->listRecent()
);
$csrfToken = Auth::csrfToken();
$defaultExpiry = (int) (
    $config['platform']['invitation_expiry_hours']
    ?? 72
);
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="assets/icons/marki-app-192.png" type="image/png">
    <title>Invitations de structure — MARKI</title>
    <link rel="stylesheet" href="assets/css/auth.css?v=20260731-setup1">
    <link rel="stylesheet" href="assets/css/platform-setup.css?v=20260802-platform4">
    <link rel="stylesheet" href="assets/css/desktop-density.css?v=20260803-final2">
    <link rel="stylesheet" href="assets/design-system/marki-theme.css?v=20260803-design-ready1">
</head>
<body class="platform-page">
    <main class="platform-shell">
        <header class="platform-header">
            <div>
                <p class="platform-eyebrow">Administration interne MARKI — V1</p>
                <h1>Invitations de nouvelle structure</h1>
                <p>Générez un lien unique pour le médecin responsable d’un cabinet ou d’une clinique.</p>
            </div>

            <div class="platform-header-actions">
                <a
                    class="platform-icon-button"
                    href="download-shortcut.php?type=platform"
                    aria-label="Installer le raccourci de l’administration MARKI"
                    title="Installer le raccourci MARKI sur le Bureau"
                    download
                >
                    <?= platformShortcutIcon() ?>
                </a>
                <div class="platform-admin-identity" aria-label="Compte administrateur connecté">
                    <strong><?= platformE((string) $platformAdmin['full_name']) ?></strong>
                    <small><?= platformE((string) $platformAdmin['email']) ?></small>
                </div>
                <form method="post">
                    <input type="hidden" name="csrf_token" value="<?= platformE($csrfToken) ?>">
                    <input type="hidden" name="action" value="logout_platform">
                    <button class="platform-button platform-button--ghost" type="submit">Se déconnecter</button>
                </form>
            </div>
        </header>

        <?php if ($message !== ''): ?>
            <div class="platform-message is-<?= platformE($messageType) ?>" role="status">
                <?= platformE($message) ?>
            </div>
        <?php endif; ?>

        <?php if ($generatedLink !== ''): ?>
            <section class="platform-card platform-link-card" aria-labelledby="generated-link-title">
                <div>
                    <p class="platform-eyebrow">Lien créé</p>
                    <h2 id="generated-link-title">Invitation à transmettre</h2>
                </div>
                <div class="platform-copy-row">
                    <input id="generated-invitation-link" type="text" readonly value="<?= platformE($generatedLink) ?>">
                    <button type="button" class="platform-button" id="copy-invitation-link">Copier le lien</button>
                </div>
                <p class="platform-help">Toute personne qui possède ce lien peut créer une seule structure et son premier compte médecin administrateur avant son expiration.</p>
            </section>
        <?php endif; ?>

        <div class="platform-grid">
            <section class="platform-card" aria-labelledby="new-invitation-title">
                <p class="platform-eyebrow">Nouvelle invitation</p>
                <h2 id="new-invitation-title">Préparer l’accès du responsable</h2>

                <form method="post" class="platform-form" novalidate>
                    <input type="hidden" name="csrf_token" value="<?= platformE($csrfToken) ?>">
                    <input type="hidden" name="action" value="create">

                    <label>
                        <span>Nom du destinataire</span>
                        <input type="text" name="recipient_label" value="<?= platformE($_POST['recipient_label'] ?? '') ?>" placeholder="Ex. Dr Samir Haddad" required>
                        <?php if (isset($fieldErrors['recipient_label'])): ?>
                            <small class="platform-field-error"><?= platformE((string) $fieldErrors['recipient_label']) ?></small>
                        <?php endif; ?>
                    </label>

                    <label>
                        <span>Courriel du destinataire</span>
                        <input type="email" name="recipient_email" value="<?= platformE($_POST['recipient_email'] ?? '') ?>" placeholder="docteur@cabinet.dz" required>
                        <?php if (isset($fieldErrors['recipient_email'])): ?>
                            <small class="platform-field-error"><?= platformE((string) $fieldErrors['recipient_email']) ?></small>
                        <?php endif; ?>
                    </label>

                    <label>
                        <span>Validité du lien</span>
                        <select name="expiry_hours">
                            <?php foreach ([24, 48, 72, 120, 168] as $hours): ?>
                                <option value="<?= $hours ?>" <?= $hours === $defaultExpiry ? 'selected' : '' ?>>
                                    <?= $hours ?> heures
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </label>

                    <button type="submit" class="platform-button">Générer l’invitation</button>
                </form>
            </section>

            <section class="platform-card platform-card--explanation" aria-labelledby="logic-title">
                <p class="platform-eyebrow">Logique V1</p>
                <h2 id="logic-title">Ce que fera le médecin invité</h2>
                <ol class="platform-steps">
                    <li>Il ouvre le lien personnel.</li>
                    <li>Il renseigne son cabinet ou sa clinique.</li>
                    <li>Il crée son propre mot de passe.</li>
                    <li>MARKI crée son compte <strong>médecin administrateur</strong>.</li>
                    <li>Il se connecte ensuite et crée ses médecins et secrétaires dans <strong>Équipe et accès</strong>.</li>
                </ol>
            </section>
        </div>

        <section class="platform-card" aria-labelledby="recent-invitations-title">
            <div class="platform-card-header">
                <div>
                    <p class="platform-eyebrow">Suivi minimal</p>
                    <h2 id="recent-invitations-title">Invitations récentes</h2>
                </div>
            </div>

            <div class="platform-table-wrap">
                <table class="platform-table">
                    <thead>
                        <tr>
                            <th>Destinataire</th>
                            <th>Créée</th>
                            <th>Expiration</th>
                            <th>État</th>
                            <th>Structure créée</th>
                            <th>Lien</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if ($invitations === []): ?>
                            <tr><td colspan="7">Aucune invitation.</td></tr>
                        <?php else: ?>
                            <?php foreach ($invitations as $invitation): ?>
                                <?php
                                $statusLabels = [
                                    'active' => 'Active',
                                    'used' => 'Utilisée',
                                    'expired' => 'Expirée',
                                    'revoked' => 'Révoquée',
                                ];
                                ?>
                                <tr>
                                    <td>
                                        <strong><?= platformE($invitation['recipient_label'] ?: 'Non précisé') ?></strong>
                                        <small><?= platformE($invitation['recipient_email'] ?: '') ?></small>
                                    </td>
                                    <td><?= platformE(markiFormatFrenchDateTime((string) $invitation['created_at'])) ?></td>
                                    <td><?= platformE(markiFormatFrenchDateTime((string) $invitation['expires_at'])) ?></td>
                                    <td><span class="platform-status is-<?= platformE($invitation['status']) ?>"><?= platformE($statusLabels[$invitation['status']] ?? $invitation['status']) ?></span></td>
                                    <td>
                                        <?php if ($invitation['clinic_name']): ?>
                                            <strong><?= platformE($invitation['clinic_name']) ?></strong>
                                            <small><?= platformE($invitation['activated_by_name'] ?: '') ?></small>
                                        <?php else: ?>
                                            —
                                        <?php endif; ?>
                                    </td>
                                    <td>
                                        <?php if ($invitation['status'] === 'active' && $invitation['public_url']): ?>
                                            <button
                                                type="button"
                                                class="platform-button platform-button--ghost"
                                                data-copy-invitation-link="<?= platformE((string) $invitation['public_url']) ?>"
                                            >Copier</button>
                                        <?php elseif ($invitation['status'] === 'active'): ?>
                                            <small>Lien ancien non récupérable</small>
                                        <?php else: ?>
                                            —
                                        <?php endif; ?>
                                    </td>
                                    <td>
                                        <?php if ($invitation['status'] === 'active'): ?>
                                            <form method="post">
                                                <input type="hidden" name="csrf_token" value="<?= platformE($csrfToken) ?>">
                                                <input type="hidden" name="action" value="revoke">
                                                <input type="hidden" name="invitation_id" value="<?= (int) $invitation['id'] ?>">
                                                <button type="submit" class="platform-button platform-button--danger">Révoquer</button>
                                            </form>
                                        <?php else: ?>
                                            —
                                        <?php endif; ?>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </section>
    </main>

    <script nonce="<?= platformE($public['csp_nonce']) ?>">
        document.getElementById('copy-invitation-link')?.addEventListener('click', async () => {
            const input = document.getElementById('generated-invitation-link');
            if (!input) return;

            try {
                await navigator.clipboard.writeText(input.value);
            } catch (error) {
                input.select();
                document.execCommand('copy');
            }

            const button = document.getElementById('copy-invitation-link');
            if (button) {
                const previous = button.textContent;
                button.textContent = 'Copié';
                window.setTimeout(() => {
                    button.textContent = previous;
                }, 1600);
            }
        });

        document.querySelectorAll('[data-copy-invitation-link]').forEach(button => {
            button.addEventListener('click', async () => {
                const value = button.dataset.copyInvitationLink || '';
                if (!value) return;

                try {
                    await navigator.clipboard.writeText(value);
                } catch (error) {
                    const input = document.createElement('textarea');
                    input.value = value;
                    input.setAttribute('readonly', '');
                    input.style.position = 'fixed';
                    input.style.opacity = '0';
                    document.body.append(input);
                    input.select();
                    document.execCommand('copy');
                    input.remove();
                }

                const previous = button.textContent;
                button.textContent = 'Copié';
                window.setTimeout(() => {
                    button.textContent = previous;
                }, 1600);
            });
        });
    </script>
</body>
</html>
