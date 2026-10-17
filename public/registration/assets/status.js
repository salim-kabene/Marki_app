(function () {
  'use strict';

  const app = document.getElementById('public-status-app');
  if (!app) return;

  const state = {
    session: app.dataset.session || '',
    csrf: document.querySelector('meta[name="csrf-token"]')?.content || '',
    loading: false,
    timer: null,
    alertEnabled: false,
    alertsSent: new Set(),
    audio: null
  };

  // Une alerte se déclenche quand il ne reste plus que ce nombre de patients devant.
  const ALERT_AHEAD_THRESHOLD = 1;

  const STEP_STATES = {
    waiting: {
      registered: 'done',
      waiting: 'current',
      consultation: 'upcoming',
      notes: { waiting: 'Vous êtes ici', consultation: 'Bientôt !' }
    },
    called: {
      registered: 'done',
      waiting: 'done',
      consultation: 'current',
      notes: { waiting: 'Terminé', consultation: 'C’est votre tour' }
    },
    done: {
      registered: 'done',
      waiting: 'done',
      consultation: 'done',
      notes: { waiting: 'Terminé', consultation: 'Terminée' }
    }
  };

  const STORAGE_PREFIX = 'marki:public-registration:';

  const elements = {
    loading: document.getElementById('status-loading'),
    error: document.getElementById('status-error'),
    errorMessage: document.getElementById('status-error-message'),
    content: document.getElementById('status-content'),
    patientName: document.getElementById('status-patient-name'),
    doctorName: document.getElementById('status-doctor-name'),
    doctorLine: document.getElementById('status-doctor-line'),
    steps: document.getElementById('status-steps'),
    stepTime: document.getElementById('status-step-time'),
    notifyCard: document.getElementById('status-notify-card'),
    notify: document.getElementById('status-notify'),
    notifyHint: document.getElementById('status-notify-hint'),
    position: document.getElementById('status-position'),
    createdAt: document.getElementById('status-created-at'),
    label: document.getElementById('status-label'),
    ahead: document.getElementById('status-ahead'),
    aheadNote: document.getElementById('status-ahead-note'),
    guidance: document.getElementById('status-guidance'),
    clinicName: document.getElementById('status-clinic-name'),
    phone: document.getElementById('status-phone'),
    refreshedAt: document.getElementById('status-refreshed-at'),
    refresh: document.getElementById('status-refresh'),
    cancel: document.getElementById('status-cancel'),
    message: document.getElementById('status-message'),
    modal: document.getElementById('status-cancel-modal'),
    confirmCancel: document.getElementById('status-confirm-cancel')
  };

  function clearSavedSessionForCurrentToken() {
    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (!key?.startsWith(STORAGE_PREFIX)) continue;

        const raw = window.localStorage.getItem(key);
        const saved = raw ? JSON.parse(raw) : null;

        if (saved?.session === state.session) {
          window.localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.warn('Impossible de nettoyer le suivi local :', error);
    }
  }

  async function readJson(response) {
    const raw = await response.text();
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error('Réponse suivi non JSON :', raw);
      throw new Error('Le serveur a renvoyé une réponse invalide.');
    }
  }

  function setMessage(message = '', type = '') {
    if (!elements.message) return;
    elements.message.textContent = message;
    elements.message.className = 'public-registration-message';
    if (message && type) elements.message.classList.add(`is-${type}`);
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const normalized = String(value).replace(' ', 'T');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('fr-DZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(date);
  }

  function formatTime(value) {
    if (!value) return '—';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('fr-DZ', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(date);
  }

  function renderSteps(status) {
    if (!elements.steps) return;
    const config = STEP_STATES[status] || STEP_STATES.waiting;

    elements.steps.querySelectorAll('[data-step]').forEach(step => {
      const key = step.dataset.step;
      const stepState = config[key] || 'upcoming';
      step.dataset.state = stepState;
      if (stepState === 'current') {
        step.setAttribute('aria-current', 'step');
      } else {
        step.removeAttribute('aria-current');
      }

      const note = step.querySelector('[data-step-note]');
      if (note && config.notes[key]) note.textContent = config.notes[key];
    });
  }

  function guidanceFor(registration) {
    const status = registration.status;
    if (status === 'waiting') {
      const ahead = Number(registration.patients_ahead ?? 0);
      if (ahead === 1) {
        return 'Il reste 1 patient devant vous. Gardez cette page pour suivre votre position.';
      }
      if (ahead > 1) {
        return `Il reste ${ahead} patients devant vous. Gardez cette page pour suivre votre position.`;
      }
      return 'Vous êtes le prochain patient en attente. Restez disponible.';
    }
    if (status === 'called') return 'Le cabinet vous appelle. Présentez-vous auprès du secrétariat.';
    if (status === 'no_show') return 'Vous avez été marqué absent. Contactez le secrétariat pour savoir si vous pouvez être réintégré.';
    if (status === 'done') return 'Votre passage est terminé. Merci d’avoir utilisé MARKI.';
    if (status === 'canceled') return 'Cette inscription a été annulée.';
    return 'Votre inscription est enregistrée.';
  }

  function render(data) {
    const patient = data.patient || {};
    const doctor = data.doctor || {};
    const clinic = data.clinic || {};
    const registration = data.registration || {};

    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.content.hidden = false;

    app.dataset.status = registration.status || 'waiting';

    if (elements.patientName) elements.patientName.textContent = patient.name || '—';
    if (elements.doctorName) elements.doctorName.textContent = doctor.name || '—';
    if (elements.doctorLine) {
      elements.doctorLine.textContent = doctor.specialty || '';
      elements.doctorLine.hidden = !doctor.specialty;
    }
    if (elements.position) elements.position.textContent = registration.position_number ?? '—';
    if (elements.createdAt) {
      elements.createdAt.textContent = formatDateTime(registration.created_at);
    }
    if (elements.stepTime) elements.stepTime.textContent = formatTime(registration.created_at);
    renderSteps(registration.status);
    if (elements.label) {
      elements.label.textContent = registration.status_label || '—';
      elements.label.dataset.status = registration.status || '';
    }
    const patientsAhead = Number(registration.patients_ahead ?? 0);
    if (elements.ahead) elements.ahead.textContent = String(patientsAhead);
    if (elements.aheadNote) {
      elements.aheadNote.textContent = patientsAhead === 0
        ? 'Vous êtes le prochain'
        : 'avant votre tour';
    }
    if (elements.guidance) {
      elements.guidance.textContent = guidanceFor(registration);
      elements.guidance.className = `public-registration-notice is-${registration.status || 'waiting'}`;
    }
    if (elements.clinicName) elements.clinicName.textContent = clinic.name || '—';
    if (elements.phone) elements.phone.textContent = patient.phone || '—';
    if (elements.refreshedAt) {
      elements.refreshedAt.textContent = new Intl.DateTimeFormat('fr-DZ', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      }).format(new Date());
    }
    if (elements.cancel) elements.cancel.hidden = !registration.can_cancel;

    if (elements.notifyCard) elements.notifyCard.hidden = registration.status !== 'waiting';
    checkAlert(registration);

    if (['done', 'canceled', 'no_show'].includes(registration.status)) {
      clearSavedSessionForCurrentToken();
    }
  }

  async function loadStatus(options = {}) {
    if (state.loading) return;
    state.loading = true;
    if (!options.silent) {
      setMessage();
      if (elements.refresh) elements.refresh.disabled = true;
    }

    try {
      const params = new URLSearchParams({ session: state.session });
      const response = await fetch(`api/status.php?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const data = await readJson(response);

      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || 'Impossible de charger votre inscription.');
      }

      state.csrf = data.csrf_token || state.csrf;
      render(data.data);
    } catch (error) {
      elements.loading.hidden = true;
      elements.content.hidden = true;
      elements.error.hidden = false;
      if (elements.errorMessage) elements.errorMessage.textContent = error.message;
      clearSavedSessionForCurrentToken();
      if (state.timer) clearInterval(state.timer);
    } finally {
      state.loading = false;
      if (elements.refresh) elements.refresh.disabled = false;
    }
  }

  function playChime(repeat = 1) {
    const audio = state.audio;
    if (!audio) return;
    if (audio.state === 'suspended') audio.resume().catch(() => {});

    for (let index = 0; index < repeat; index += 1) {
      const start = audio.currentTime + index * 0.45;
      [880, 1175].forEach((frequency, toneIndex) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const toneStart = start + toneIndex * 0.16;
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, toneStart);
        gain.gain.exponentialRampToValueAtTime(0.25, toneStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + 0.3);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(toneStart);
        oscillator.stop(toneStart + 0.32);
      });
    }
  }

  function alertKeyFor(registration) {
    if (registration.status === 'called') return 'called';
    if (
      registration.status === 'waiting'
      && Number(registration.patients_ahead ?? 0) <= ALERT_AHEAD_THRESHOLD
    ) {
      return 'near';
    }
    return '';
  }

  function sendAlert(key) {
    const message = key === 'called'
      ? 'Le cabinet vous appelle. Présentez-vous au secrétariat.'
      : 'C’est presque votre tour. Préparez-vous à vous présenter.';

    playChime(3);
    if (typeof navigator.vibrate === 'function') navigator.vibrate([300, 150, 300, 150, 300]);

    if (
      'Notification' in window
      && Notification.permission === 'granted'
      && document.hidden
    ) {
      try {
        new Notification('MARKI', { body: message, tag: 'marki-status' });
      } catch (error) {
        // Certains navigateurs mobiles refusent les notifications hors service worker.
      }
    }
  }

  function checkAlert(registration) {
    const key = alertKeyFor(registration);
    if (!key || state.alertsSent.has(key)) return;
    state.alertsSent.add(key);
    if (state.alertEnabled) sendAlert(key);
  }

  function setAlertEnabled(enabled) {
    state.alertEnabled = enabled;
    if (elements.notify) elements.notify.setAttribute('aria-checked', enabled ? 'true' : 'false');
    if (elements.notifyHint) {
      elements.notifyHint.textContent = enabled
        ? 'Alerte activée. Gardez cette page ouverte pour l’entendre.'
        : 'Recevez une alerte sonore quand ce sera presque votre tour.';
    }
  }

  function toggleAlert() {
    if (state.alertEnabled) {
      setAlertEnabled(false);
      return;
    }

    // Le son doit être débloqué pendant le geste de l'utilisateur.
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!state.audio && AudioContextClass) state.audio = new AudioContextClass();
    setAlertEnabled(true);
    playChime(1);

    if (
      'Notification' in window
      && window.isSecureContext
      && Notification.permission === 'default'
    ) {
      Notification.requestPermission().catch(() => {});
    }
  }

  function openModal() {
    if (!elements.modal) return;
    elements.modal.hidden = false;
    elements.modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-modal');
    elements.confirmCancel?.focus();
  }

  function closeModal() {
    if (!elements.modal) return;
    elements.modal.hidden = true;
    elements.modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('has-modal');
  }

  async function cancelRegistration() {
    if (!elements.confirmCancel) return;
    elements.confirmCancel.disabled = true;
    elements.confirmCancel.textContent = 'Annulation…';

    try {
      const response = await fetch('api/cancel.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': state.csrf
        },
        body: JSON.stringify({ session: state.session })
      });
      const data = await readJson(response);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || 'Impossible d’annuler votre inscription.');
      }

      closeModal();
      setMessage(data.message, 'success');
      await loadStatus({ silent: true });
    } catch (error) {
      closeModal();
      setMessage(error.message, 'error');
    } finally {
      elements.confirmCancel.disabled = false;
      elements.confirmCancel.textContent = 'Confirmer l’annulation';
    }
  }

  elements.refresh?.addEventListener('click', () => loadStatus());
  elements.notify?.addEventListener('click', toggleAlert);
  elements.cancel?.addEventListener('click', openModal);
  elements.confirmCancel?.addEventListener('click', cancelRegistration);
  document.querySelectorAll('[data-close-status-modal]').forEach(button => {
    button.addEventListener('click', closeModal);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && elements.modal && !elements.modal.hidden) {
      closeModal();
    }
  });

  loadStatus();
  state.timer = window.setInterval(() => loadStatus({ silent: true }), 5000);
})();
