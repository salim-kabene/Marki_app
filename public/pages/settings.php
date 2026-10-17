<?php

declare(strict_types=1);

header('Cache-Control: no-store');
header('Content-Type: text/html; charset=utf-8');

$context = require __DIR__ . '/../../app/web_bootstrap.php';
$capabilities = $context['capabilities'] ?? [];

if (!($capabilities['settings.view'] ?? false)) {
    http_response_code(403);
    echo '<section class="v1-page"><div class="v1-message is-error">Vous n’avez pas accès aux paramètres.</div></section>';
    exit;
}

$canManageQr = (bool) ($capabilities['settings.manage_doctor'] ?? false);
$canManageTeam = (bool) ($capabilities['team.manage'] ?? false);

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

/**
 * Bouton « ? » qui ouvre une bulle d'aide (voir assets/js/help-tips.js).
 */
function settingsHelp(string $title, string $text): string
{
    $title = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
    $text = htmlspecialchars($text, ENT_QUOTES, 'UTF-8');

    return '<button type="button" class="mk-help" aria-expanded="false"'
        . ' aria-label="Aide : ' . $title . '"'
        . ' data-help-title="' . $title . '" data-help="' . $text . '">?</button>';
}
?>
<section class="v1-page v1-settings-page" aria-labelledby="settings-page-title">
  <header class="v1-page__header">
    <div>
      <p class="v1-page__eyebrow">Informations générales</p>
      <h2 id="settings-page-title">Paramètres</h2>
      <p>Gérez les informations de la structure, le profil du médecin et les accès de l’équipe.</p>
    </div>
  </header>

  <div id="settings-page-message" class="v1-message" role="status" aria-live="polite"></div>

  <div class="v1-settings-grid">
    <section class="v1-card" id="clinic-settings-card" aria-labelledby="clinic-settings-title">
      <div class="v1-card__header">
        <div class="v1-section-title">
          <span class="v1-section-icon v1-section-icon--clinic" aria-hidden="true"><svg class="mk-icon"><use href="#mk-building"></use></svg></span>
          <p class="v1-page__eyebrow">Structure</p>
          <h3 id="clinic-settings-title">Cabinet ou clinique <?= settingsHelp('Cabinet ou clinique', 'Ce sont les informations de votre cabinet : nom, téléphone et adresse. Le nom du cabinet est montré aux patients quand ils s’inscrivent avec le QR code.') ?></h3>
        </div>
        <button type="button" class="v1-button v1-button--secondary v1-settings-edit-button" id="clinic-settings-edit-button">
          <svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#mk-pencil"></use></svg>
          <span>Modifier</span>
        </button>
      </div>

      <div class="v1-settings-summary">
        <div class="v1-settings-identity v1-settings-identity--clinic">
          <span class="v1-settings-identity__icon" aria-hidden="true"><svg class="mk-icon"><use href="#mk-settings"></use></svg></span>
          <div><strong id="settings-view-clinic-name">—</strong><span id="settings-view-clinic-type">—</span></div>
        </div>
        <dl class="v1-profile-details">
          <div class="v1-profile-detail"><dt>Téléphone</dt><dd id="settings-view-clinic-phone">Non renseigné</dd></div>
          <div class="v1-profile-detail v1-profile-detail--email"><dt>Wilaya / région</dt><dd id="settings-view-clinic-wilaya">Non renseignée</dd></div>
          <div class="v1-profile-detail v1-profile-detail--address"><dt>Adresse</dt><dd id="settings-view-clinic-address">Non renseignée</dd></div>
          <div class="v1-profile-detail v1-profile-detail--notes"><dt>Fuseau horaire</dt><dd class="v1-settings-timezone"><img id="settings-view-timezone-flag" src="assets/icons/flags/dz.svg" alt=""><span id="settings-view-clinic-timezone">—</span></dd></div>
        </dl>
      </div>
    </section>

    <section class="v1-card" id="doctor-settings-card" aria-labelledby="doctor-settings-title">
      <div class="v1-card__header">
        <div class="v1-section-title">
          <span class="v1-section-icon v1-section-icon--doctor" aria-hidden="true"><svg class="mk-icon"><use href="#mk-stethoscope"></use></svg></span>
          <p class="v1-page__eyebrow">Profil professionnel</p>
          <h3 id="doctor-settings-title">Profil du médecin <?= settingsHelp('Profil du médecin', 'Votre nom et votre spécialité. Les patients les voient sur la page où ils s’inscrivent, pour être sûrs de s’inscrire chez le bon médecin.') ?></h3>
        </div>
        <button type="button" class="v1-button v1-button--secondary v1-settings-edit-button" id="doctor-settings-edit-button">
          <svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#mk-pencil"></use></svg>
          <span>Modifier</span>
        </button>
      </div>

      <div class="v1-settings-summary">
        <div class="v1-settings-identity v1-settings-identity--doctor">
          <span class="v1-settings-identity__icon" aria-hidden="true"><svg class="mk-icon"><use href="#mk-user"></use></svg></span>
          <div><strong id="settings-view-doctor-name">—</strong><span id="settings-view-doctor-specialty">Spécialité non renseignée</span></div>
        </div>
        <dl class="v1-profile-details">
          <div class="v1-profile-detail"><dt>Numéro d’agrément / licence</dt><dd id="settings-view-doctor-license">Non renseigné</dd></div>
          <div class="v1-profile-detail v1-profile-detail--address"><dt>Adresse professionnelle</dt><dd id="settings-view-doctor-address">Non renseignée</dd></div>
        </dl>
      </div>
    </section>
  </div>

  <div class="v1-profile-modal v1-settings-modal" id="clinic-settings-modal" hidden aria-hidden="true">
    <button type="button" class="v1-profile-modal__backdrop" data-close-settings-modal aria-label="Fermer"></button>
    <section class="v1-profile-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="clinic-settings-modal-title">
      <header class="v1-profile-modal__header"><div><p class="v1-page__eyebrow">Structure</p><h3 id="clinic-settings-modal-title">Modifier le cabinet</h3><p>Mettez à jour les informations générales de votre structure.</p></div><button type="button" class="v1-profile-modal__close" data-close-settings-modal aria-label="Fermer"><svg class="mk-icon"><use href="#mk-close"></use></svg></button></header>
      <form id="clinic-settings-form" class="v1-form v1-profile-modal__form" novalidate>
        <div class="v1-form__grid">
          <label class="v1-field v1-field--wide"><span>Nom de la structure <strong class="required-mark" aria-hidden="true">*</strong></span><input type="text" id="settings-clinic-name" name="clinic_name" required></label>
          <label class="v1-field"><span>Type de structure</span><select id="settings-clinic-type" name="clinic_type"><option value="solo">Cabinet individuel</option><option value="clinic">Clinique</option><option value="hospital_simple">Établissement médical</option></select></label>
          <label class="v1-field"><span>Téléphone de la structure</span><input type="tel" id="settings-clinic-phone" name="clinic_phone" inputmode="tel" data-dz-phone-auto></label>
          <label class="v1-field v1-field--wide"><span>Adresse</span><input type="text" id="settings-clinic-address" name="clinic_address" autocomplete="street-address"></label>
          <div class="v1-location-fields" data-algeria-location-group><label class="v1-field"><span>Wilaya / région</span><select id="settings-clinic-wilaya" name="clinic_wilaya" data-algeria-wilaya><option value="">Choisir une wilaya</option></select></label><label class="v1-field"><span>Ville / commune</span><input type="text" id="settings-clinic-city" name="clinic_city" list="settings-clinic-city-options" data-algeria-city autocomplete="address-level2"><datalist id="settings-clinic-city-options"></datalist></label></div>
          <label class="v1-field v1-field--wide"><span>Fuseau horaire <strong class="required-mark" aria-hidden="true">*</strong></span><span class="timezone-select-wrap"><img id="settings-timezone-flag" class="timezone-flag" src="assets/icons/flags/dz.svg" alt=""><select id="settings-clinic-timezone" name="clinic_timezone" required><option value="Africa/Algiers">Algérie — Africa/Algiers</option><option value="America/Toronto">Canada — America/Toronto</option><option value="Europe/Paris">France — Europe/Paris</option><option value="Africa/Tunis">Tunisie — Africa/Tunis</option><option value="America/New_York">États-Unis — America/New_York</option></select></span><small>Les dates et les heures seront affichées selon le fuseau choisi.</small></label>
        </div>
        <div class="v1-form__actions v1-profile-modal__actions"><button type="button" class="v1-button v1-button--ghost" data-close-settings-modal>Annuler</button><button type="submit" class="v1-button v1-button--primary" id="clinic-settings-save-button">Enregistrer les modifications</button></div>
      </form>
    </section>
  </div>

  <div class="v1-profile-modal v1-settings-modal" id="doctor-settings-modal" hidden aria-hidden="true">
    <button type="button" class="v1-profile-modal__backdrop" data-close-settings-modal aria-label="Fermer"></button>
    <section class="v1-profile-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="doctor-settings-modal-title">
      <header class="v1-profile-modal__header"><div><p class="v1-page__eyebrow">Profil professionnel</p><h3 id="doctor-settings-modal-title">Modifier le profil du médecin</h3><p>Actualisez les informations professionnelles affichées dans MARKI.</p></div><button type="button" class="v1-profile-modal__close" data-close-settings-modal aria-label="Fermer"><svg class="mk-icon"><use href="#mk-close"></use></svg></button></header>
      <form id="doctor-settings-form" class="v1-form v1-profile-modal__form" novalidate>
        <div class="v1-form__grid">
          <label class="v1-field v1-field--wide"><span>Nom affiché <strong class="required-mark" aria-hidden="true">*</strong></span><input type="text" id="settings-doctor-name" name="doctor_display_name" required></label>
          <label class="v1-field v1-field--wide"><span>Spécialité</span><input type="text" id="settings-doctor-specialty" name="doctor_specialty"></label>
          <label class="v1-field v1-field--wide"><span>Numéro d’agrément / licence</span><input type="text" id="settings-doctor-license" name="doctor_license_number"></label>
          <label class="v1-field v1-field--wide"><span>Adresse professionnelle</span><input type="text" id="settings-doctor-address" name="doctor_address"></label>
        </div>
        <div class="v1-form__actions v1-profile-modal__actions"><button type="button" class="v1-button v1-button--ghost" data-close-settings-modal>Annuler</button><button type="submit" class="v1-button v1-button--primary" id="doctor-settings-save-button">Enregistrer les modifications</button></div>
      </form>
    </section>
  </div>

  <?php if ($canManageQr): ?>
  <section id="public-registration-section" class="v1-card qr-admin-card v1-collapsible-section is-collapsed" aria-labelledby="public-registration-title">
    <div class="v1-card__header qr-admin-card__header">
      <div class="v1-section-title">
        <span class="v1-section-icon v1-section-icon--qr" aria-hidden="true"><svg class="mk-icon"><use href="#mk-qr"></use></svg></span>
        <p class="v1-page__eyebrow">Inscription publique</p>
        <h3 id="public-registration-title">QR code du médecin <?= settingsHelp('À quoi sert le QR code ?', 'C’est un ticket de file d’attente, mais sur le téléphone. Le patient scanne le QR avec l’appareil photo de son téléphone, écrit son nom et son numéro, et il est ajouté tout seul à votre liste du jour. Chaque médecin a son propre QR : collez-le sur votre porte ou à l’accueil.') ?></h3>
        <p>Les patients le scannent pour s’inscrire.</p>
      </div>
      <div class="v1-collapsible-section__actions">
        <span id="qr-admin-status" class="qr-admin-status">Chargement…</span>
        <button
          type="button"
          class="v1-button v1-button--secondary v1-section-toggle"
          data-settings-section-toggle="public-registration-section"
          aria-expanded="false"
          aria-controls="public-registration-section-body"
        >
          <span data-section-toggle-label>Afficher</span>
          <span class="v1-section-toggle__chevron" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </button>
      </div>
    </div>

    <div id="public-registration-section-body" class="v1-collapsible-section__body">
    <div id="qr-admin-message" class="v1-message" role="status" aria-live="polite"></div>

    <div class="qr-admin-layout">
      <section class="qr-admin-preview" aria-labelledby="qr-preview-title">
        <div class="qr-admin-preview__top">
          <div>
            <p class="v1-page__eyebrow">QR permanent</p>
            <h4 id="qr-preview-title">Affiche à imprimer <?= settingsHelp('Affiche à imprimer', 'Ce QR ne change pas tout seul. Imprimez-le une seule fois et affichez-le : il marchera tous les jours.') ?></h4>
          </div>
          <span id="qr-token-version" class="v1-soft-badge">Version —</span>
        </div>

        <div class="qr-code-brand-frame">
          <div class="qr-code-brand-frame__brand"><span class="qr-code-brand-frame__mark" aria-hidden="true">M</span><span>MARKI</span></div>
          <div id="qr-code-canvas" class="qr-code-canvas" aria-label="QR code d’inscription"></div>
          <div class="qr-code-brand-frame__doctor"><span id="qr-admin-doctor-initials" aria-hidden="true">DR</span><strong id="qr-admin-doctor-name">—</strong></div>
        </div>
        <p class="qr-admin-clinic" id="qr-admin-clinic-name">—</p>
        <p class="qr-admin-scan-hint">Scannez pour rejoindre la liste d’attente</p>

        <label class="v1-field qr-admin-link-field">
          <span>Lien public <?= settingsHelp('Lien public', 'C’est la même chose que le QR code, mais sous forme de lien. Envoyez-le par SMS ou WhatsApp : le patient appuie dessus et peut s’inscrire.') ?></span>
          <input type="text" id="qr-public-url" readonly>
        </label>

        <div class="qr-admin-actions">
          <button type="button" class="v1-button v1-button--secondary" id="qr-copy-link">Copier le lien</button>
          <button type="button" class="v1-button v1-button--secondary" id="qr-open-link">Tester la page</button>
          <button type="button" class="v1-button v1-button--secondary" id="qr-download">Télécharger</button>
          <button type="button" class="v1-button v1-button--secondary" id="qr-print">Imprimer</button>
        </div>

        <span class="qr-admin-regenerate">
          <button type="button" class="v1-button v1-button--danger-outline" id="qr-regenerate">Régénérer le QR code</button>
          <?= settingsHelp('Régénérer le QR', 'Crée un nouveau QR et l’ancien ne marche plus du tout. À faire seulement si quelqu’un utilise votre QR sans votre accord. Attention : il faudra réimprimer l’affiche.') ?>
        </span>

        <p class="qr-admin-network-warning" id="qr-network-warning" hidden>
          Pour tester le QR avec un téléphone sur le réseau local, ouvrez MARKI avec l’adresse IP de cet ordinateur avant de télécharger le QR.
        </p>
      </section>

      <div class="qr-admin-settings">
        <section class="qr-admin-panel">
          <div class="qr-admin-panel__header">
            <div>
              <h4>Disponibilité <?= settingsHelp('Activer ou désactiver le QR', 'Activé : les patients peuvent s’inscrire avec le QR. Désactivé : le QR affiche un message et personne ne peut s’inscrire. Votre affiche reste bonne : pas besoin de la réimprimer quand vous le réactivez.') ?></h4>
            </div>
            <button type="button" class="v1-button v1-button--primary" id="qr-toggle-button">Activer</button>
          </div>

          <div class="qr-admin-metrics">
            <div><span>Scans aujourd’hui <?= settingsHelp('Scans aujourd’hui', 'Le nombre de fois où quelqu’un a ouvert la page du QR aujourd’hui, même sans finir son inscription.') ?></span><strong id="qr-scans-today">0</strong></div>
            <div><span>Inscriptions aujourd’hui <?= settingsHelp('Inscriptions aujourd’hui', 'Le nombre de patients qui ont vraiment fini leur inscription avec le QR aujourd’hui.') ?></span><strong id="qr-registrations-today">0</strong></div>
            <div><span>Dernier scan</span><strong id="qr-last-scan">—</strong></div>
          </div>
        </section>

        <form id="qr-settings-form" class="qr-admin-panel" novalidate>
          <div class="qr-admin-panel__header">
            <div>
              <h4>Règles d’inscription <?= settingsHelp('Règles d’inscription', 'Ici, vous choisissez ce que le patient doit remplir quand il s’inscrit avec le QR. Son numéro de téléphone et son accord sont toujours demandés.') ?></h4>
            </div>
          </div>

          <div class="v1-form__grid">
            <label class="qr-admin-check v1-field--wide">
              <input type="checkbox" id="qr-birth-date-required" name="birth_date_required">
              <span>Rendre la date de naissance obligatoire <?= settingsHelp('Date de naissance obligatoire', 'Si vous cochez, le patient doit écrire sa date de naissance pour s’inscrire. C’est utile pour ne pas confondre deux patients qui ont le même nom.') ?></span>
            </label>

            <label class="v1-field">
              <span>Limite d’inscriptions QR par jour <?= settingsHelp('Limite par jour', 'Le nombre maximum de patients qui peuvent s’inscrire avec le QR en une journée. Quand ce nombre est atteint, le QR n’accepte plus personne jusqu’au lendemain. Laissez vide pour ne pas mettre de limite.') ?></span>
              <input type="number" id="qr-max-registrations" name="max_public_registrations_per_day" min="1" max="1000" placeholder="Sans limite">
              <small class="v1-field-error" data-qr-error="max_public_registrations_per_day"></small>
            </label>

            <label class="v1-field">
              <span>Durée du lien de suivi <?= settingsHelp('Durée du lien de suivi', 'Après son inscription, le patient reçoit une page qui lui montre sa place dans la file. Ce réglage dit pendant combien de temps cette page reste ouverte.') ?></span>
              <select id="qr-session-duration" name="public_session_duration_minutes">
                <option value="120">2 heures</option>
                <option value="360">6 heures</option>
                <option value="720">12 heures</option>
                <option value="1440">24 heures</option>
                <option value="4320">3 jours</option>
                <option value="10080">7 jours</option>
              </select>
              <small class="v1-field-error" data-qr-error="public_session_duration_minutes"></small>
            </label>
          </div>

          <details class="qr-admin-messages">
            <summary>Personnaliser les messages publics <?= settingsHelp('Messages publics', 'Ce sont les phrases que le patient lit après avoir scanné le QR. Par exemple : quand les inscriptions sont fermées, ou quand son inscription est réussie. Vous pouvez les écrire avec vos mots.') ?></summary>
            <div class="qr-admin-messages__grid">
              <label class="v1-field">
                <span>Liste du jour non ouverte</span>
                <textarea id="qr-message-day-not-open" rows="3" maxlength="1000"></textarea>
              </label>
              <label class="v1-field">
                <span>Inscriptions ouvertes</span>
                <textarea id="qr-message-open" rows="3" maxlength="1000"></textarea>
              </label>
              <label class="v1-field">
                <span>Inscriptions fermées</span>
                <textarea id="qr-message-closed" rows="3" maxlength="1000"></textarea>
              </label>
              <label class="v1-field">
                <span>Liste en pause</span>
                <textarea id="qr-message-paused" rows="3" maxlength="1000"></textarea>
              </label>
              <label class="v1-field">
                <span>Journée terminée</span>
                <textarea id="qr-message-completed" rows="3" maxlength="1000"></textarea>
              </label>
              <label class="v1-field">
                <span>QR désactivé</span>
                <textarea id="qr-message-disabled" rows="3" maxlength="1000"></textarea>
              </label>
              <label class="v1-field">
                <span>En dehors des horaires</span>
                <textarea id="qr-message-outside-schedule" rows="3" maxlength="1000"></textarea>
              </label>
              <label class="v1-field">
                <span>Inscription confirmée</span>
                <textarea id="qr-message-success" rows="3" maxlength="1000"></textarea>
              </label>
            </div>
          </details>

          <div class="qr-admin-form-actions">
            <button type="submit" class="v1-button v1-button--primary" id="qr-save-settings">Enregistrer les réglages</button>
          </div>
        </form>
      </div>
    </div>
    </div>
  </section>

  <div id="qr-confirm-modal" class="team-modal" hidden aria-hidden="true">
    <button type="button" class="team-modal__backdrop" data-close-qr-confirm aria-label="Fermer"></button>
    <div class="team-modal__dialog team-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="qr-confirm-title">
      <div class="team-form__header">
        <div>
          <p class="v1-page__eyebrow">Sécurité</p>
          <h4 id="qr-confirm-title">Confirmer l’action</h4>
        </div>
        <button type="button" class="v1-icon-button" data-close-qr-confirm aria-label="Fermer"><svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#mk-close"></use></svg></button>
      </div>
      <p id="qr-confirm-message"></p>
      <div class="v1-form__actions">
        <button type="button" class="v1-button v1-button--secondary" data-close-qr-confirm>Annuler</button>
        <button type="button" class="v1-button v1-button--primary" id="qr-confirm-action">Confirmer</button>
      </div>
    </div>
  </div>

  <?php endif; ?>

  <?php if ($canManageTeam): ?>
  <section id="team-settings-section" class="v1-card team-card v1-collapsible-section is-collapsed" aria-labelledby="team-settings-title">
    <div class="v1-card__header team-card__header">
      <div class="v1-section-title">
        <span class="v1-section-icon v1-section-icon--team" aria-hidden="true"><svg class="mk-icon"><use href="#mk-users"></use></svg></span>
        <p class="v1-page__eyebrow">Équipe et accès</p>
        <h3 id="team-settings-title">Comptes de la structure <?= settingsHelp('Comptes de l’équipe', 'Chaque personne qui travaille avec vous (secrétaire, autre médecin) a son propre compte avec son mot de passe. Vous choisissez ce que chacun a le droit de faire. Si quelqu’un part, désactivez son compte : tout ce qu’il a fait reste enregistré.') ?></h3>
        <p>Un compte par personne.</p>
      </div>
      <div class="v1-collapsible-section__actions">
        <button
          type="button"
          class="v1-button v1-button--secondary v1-section-toggle"
          data-settings-section-toggle="team-settings-section"
          aria-expanded="false"
          aria-controls="team-settings-section-body"
        >
          <span data-section-toggle-label>Afficher</span>
          <span class="v1-section-toggle__chevron" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </button>
        <button type="button" class="v1-button v1-button--primary" id="team-new-account-button">
          Nouveau compte
        </button>
      </div>
    </div>

    <div id="team-settings-section-body" class="v1-collapsible-section__body">
    <div id="team-message" class="v1-message" role="status" aria-live="polite"></div>

    <div class="v1-table-wrap team-table-wrap">
      <table class="v1-table team-table">
        <thead>
          <tr>
            <th>Utilisateur</th>
            <th>Type</th>
            <th>Accès</th>
            <th>État</th>
            <th>Dernière connexion</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="team-table-body">
          <tr><td colspan="6" class="v1-empty-cell">Chargement de l’équipe…</td></tr>
        </tbody>
      </table>
    </div>
    </div>
  </section>

  <div id="team-account-modal" class="team-modal" hidden aria-hidden="true">
    <button
      type="button"
      class="team-modal__backdrop"
      id="team-account-modal-backdrop"
      aria-label="Fermer"
    ></button>

    <div class="team-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="team-form-title">
      <form id="team-account-form" class="v1-form team-form" novalidate>
        <div class="team-form__header">
          <div>
            <p class="v1-page__eyebrow">Compte</p>
            <h4 id="team-form-title">Nouveau compte</h4>
          </div>
          <button type="button" class="v1-icon-button" id="team-form-close-button" aria-label="Fermer"><svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#mk-close"></use></svg></button>
        </div>

        <input type="hidden" id="team-user-id" name="user_id">

        <div class="v1-form__grid">
          <label class="v1-field v1-field--wide">
            <span>Nom complet <strong class="required-mark" aria-hidden="true">*</strong></span>
            <input type="text" id="team-full-name" name="full_name" required>
            <small class="v1-field-error" data-team-error="full_name"></small>
          </label>

          <label class="v1-field">
            <span>Type de compte <strong class="required-mark" aria-hidden="true">*</strong></span>
            <select id="team-account-type" name="account_type" required>
              <option value="secretary">Secrétariat</option>
              <option value="doctor">Médecin</option>
            </select>
            <small class="v1-field-error" data-team-error="account_type"></small>
          </label>

          <label class="v1-field">
            <span>Courriel</span>
            <input type="email" id="team-email" name="email" autocomplete="email">
            <small class="v1-field-error" data-team-error="email"></small>
          </label>

          <label class="v1-field">
            <span>Téléphone</span>
            <input
              type="tel"
              id="team-phone"
              name="phone"
              inputmode="numeric"
              autocomplete="tel"
              maxlength="13"
              placeholder="0550 80 30 90"
              data-dz-mobile
            >
            <small class="v1-field-hint">Format local : 0550 80 30 90</small>
            <small class="v1-field-error" data-team-error="phone"></small>
          </label>

          <label class="v1-field v1-field--wide">
            <span>Mot de passe temporaire</span>
            <input type="password" id="team-temporary-password" name="temporary_password" autocomplete="new-password">
            <small class="v1-field-hint" id="team-password-hint">10 caractères minimum, avec majuscule, minuscule et chiffre.</small>
            <small class="v1-field-error" data-team-error="temporary_password"></small>
          </label>

          <label class="v1-field v1-field--wide" id="team-job-title-field">
            <span>Fonction</span>
            <input type="text" id="team-job-title" name="job_title" placeholder="Secrétaire médicale">
            <small class="v1-field-error" data-team-error="job_title"></small>
          </label>

          <label class="v1-field v1-field--wide" id="team-specialty-field" hidden>
            <span>Spécialité</span>
            <input type="text" id="team-specialty" name="specialty">
            <small class="v1-field-error" data-team-error="specialty"></small>
          </label>

          <label class="v1-field v1-field--wide" id="team-license-field" hidden>
            <span>Numéro d’agrément / licence</span>
            <input type="text" id="team-license-number" name="license_number">
            <small class="v1-field-error" data-team-error="license_number"></small>
          </label>

          <div class="team-doctor-access-note v1-field--wide" id="team-doctor-access-note" hidden>
            Un médecin accède à sa Liste du jour, à ses patients, à ses historiques et à son profil. Les niveaux ci-dessous concernent uniquement le secrétariat.
          </div>

          <label class="v1-field v1-field--wide" id="team-access-level-field">
            <span>Niveau d’accès</span>
            <select id="team-access-level" name="access_level">
              <option value="queue_only">Liste du jour seulement</option>
              <option value="queue_and_patients">Liste, patients et historique</option>
              <option value="full">Accès opérationnel étendu</option>
            </select>
            <small class="v1-field-error" data-team-error="access_level"></small>
          </label>

          <fieldset class="team-doctors-field v1-field--wide" id="team-doctors-field">
            <legend>Médecins autorisés <strong class="required-mark" aria-hidden="true">*</strong></legend>
            <div id="team-doctors-options" class="team-doctors-options"></div>
            <small class="v1-field-error" data-team-error="doctor_ids"></small>
          </fieldset>
        </div>

        <div class="v1-form__actions">
          <button type="button" class="v1-button v1-button--secondary" id="team-form-cancel-button">Annuler</button>
          <button type="submit" class="v1-button v1-button--primary" id="team-form-save-button">Enregistrer le compte</button>
        </div>
      </form>
    </div>
  </div>

  <div id="team-confirm-modal" class="team-modal team-modal--confirm" hidden aria-hidden="true">
    <button
      type="button"
      class="team-modal__backdrop"
      id="team-confirm-backdrop"
      aria-label="Fermer"
    ></button>

    <div class="team-modal__dialog team-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="team-confirm-title">
      <div class="team-form__header">
        <div>
          <p class="v1-page__eyebrow">Confirmation</p>
          <h4 id="team-confirm-title">Modifier ce compte ?</h4>
        </div>
        <button type="button" class="v1-icon-button" id="team-confirm-close-button" aria-label="Fermer"><svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#mk-close"></use></svg></button>
      </div>

      <p id="team-confirm-message"></p>

      <div class="v1-form__actions">
        <button type="button" class="v1-button v1-button--secondary" id="team-confirm-cancel-button">Annuler</button>
        <button type="button" class="v1-button v1-button--primary" id="team-confirm-button">Confirmer</button>
      </div>
    </div>
  </div>
  <?php endif; ?>
</section>
