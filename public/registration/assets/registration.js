(function () {
  'use strict';

  const app = document.getElementById('public-registration-app');
  if (!app) return;

  const state = {
    link: app.dataset.link || '',
    token: app.dataset.token || '',
    csrf: document.querySelector('meta[name="csrf-token"]')?.content || '',
    allowSharedPhone: false,
    requirements: null,
    submitting: false
  };

  const elements = {
    loading: document.getElementById('registration-loading'),
    unavailable: document.getElementById('registration-unavailable'),
    unavailableMessage: document.getElementById('registration-unavailable-message'),
    contact: document.getElementById('registration-contact'),
    content: document.getElementById('registration-content'),
    introduction: document.getElementById('registration-introduction'),
    doctorName: document.getElementById('registration-doctor-name'),
    doctorSpecialty: document.getElementById('registration-doctor-specialty'),
    clinicName: document.getElementById('registration-clinic-name'),
    openMessage: document.getElementById('registration-open-message'),
    form: document.getElementById('public-registration-form'),
    fullName: document.getElementById('registration-full-name'),
    phone: document.getElementById('registration-phone'),
    birthDate: document.getElementById('registration-birth-date'),
    birthRequired: document.getElementById('registration-birth-date-required'),
    consent: document.getElementById('registration-privacy-consent'),
    sharedBox: document.getElementById('registration-shared-phone'),
    sharedMessage: document.getElementById('registration-shared-phone-message'),
    confirmShared: document.getElementById('registration-confirm-shared-phone'),
    message: document.getElementById('registration-form-message'),
    submit: document.getElementById('registration-submit')
  };

  function setHidden(element, hidden) {
    if (element) element.hidden = hidden;
  }

  function frenchBirthDateToIso(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const iso = `${match[3]}-${match[2]}-${match[1]}`;
    const date = new Date(`${iso}T00:00:00`);
    return !Number.isNaN(date.getTime())
      && date.getFullYear() === Number(match[3])
      && date.getMonth() + 1 === Number(match[2])
      && date.getDate() === Number(match[1])
        ? iso
        : null;
  }

  function bindFrenchBirthDateInput(input) {
    if (!input) return;
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '').slice(0, 8);
      input.value = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
        .filter(Boolean)
        .join('/');
    });
  }

  const STORAGE_PREFIX = 'marki:public-registration:';

  function storageKey() {
    return `${STORAGE_PREFIX}${state.link}`;
  }

  function readSavedSession() {
    try {
      const raw = window.localStorage.getItem(storageKey());
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn('Stockage local indisponible :', error);
      return null;
    }
  }

  function saveSession(sessionToken, statusPath) {
    if (!sessionToken || !statusPath) return;

    try {
      window.localStorage.setItem(storageKey(), JSON.stringify({
        session: sessionToken,
        status_path: statusPath,
        saved_at: Date.now()
      }));
    } catch (error) {
      console.warn('Impossible de mémoriser le suivi :', error);
    }
  }

  function clearSavedSession() {
    try {
      window.localStorage.removeItem(storageKey());
    } catch (error) {
      console.warn('Impossible de nettoyer le suivi mémorisé :', error);
    }
  }

  async function restoreActiveSession() {
    const saved = readSavedSession();

    if (!saved?.session || !saved?.status_path) {
      return false;
    }

    try {
      const params = new URLSearchParams({ session: saved.session });
      const response = await fetch(`api/status.php?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const data = await readJson(response);

      if (!response.ok || !data?.ok) {
        clearSavedSession();
        return false;
      }

      const status = data.data?.registration?.status || '';
      const activeStatuses = ['waiting', 'called'];

      if (activeStatuses.includes(status)) {
        window.location.replace(saved.status_path);
        return true;
      }

      clearSavedSession();
      return false;
    } catch (error) {
      clearSavedSession();
      return false;
    }
  }

  function setMessage(message = '', type = '') {
    if (!elements.message) return;
    elements.message.textContent = message;
    elements.message.className = 'public-registration-message';
    if (message && type) {
      elements.message.classList.add(`is-${type}`);
    }
  }

  function clearErrors() {
    document.querySelectorAll('[data-error-for]').forEach(error => {
      error.textContent = '';
    });
    document.querySelectorAll('.public-registration-field.is-invalid').forEach(field => {
      field.classList.remove('is-invalid');
    });
  }

  function showErrors(errors = {}) {
    Object.entries(errors).forEach(([name, message]) => {
      const error = document.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
      if (error) error.textContent = String(message || '');

      const field = document.querySelector(`[name="${CSS.escape(name)}"]`);
      field?.closest('.public-registration-field')?.classList.add('is-invalid');
    });

    const firstFieldName = Object.keys(errors)[0];
    if (firstFieldName) {
      document.querySelector(`[name="${CSS.escape(firstFieldName)}"]`)?.focus();
    }
  }

  async function readJson(response) {
    const raw = await response.text();
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error('Réponse publique non JSON :', raw);
      throw new Error('Le serveur a renvoyé une réponse invalide.');
    }
  }

  function contextUrl() {
    const params = new URLSearchParams({
      link: state.link,
      token: state.token
    });
    return `api/context.php?${params.toString()}`;
  }

  async function loadContext() {
    setHidden(elements.loading, false);
    setHidden(elements.unavailable, true);
    setHidden(elements.content, true);

    try {
      const response = await fetch(contextUrl(), {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const data = await readJson(response);

      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || 'Ce lien ne peut pas être utilisé.');
      }

      state.csrf = data.csrf_token || state.csrf;
      state.requirements = data.data.requirements || {};
      renderContext(data.data);
    } catch (error) {
      setHidden(elements.loading, true);
      setHidden(elements.content, true);
      setHidden(elements.unavailable, false);
      if (elements.unavailableMessage) {
        elements.unavailableMessage.textContent = error.message;
      }
    }
  }

  function renderContext(data) {
    const clinic = data.clinic || {};
    const doctor = data.doctor || {};
    const availability = data.availability || {};

    if (elements.introduction) {
      elements.introduction.textContent =
        `Inscription à la liste d’attente de ${doctor.name || 'votre médecin'}.`;
    }
    if (elements.doctorName) elements.doctorName.textContent = doctor.name || 'Médecin';
    if (elements.doctorSpecialty) {
      elements.doctorSpecialty.textContent = doctor.specialty || 'Consultation médicale';
    }
    if (elements.clinicName) elements.clinicName.textContent = clinic.name || 'Cabinet médical';

    if (elements.contact && clinic.phone) {
      elements.contact.textContent = `Cabinet : ${clinic.phone}`;
      elements.contact.hidden = false;
    }

    setHidden(elements.loading, true);

    if (!availability.can_register) {
      setHidden(elements.content, true);
      setHidden(elements.unavailable, false);
      if (elements.unavailableMessage) {
        elements.unavailableMessage.textContent = availability.message || 'Inscription indisponible.';
      }
      return;
    }

    setHidden(elements.unavailable, true);
    setHidden(elements.content, false);
    if (elements.openMessage) {
      elements.openMessage.textContent = availability.message || '';
    }

    const birthRequired = Boolean(state.requirements?.birth_date_required);
    if (elements.birthDate) elements.birthDate.required = birthRequired;
    if (elements.birthRequired) elements.birthRequired.hidden = !birthRequired;

    if (elements.birthDate && data.today) {
      elements.birthDate.max = data.today;
    }

    window.MarkiPhone?.bind(document);
  }

  function currentPayload() {
    return {
      link: state.link,
      token: state.token,
      full_name: elements.fullName?.value.trim() || '',
      phone: elements.phone?.value.trim() || '',
      birth_date: frenchBirthDateToIso(elements.birthDate?.value) || '',
      privacy_consent: Boolean(elements.consent?.checked),
      allow_shared_phone: state.allowSharedPhone
    };
  }

  function resetSharedPhoneConfirmation() {
    state.allowSharedPhone = false;
    setHidden(elements.sharedBox, true);
    if (elements.sharedMessage) elements.sharedMessage.textContent = '';
  }

  async function submitRegistration(event) {
    event?.preventDefault();
    if (state.submitting) return;

    clearErrors();
    setMessage();
    if (frenchBirthDateToIso(elements.birthDate?.value) === null) {
      showErrors({ birth_date: 'Utilisez le format JJ/MM/AAAA.' });
      return;
    }
    state.submitting = true;

    if (elements.submit) {
      elements.submit.disabled = true;
      elements.submit.innerHTML = '<span class="public-registration-spinner" style="width:18px;height:18px;border-width:2px;" aria-hidden="true"></span><span>Inscription en cours…</span>';
    }

    try {
      const response = await fetch('api/submit.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': state.csrf
        },
        body: JSON.stringify(currentPayload())
      });
      const data = await readJson(response);

      if (!response.ok || !data?.ok) {
        if (data?.data?.allow_shared_phone_prompt) {
          setHidden(elements.sharedBox, false);
          if (elements.sharedMessage) elements.sharedMessage.textContent = data.message;
          state.allowSharedPhone = true;
          elements.confirmShared?.focus();
          return;
        }

        showErrors(data?.errors || {});
        throw new Error(data?.message || 'Impossible de vous inscrire.');
      }

      resetSharedPhoneConfirmation();
      saveSession(data.data.session_token, data.data.status_path);
      setMessage(data.message || 'Inscription enregistrée.', 'success');
      window.location.assign(data.data.status_path);
    } catch (error) {
      setMessage(error.message, 'error');
    } finally {
      state.submitting = false;
      if (elements.submit) {
        elements.submit.disabled = false;
        elements.submit.innerHTML = '<svg class="mk-icon" aria-hidden="true"><use href="#mk-user-plus"></use></svg><span>Rejoindre la liste d’attente</span>';
      }
    }
  }

  elements.form?.addEventListener('submit', submitRegistration);
  elements.confirmShared?.addEventListener('click', () => {
    state.allowSharedPhone = true;
    submitRegistration();
  });

  [elements.fullName, elements.phone, elements.birthDate, elements.consent]
    .forEach(element => {
      element?.addEventListener('input', () => {
        setMessage();
        clearErrors();
        if (elements.sharedBox && !elements.sharedBox.hidden) {
          resetSharedPhoneConfirmation();
        }
      });
    });

  bindFrenchBirthDateInput(elements.birthDate);

  (async function initializeRegistration() {
    setHidden(elements.loading, false);

    const restored = await restoreActiveSession();
    if (!restored) {
      loadContext();
    }
  })();
})();
