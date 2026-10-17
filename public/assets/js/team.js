(function () {
  'use strict';

  const API = {
    list: 'api/team_list.php',
    save: 'api/team_save.php',
    toggle: 'api/team_toggle_status.php'
  };

  const state = {
    members: [],
    doctors: [],
    pendingToggleUserId: null
  };

  let escapeHandlerBound = false;

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  }

  async function readJson(response) {
    const raw = await response.text();

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error('Réponse non JSON :', raw);
      throw new Error('Le serveur a renvoyé une réponse invalide.');
    }
  }

  async function requestJson(url, options = {}, retries = 1) {
    const requestOptions = {
      cache: 'no-store',
      ...options
    };

    try {
      const response = await fetch(url, requestOptions);
      const data = await readJson(response);

      if (!response.ok || !data?.ok) {
        const error = new Error(data?.message || 'Une erreur est survenue.');
        error.status = response.status;
        error.data = data;
        error.fieldErrors = data?.errors || {};
        error.serverError = data?.error || '';
        error.errorId = data?.error_id || '';
        throw error;
      }

      return data;
    } catch (error) {
      const method = String(requestOptions.method || 'GET').toUpperCase();
      const retryable = method === 'GET'
        && retries > 0
        && (!error?.status || error.status >= 500);

      if (!retryable) throw error;

      await new Promise(resolve => window.setTimeout(resolve, 300));
      return requestJson(url, options, retries - 1);
    }
  }

  function notify(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }

    console.log(message);
  }

  function setMessage(text = '', type = '') {
    const element = document.getElementById('team-message');
    if (!element) return;

    element.textContent = text;
    element.className = 'v1-message';

    if (text && type) {
      element.classList.add(`is-${type}`);
    }
  }

  function clearFieldErrors() {
    document.querySelectorAll('[data-team-error]').forEach(element => {
      element.textContent = '';
    });

    document.querySelectorAll('#team-account-form .v1-field.has-error').forEach(field => {
      field.classList.remove('has-error');
    });

    document
      .getElementById('team-doctors-field')
      ?.classList.remove('has-error');
  }

  function setFieldError(fieldName, message) {
    const errorElement = document.querySelector(
      `[data-team-error="${fieldName}"]`
    );

    if (errorElement) {
      errorElement.textContent = message;
    }

    const input = document.querySelector(
      `#team-account-form [name="${fieldName}"]`
    );

    if (input) {
      input.closest('.v1-field')?.classList.add('has-error');
    }

    if (fieldName === 'doctor_ids') {
      document
        .getElementById('team-doctors-field')
        ?.classList.add('has-error');
    }
  }

  function renderFieldErrors(errors = {}) {
    Object.entries(errors).forEach(([field, message]) => {
      setFieldError(field, String(message));
    });
  }

  const MONTHS_FR = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ];

  function formatDateTime(value) {
    if (!value) return 'Jamais';

    const match = String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/
    );

    if (!match) return escapeHtml(value);

    const day = parseInt(match[3], 10);
    const monthIndex = parseInt(match[2], 10) - 1;
    const year = match[1];
    const monthName = MONTHS_FR[monthIndex] || match[2];

    return `${day} ${monthName} ${year} à ${match[4]}:${match[5]}`;
  }

  function localPhoneDigits(value) {
    let digits = String(value ?? '').replace(/\D+/g, '');

    if (digits.startsWith('00213')) {
      digits = digits.slice(5);
    } else if (digits.startsWith('213')) {
      digits = digits.slice(3);
    }

    if (/^[567]/.test(digits)) {
      digits = `0${digits}`;
    }

    return digits.slice(0, 10);
  }

  function formatPhoneInput(value) {
    const digits = localPhoneDigits(value);

    return [
      digits.slice(0, 4),
      digits.slice(4, 6),
      digits.slice(6, 8),
      digits.slice(8, 10)
    ].filter(Boolean).join(' ');
  }

  function isValidLocalMobile(value) {
    return /^0[567]\d{8}$/.test(localPhoneDigits(value));
  }

  function accessLabel(member) {
    if (member.roles?.includes('clinic_admin')) {
      return 'Administration de la structure';
    }

    if (member.account_type === 'doctor') {
      return 'Espace médecin complet';
    }

    const levels = [...new Set(
      (member.doctor_accesses || []).map(access => access.access_level)
    )];

    const labels = {
      queue_only: 'Liste du jour',
      queue_and_patients: 'Liste, patients et historique',
      full: 'Accès opérationnel étendu'
    };

    return levels.map(level => labels[level] || level).join(', ')
      || 'Aucun médecin';
  }

  function renderDoctorsOptions(selectedIds = []) {
    const container = document.getElementById('team-doctors-options');
    if (!container) return;

    container.innerHTML = state.doctors
      .filter(doctor => doctor.is_active)
      .map(doctor => `
        <label class="team-doctor-option">
          <input
            type="checkbox"
            name="doctor_ids[]"
            value="${doctor.id}"
            ${selectedIds.includes(Number(doctor.id)) ? 'checked' : ''}
          >
          <span>
            <strong>${escapeHtml(doctor.display_name)}</strong>
            <small>${escapeHtml(doctor.specialty || 'Médecin')}</small>
          </span>
        </label>
      `)
      .join('');
  }

  function renderTable() {
    const body = document.getElementById('team-table-body');
    if (!body) return;

    if (state.members.length === 0) {
      body.innerHTML = '<tr><td colspan="6" class="v1-empty-cell">Aucun compte.</td></tr>';
      return;
    }

    body.innerHTML = state.members.map(member => {
      const isAdmin = member.roles?.includes('clinic_admin');
      const typeLabel = isAdmin && member.account_type === 'doctor'
        ? 'Médecin administrateur'
        : isAdmin
          ? 'Administrateur'
          : member.account_type === 'doctor'
            ? 'Médecin'
            : 'Secrétariat';

      const actionLabel = member.status === 'active'
        ? 'Désactiver'
        : 'Réactiver';

      const toggleDisabled = member.is_protected_admin || member.is_current_user;
      const toggleTitle = member.is_current_user
        ? 'Vous ne pouvez pas désactiver votre propre compte.'
        : member.is_protected_admin
          ? 'Le compte administrateur principal doit rester actif.'
          : actionLabel;

      return `
        <tr class="team-row team-row--${member.status === 'active' ? 'active' : 'disabled'}" data-team-user-id="${member.id}">
          <td>
            <strong>${escapeHtml(member.full_name)}</strong>
            ${member.is_current_user ? '<span class="team-current-badge">Compte actuel</span>' : ''}
            <span class="v1-table__subtext">${escapeHtml(member.email || formatPhoneInput(member.phone) || '-')}</span>
          </td>
          <td>${escapeHtml(typeLabel)}</td>
          <td>${escapeHtml(accessLabel(member))}</td>
          <td>
            <span class="v1-status v1-status--${member.status === 'active' ? 'active' : 'canceled'}">
              ${member.status === 'active' ? 'Actif' : 'Désactivé'}
            </span>
          </td>
          <td>${formatDateTime(member.last_login_at)}</td>
          <td>
            <div class="team-actions">
              <button
                type="button"
                class="v1-icon-button team-action team-action--edit"
                data-team-edit="${member.id}"
                title="Modifier ce compte"
              >Modifier</button>
              <button
                type="button"
                class="v1-icon-button team-action ${member.status === 'active' ? 'team-action--deactivate' : 'team-action--reactivate'} ${toggleDisabled ? 'is-disabled' : ''}"
                data-team-toggle="${member.id}"
                title="${escapeHtml(toggleTitle)}"
                aria-disabled="${toggleDisabled ? 'true' : 'false'}"
                ${toggleDisabled ? 'disabled' : ''}
              >${actionLabel}</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    body.querySelectorAll('[data-team-edit]').forEach(button => {
      button.addEventListener('click', () => {
        const member = state.members.find(
          item => Number(item.id) === Number(button.dataset.teamEdit)
        );

        if (member) {
          openForm(member);
        }
      });
    });

    body.querySelectorAll('[data-team-toggle]').forEach(button => {
      button.addEventListener('click', () => {
        openStatusConfirmation(Number(button.dataset.teamToggle));
      });
    });
  }

  function updateConditionalFields() {
    const accountType = document.getElementById('team-account-type')?.value
      || 'secretary';
    const isDoctor = accountType === 'doctor';

    document.getElementById('team-job-title-field')
      ?.toggleAttribute('hidden', isDoctor);
    document.getElementById('team-specialty-field')
      ?.toggleAttribute('hidden', !isDoctor);
    document.getElementById('team-license-field')
      ?.toggleAttribute('hidden', !isDoctor);
    document.getElementById('team-access-level-field')
      ?.toggleAttribute('hidden', isDoctor);
    document.getElementById('team-doctors-field')
      ?.toggleAttribute('hidden', isDoctor);
    document.getElementById('team-doctor-access-note')
      ?.toggleAttribute('hidden', !isDoctor);
  }

  function setInput(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.value = value ?? '';
    }
  }

  function openForm(member = null) {
    const modal = document.getElementById('team-account-modal');
    const form = document.getElementById('team-account-form');
    if (!modal || !form) return;

    clearFieldErrors();
    setMessage('');
    form.reset();

    setInput('team-user-id', member?.id || '');
    setInput('team-full-name', member?.full_name || '');
    setInput('team-email', member?.email || '');
    setInput('team-phone', formatPhoneInput(member?.phone || ''));
    setInput('team-account-type', member?.account_type || 'secretary');
    setInput('team-job-title', member?.job_title || '');
    setInput('team-specialty', member?.doctor_specialty || '');
    setInput('team-license-number', member?.doctor_license_number || '');
    setInput(
      'team-access-level',
      member?.doctor_accesses?.[0]?.access_level || 'queue_only'
    );
    setInput('team-temporary-password', '');

    const accountType = document.getElementById('team-account-type');
    if (accountType) {
      accountType.disabled = Boolean(member);
    }

    const title = document.getElementById('team-form-title');
    if (title) {
      title.textContent = member ? 'Modifier le compte' : 'Nouveau compte';
    }

    const passwordInput = document.getElementById('team-temporary-password');
    const passwordHint = document.getElementById('team-password-hint');

    if (passwordInput) {
      passwordInput.required = !member;
      passwordInput.disabled = Boolean(member?.is_current_user);
      passwordInput.placeholder = member
        ? 'Laisser vide pour conserver le mot de passe'
        : 'Mot de passe temporaire';
    }

    if (passwordHint) {
      passwordHint.textContent = member?.is_current_user
        ? 'Utilisez « Changer le mot de passe » dans le menu de votre compte.'
        : member
          ? 'Laissez vide pour conserver le mot de passe actuel.'
          : '10 caractères minimum, avec majuscule, minuscule et chiffre.';
    }

    renderDoctorsOptions(
      (member?.doctor_accesses || []).map(access => Number(access.doctor_id))
    );

    updateConditionalFields();
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('team-modal-open');

    window.setTimeout(() => {
      document.getElementById('team-full-name')?.focus();
    }, 0);
  }

  function closeForm() {
    const modal = document.getElementById('team-account-modal');
    const form = document.getElementById('team-account-form');

    if (modal) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
    }

    form?.reset();

    const accountType = document.getElementById('team-account-type');
    if (accountType) {
      accountType.disabled = false;
    }

    clearFieldErrors();
    setMessage('');
    document.body.classList.remove('team-modal-open');
  }

  function validateAccountForm(form, payload) {
    clearFieldErrors();
    let valid = true;

    if (!String(payload.full_name || '').trim()) {
      setFieldError('full_name', 'Le nom complet est obligatoire.');
      valid = false;
    }

    const email = String(payload.email || '').trim();
    const phone = String(payload.phone || '').trim();

    if (!email && !phone) {
      setFieldError('email', 'Saisissez un courriel ou un téléphone.');
      setFieldError('phone', 'Saisissez un courriel ou un téléphone.');
      valid = false;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError('email', 'Adresse courriel invalide.');
      valid = false;
    }

    if (phone && !isValidLocalMobile(phone)) {
      setFieldError(
        'phone',
        'Le numéro doit être un mobile algérien valide, par exemple 0550 80 30 90.'
      );
      valid = false;
    }

    const userId = Number(payload.user_id || 0);
    const password = String(payload.temporary_password || '');

    if (userId === 0 && password.length < 10) {
      setFieldError(
        'temporary_password',
        'Le mot de passe temporaire doit contenir au moins 10 caractères.'
      );
      valid = false;
    } else if (password && password.length < 10) {
      setFieldError(
        'temporary_password',
        'Le mot de passe temporaire doit contenir au moins 10 caractères.'
      );
      valid = false;
    }

    if (
      password
      && !(/[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password))
    ) {
      setFieldError(
        'temporary_password',
        'Ajoutez au moins une majuscule, une minuscule et un chiffre.'
      );
      valid = false;
    }

    if (
      payload.account_type === 'secretary'
      && payload.doctor_ids.length === 0
    ) {
      setFieldError('doctor_ids', 'Attribuez au moins un médecin à ce compte.');
      valid = false;
    }

    if (!valid) {
      form.querySelector('.has-error input, .has-error select')?.focus();
    }

    return valid;
  }

  async function loadTeam() {
    const section = document.getElementById('team-settings-section');
    const body = document.getElementById('team-table-body');
    if (!section || !body) return;

    try {
      const response = await requestJson(API.list);
      state.members = response.data?.members || [];
      state.doctors = response.data?.doctors || [];
      section.hidden = false;
      renderTable();
      renderDoctorsOptions();
    } catch (error) {
      if (error.status === 403 || String(error.message).includes('accès')) {
        section.remove();
        return;
      }

      section.hidden = false;
      body.innerHTML = '<tr><td colspan="6" class="v1-empty-cell">Impossible de charger l’équipe.</td></tr>';
      const detail = error.serverError ? ` Détail : ${error.serverError}` : '';
      const reference = error.errorId ? ` Référence : ${error.errorId}.` : '';
      setMessage(`${error.message}${detail}${reference}`, 'error');

      if (error.serverError) {
        console.error('MARKI — détail technique équipe :', error.serverError);
      }
    }
  }

  async function saveAccount(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const button = document.getElementById('team-form-save-button');
    const payload = Object.fromEntries(new FormData(form).entries());

    payload.doctor_ids = [...form.querySelectorAll('[name="doctor_ids[]"]:checked')]
      .map(input => Number(input.value));

    const accountType = document.getElementById('team-account-type');
    payload.account_type = accountType?.value || 'secretary';
    payload.phone = formatPhoneInput(payload.phone || '');

    if (!validateAccountForm(form, payload)) {
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = 'Enregistrement…';
    }

    setMessage('');

    try {
      const response = await requestJson(API.save, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      state.members = response.data?.members || [];
      state.doctors = response.data?.doctors || [];
      renderTable();
      closeForm();
      notify(response.message || 'Compte enregistré avec succès.', 'success');
    } catch (error) {
      renderFieldErrors(error.fieldErrors || {});

      if (!error.fieldErrors || Object.keys(error.fieldErrors).length === 0) {
        setMessage(error.message, 'error');
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Enregistrer le compte';
      }
    }
  }

  function openStatusConfirmation(userId) {
    const member = state.members.find(item => Number(item.id) === userId);
    const modal = document.getElementById('team-confirm-modal');
    const title = document.getElementById('team-confirm-title');
    const message = document.getElementById('team-confirm-message');
    const confirmButton = document.getElementById('team-confirm-button');

    if (!member || !modal || !title || !message || !confirmButton) {
      return;
    }

    state.pendingToggleUserId = userId;
    const isActive = member.status === 'active';

    title.textContent = isActive ? 'Désactiver ce compte ?' : 'Réactiver ce compte ?';
    message.textContent = isActive
      ? `${member.full_name} ne pourra plus se connecter. Son historique sera conservé.`
      : `${member.full_name} pourra de nouveau se connecter à MARKI.`;
    confirmButton.textContent = isActive ? 'Désactiver' : 'Réactiver';
    confirmButton.classList.toggle('is-danger', isActive);

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('team-modal-open');
    window.setTimeout(() => confirmButton.focus(), 0);
  }

  function closeStatusConfirmation() {
    const modal = document.getElementById('team-confirm-modal');

    if (modal) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
    }

    state.pendingToggleUserId = null;
    document.body.classList.remove('team-modal-open');
  }

  async function confirmStatusChange() {
    const userId = Number(state.pendingToggleUserId || 0);
    const button = document.getElementById('team-confirm-button');

    if (userId <= 0) return;

    if (button) {
      button.disabled = true;
      button.textContent = 'Traitement…';
    }

    try {
      const response = await requestJson(API.toggle, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
      });

      state.members = response.data?.members || [];
      state.doctors = response.data?.doctors || [];
      renderTable();
      closeStatusConfirmation();
      notify(response.message || 'État du compte modifié.', 'success');
    } catch (error) {
      closeStatusConfirmation();
      setMessage(error.message, 'error');
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }

  function handlePhoneInput(event) {
    event.currentTarget.value = formatPhoneInput(event.currentTarget.value);
    setFieldError('phone', '');
    event.currentTarget.closest('.v1-field')?.classList.remove('has-error');
  }


  function handleTeamKeydown(event) {
    if (event.key !== 'Escape') return;

    const confirmModal = document.getElementById('team-confirm-modal');
    if (confirmModal && !confirmModal.hidden) {
      closeStatusConfirmation();
      return;
    }

    const accountModal = document.getElementById('team-account-modal');
    if (accountModal && !accountModal.hidden) {
      closeForm();
    }
  }

  function initTeamPage() {
    const section = document.getElementById('team-settings-section');
    if (!section) return;

    const canManageTeam = Boolean(
      window.MARKI_CONTEXT?.capabilities?.['team.manage']
    );

    if (!canManageTeam) {
      section.remove();
      return;
    }

    document
      .getElementById('team-new-account-button')
      ?.addEventListener('click', () => openForm());
    document
      .getElementById('team-form-close-button')
      ?.addEventListener('click', closeForm);
    document
      .getElementById('team-form-cancel-button')
      ?.addEventListener('click', closeForm);
    document
      .getElementById('team-account-modal-backdrop')
      ?.addEventListener('click', closeForm);
    document
      .getElementById('team-account-type')
      ?.addEventListener('change', updateConditionalFields);
    document
      .getElementById('team-phone')
      ?.addEventListener('input', handlePhoneInput);
    document
      .getElementById('team-account-form')
      ?.addEventListener('submit', saveAccount);

    document
      .getElementById('team-confirm-close-button')
      ?.addEventListener('click', closeStatusConfirmation);
    document
      .getElementById('team-confirm-cancel-button')
      ?.addEventListener('click', closeStatusConfirmation);
    document
      .getElementById('team-confirm-backdrop')
      ?.addEventListener('click', closeStatusConfirmation);
    document
      .getElementById('team-confirm-button')
      ?.addEventListener('click', confirmStatusChange);

    if (!escapeHandlerBound) {
      document.addEventListener('keydown', handleTeamKeydown);
      escapeHandlerBound = true;
    }

    return loadTeam();
  }

  window.initMarkiTeam = async function () {
    return initTeamPage();
  };
})();
