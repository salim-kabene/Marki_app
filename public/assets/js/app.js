function getCsrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content || (window.markiAuth?.csrfToken?.() || '');
}

const ADD_PATIENT_API_URL = 'api/queue_add_patient.php';
const UPDATE_QUEUE_STATUS_API_URL = 'api/queue_update_status.php';
const UPDATE_PATIENT_API_URL = 'api/queue_update_patient.php';
const TOGGLE_QUEUE_STATUS_API_URL = 'api/queue_toggle_status.php';
const CHANGE_QUEUE_DAY_STATUS_API_URL = 'api/queue_change_day_status.php';
const QUEUE_ENTRIES_API_URL = 'api/queue_entries.php';

/*
|--------------------------------------------------------------------------
| État temporaire de confirmation d’un téléphone partagé
|--------------------------------------------------------------------------
| Le premier submit affiche un avertissement.
| Le deuxième submit confirme l’utilisation du numéro partagé.
|--------------------------------------------------------------------------
*/
let pendingSharedPhonePayload = null;
let pendingSharedPhoneMode = null;

/*
|--------------------------------------------------------------------------
| Action métier en attente de confirmation
|--------------------------------------------------------------------------
*/
let pendingQueueAction = null;
/*
|--------------------------------------------------------------------------
| État central de la Liste du jour
|--------------------------------------------------------------------------
| entries :
| toutes les entrées reçues de l’API, dans l’ordre FIFO.
|
| selectedEntryId :
| patient actuellement affiché dans le panneau de détails.
|
| Le patient actuel, lui, est toujours calculé comme le premier
| patient ayant le statut waiting.
|--------------------------------------------------------------------------
*/
const dashboardState = {
  entries: [],
  queue: null,
  searchTerm: '',
  statusFilter: 'all',
  pageSize: 12,
  currentPage: 1,
  selectedEntryId: null,
  expandedEntryId: null,
  scrollToEntryId: null,
  // Fiche complète ouverte dans la carte (mobile).
  inlineRecordPatientId: null
};

// Fiches complètes déjà chargées, réaffichées après un rafraîchissement.
const inlinePatientRecordCache = new Map();

/*
|--------------------------------------------------------------------------
| Temporisation légère de la recherche
|--------------------------------------------------------------------------
| On évite de recalculer le tableau à chaque frappe extrêmement rapide.
|--------------------------------------------------------------------------
*/
let dashboardSearchTimer = null;
let dashboardAutoRefreshTimer = null;
let dashboardLoadInFlight = false;
let dashboardKnownEntryIds = new Set();
let dashboardInitialLoadComplete = false;
let dashboardVisibilityHandlerBound = false;

function stopDashboardAutoRefresh() {
  if (dashboardAutoRefreshTimer !== null) {
    window.clearInterval(dashboardAutoRefreshTimer);
    dashboardAutoRefreshTimer = null;
  }
}

function dashboardHasOpenModal() {
  return Boolean(
    document.querySelector(
      '.marki-modal.is-open, '
      + '.team-modal:not([hidden]), '
      + '.public-registration-modal:not([hidden]), '
      + '[aria-hidden="false"][role="dialog"], '
      + '[aria-hidden="false"][role="alertdialog"]'
    )
  );
}

function notifyNewQrRegistrations(entries) {
  const currentIds = new Set(
    entries.map(entry => String(entry.id))
  );

  if (dashboardInitialLoadComplete) {
    const newQrEntries = entries.filter(entry => (
      entry.source === 'qr'
      && !dashboardKnownEntryIds.has(String(entry.id))
    ));

    if (newQrEntries.length > 0) {
      const message = newQrEntries.length === 1
        ? `Nouvelle inscription en ligne : ${newQrEntries[0].display_name}.`
        : `${newQrEntries.length} nouvelles inscriptions en ligne.`;

      showToast(message, 'success');
    }
  }

  dashboardKnownEntryIds = currentIds;
  dashboardInitialLoadComplete = true;
}

function startDashboardAutoRefresh() {
  stopDashboardAutoRefresh();

  dashboardAutoRefreshTimer = window.setInterval(() => {
    const dashboardVisible = Boolean(
      document.getElementById('day-list-table-body')
    );

    if (
      !dashboardVisible
      || document.hidden
      || dashboardHasOpenModal()
    ) {
      return;
    }

    loadDashboardData({ silent: true });
  }, 2500);

  if (!dashboardVisibilityHandlerBound) {
    document.addEventListener('visibilitychange', () => {
      if (
        !document.hidden
        && document.getElementById('day-list-table-body')
      ) {
        loadDashboardData({ silent: true });
      }
    });

    dashboardVisibilityHandlerBound = true;
  }
}
/*
|--------------------------------------------------------------------------
| Récupérer les éléments de la modal patient
|--------------------------------------------------------------------------
*/
function getAddPatientModalElements() {
  return {
    modal: document.getElementById('addPatientModal'),
    openBtn: document.getElementById('openAddPatientModalBtn'),
    closeBtn: document.getElementById('closeAddPatientModalBtn'),
    cancelBtn: document.getElementById('cancelAddPatientBtn'),
    form: document.getElementById('addPatientForm'),
    formModeInput: document.getElementById('addPatientFormMode'),
    entryIdInput: document.getElementById('addPatientEntryId'),
    messageBox: document.getElementById('addPatientFormMessage'),
    submitBtn: document.getElementById('submitAddPatientBtn'),
    titleEl: document.getElementById('addPatientModalTitle'),
    fullNameInput: document.getElementById('addPatientFullName'),
    phoneInput: document.getElementById('addPatientPhone'),
    birthDateInput: document.getElementById('addPatientBirthDate'),
    backdrop: document.querySelector('[data-close-add-patient-modal]'),
    sharedPhoneConfirmBox: document.getElementById(
      'sharedPhoneConfirmBox'
    ),
    sharedPhoneConfirmText: document.getElementById(
      'sharedPhoneConfirmText'
    )
  };
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
  if (!input || input.dataset.frenchDateBound === '1') return;
  input.dataset.frenchDateBound = '1';
  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '').slice(0, 8);
    input.value = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
      .filter(Boolean)
      .join('/');
  });
}
/*
|--------------------------------------------------------------------------
| Normaliser un nom de personne côté front
|--------------------------------------------------------------------------
| Objectifs :
| - enlever les espaces inutiles
| - éviter les doubles espaces
| - mettre une casse propre :
|   première lettre de chaque mot en majuscule, le reste en minuscule
|--------------------------------------------------------------------------
|
| Pourquoi le faire aussi côté front ?
| - meilleure UX
| - données plus propres dès la saisie
| - cohérence visuelle immédiate
|--------------------------------------------------------------------------
*/
function normalizePersonName(value) {
  if (!value) return '';

  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(word => {
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}
/*
|--------------------------------------------------------------------------
| Normaliser un numéro de téléphone côté front
|--------------------------------------------------------------------------
| Exemples :
| +213 551 70 07 10  -> 0551700710
| 00213 551700710    -> 0551700710
|--------------------------------------------------------------------------
*/
function normalizePhoneNumber(value) {
  if (window.MarkiPhone) {
    return window.MarkiPhone.localMobileDigits(value);
  }

  return String(value ?? '').replace(/\D+/g, '').slice(0, 10);
}

/*
|--------------------------------------------------------------------------
| Vérifier le format général du téléphone
|--------------------------------------------------------------------------
*/
function isValidPhoneNumber(phone) {
  return window.MarkiPhone
    ? window.MarkiPhone.isValidMobile(phone)
    : /^0[567]\d{8}$/.test(phone);
}
/*
|--------------------------------------------------------------------------
| Lire une réponse HTTP en JSON robuste
|--------------------------------------------------------------------------
| Pourquoi cette fonction ?
| - si le backend renvoie du HTML / warning PHP / notice,
|   response.json() casse brutalement
| - ici on lit d'abord le texte brut, puis on parse le JSON
|--------------------------------------------------------------------------
*/
async function parseJsonResponseSafely(response) {
  const rawText = await response.text();

  try {
    return JSON.parse(rawText);
  } catch (error) {
    console.error('Réponse backend non JSON :', rawText);
    throw new Error('Le serveur a renvoyé une réponse invalide. Réessayez dans quelques instants.');
  }
}
/*
|--------------------------------------------------------------------------
| Ouvrir la modal d'ajout patient
|--------------------------------------------------------------------------
| Cette fonction :
| - vérifie que la modal existe
| - vérifie aussi que le bouton n'est pas désactivé
| - ouvre ensuite la modal et reset le formulaire
|--------------------------------------------------------------------------
|
| Pourquoi vérifier le bouton ici aussi ?
| - sécurité UX supplémentaire
| - évite une ouverture accidentelle si quelqu’un appelle la fonction
|   manuellement depuis la console
|--------------------------------------------------------------------------
*/
function openAddPatientModal() {
  const {
    modal,
    fullNameInput,
    messageBox,
    form,
    openBtn
  } = getAddPatientModalElements();

  /*
  |--------------------------------------------------------------
  | Si la modal n'existe pas, on ne fait rien
  |--------------------------------------------------------------
  */
  if (!modal) return;

  /*
  |--------------------------------------------------------------
  | Si le bouton est désactivé, on bloque l'ouverture
  |--------------------------------------------------------------
  | Cela signifie en pratique que la liste est fermée.
  */
  if (openBtn && openBtn.disabled) {
    return;
  }

  /*
  |--------------------------------------------------------------
  | Ouvrir visuellement la modal
  |--------------------------------------------------------------
  */
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');

  /*
  |--------------------------------------------------------------
  | Réinitialiser le message de formulaire
  |--------------------------------------------------------------
  */
  if (messageBox) {
    messageBox.textContent = '';
    messageBox.className = 'marki-form__message';
  }

  /*
  |--------------------------------------------------------------
  | Réinitialiser le formulaire
  |--------------------------------------------------------------
  */
  if (form) {
    form.reset();
    form.dataset.submitting = 'false';
  }
  resetSharedPhoneConfirmation();
  setPatientModalMode('create');
  /*
  |--------------------------------------------------------------
  | Focus automatique sur le nom complet
  |--------------------------------------------------------------
  */
  if (fullNameInput) {
    setTimeout(() => fullNameInput.focus(), 0);
  }
}
/*
|--------------------------------------------------------------------------
| Fermer la modal patient
|--------------------------------------------------------------------------
*/
function closeAddPatientModal() {
  const { modal, messageBox, form, submitBtn } = getAddPatientModalElements();

  if (!modal) return;

  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');

  if (messageBox) {
    messageBox.textContent = '';
    messageBox.className = 'marki-form__message';
  }

  if (form) {
    form.reset();
    form.dataset.submitting = 'false';
  }

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Ajouter le patient';
  }

  resetSharedPhoneConfirmation();
  setPatientModalMode('create');
}
/*
|--------------------------------------------------------------------------
| Fermer la modal patient avec la touche Échap
|--------------------------------------------------------------------------
| La fonction est enregistrée une seule fois pour toute l’application.
| Elle récupère toujours la modal actuellement présente dans le DOM.
|--------------------------------------------------------------------------
*/
function handlePatientModalKeydown(event) {
  if (event.key !== 'Escape') {
    return;
  }

  const { modal } = getAddPatientModalElements();
  const queueActionModal = document.getElementById('queueActionModal');

  if (queueActionModal?.classList.contains('is-open')) {
    closeQueueActionModal();
    return;
  }

  if (!modal?.classList.contains('is-open')) {
    return;
  }

  closeAddPatientModal();
}
/*
|--------------------------------------------------------------------------
| Mettre à jour le message utilisateur dans la modal
|--------------------------------------------------------------------------
*/
function setAddPatientFormMessage(message, type = 'error') {
  const { messageBox } = getAddPatientModalElements();
  if (!messageBox) return;

  messageBox.textContent = message;
  messageBox.className = `marki-form__message is-${type}`;
}
/*
|--------------------------------------------------------------------------
| Texte normal du bouton selon le mode
|--------------------------------------------------------------------------
*/
function getPatientDefaultSubmitLabel(mode) {
  return mode === 'edit'
    ? 'Mettre à jour'
    : 'Ajouter le patient';
}

/*
|--------------------------------------------------------------------------
| Texte explicite du bouton après avertissement familial
|--------------------------------------------------------------------------
*/
function getSharedPhoneSubmitLabel(mode) {
  return mode === 'edit'
    ? 'Confirmer et mettre à jour'
    : 'Confirmer et ajouter';
}

/*
|--------------------------------------------------------------------------
| Réinitialiser l’avertissement de téléphone partagé
|--------------------------------------------------------------------------
*/
function resetSharedPhoneConfirmation() {
  const {
    sharedPhoneConfirmBox,
    sharedPhoneConfirmText,
    submitBtn,
    formModeInput
  } = getAddPatientModalElements();

  pendingSharedPhonePayload = null;
  pendingSharedPhoneMode = null;

  if (sharedPhoneConfirmBox) {
    sharedPhoneConfirmBox.hidden = true;
  }

  if (sharedPhoneConfirmText) {
    sharedPhoneConfirmText.textContent = '';
  }

  if (submitBtn) {
    /*
    |--------------------------------------------------------------------------
    | Retirer l’apparence orange du bouton de confirmation
    |--------------------------------------------------------------------------
    */
    submitBtn.classList.remove('is-confirmation');

    const mode = formModeInput?.value || 'create';

    submitBtn.textContent = getPatientDefaultSubmitLabel(mode);
  }
}
/*
|--------------------------------------------------------------------------
| Afficher l’avertissement de téléphone familial
|--------------------------------------------------------------------------
| Le bouton principal devient le bouton de confirmation.
|--------------------------------------------------------------------------
*/
function showSharedPhoneConfirmation(message, mode, payload) {
  const {
    sharedPhoneConfirmBox,
    sharedPhoneConfirmText,
    submitBtn
  } = getAddPatientModalElements();

  if (
    !sharedPhoneConfirmBox
    || !sharedPhoneConfirmText
    || !submitBtn
  ) {
    return;
  }

  /*
  |--------------------------------------------------------------------------
  | Préparer le payload du deuxième clic
  |--------------------------------------------------------------------------
  */
  pendingSharedPhonePayload = {
    ...payload,
    allow_shared_phone: true
  };

  pendingSharedPhoneMode = mode;

  sharedPhoneConfirmText.textContent = message;
  sharedPhoneConfirmBox.hidden = false;

  /*
  |--------------------------------------------------------------------------
  | Faire passer le bouton principal en mode confirmation orange
  |--------------------------------------------------------------------------
  */
  submitBtn.classList.add('is-confirmation');
  submitBtn.textContent = getSharedPhoneSubmitLabel(mode);
}
/*
|--------------------------------------------------------------------------
| Effacer les messages quand l’utilisateur modifie un champ
|--------------------------------------------------------------------------
| Modifier une valeur annule aussi la confirmation précédente.
|--------------------------------------------------------------------------
*/
function clearPatientFormFeedback() {
  const { messageBox } = getAddPatientModalElements();

  if (messageBox) {
    messageBox.textContent = '';
    messageBox.className = 'marki-form__message';
  }

  resetSharedPhoneConfirmation();
}
/*
|--------------------------------------------------------------------------
| Soumettre la modal patient
|--------------------------------------------------------------------------
| Première requête :
| - ajout normal
| - ou réponse serveur demandant une confirmation
|
| Deuxième requête :
| - envoie allow_shared_phone = true
|--------------------------------------------------------------------------
*/
async function handleAddPatientSubmit(event) {
  event.preventDefault();

  const {
    form,
    submitBtn,
    fullNameInput,
    phoneInput,
    birthDateInput,
    formModeInput,
    entryIdInput
  } = getAddPatientModalElements();

  if (
    !form
    || !submitBtn
    || !fullNameInput
    || !phoneInput
  ) {
    return;
  }

  if (form.dataset.submitting === 'true') {
    return;
  }

  const mode = formModeInput?.value || 'create';
  const fullName = normalizePersonName(fullNameInput.value);
  const phone = normalizePhoneNumber(phoneInput.value);
  const birthDate = frenchBirthDateToIso(birthDateInput?.value);

  if (birthDate === null) {
    setAddPatientFormMessage('Saisissez la date de naissance au format JJ/MM/AAAA.', 'error');
    birthDateInput?.focus();
    return;
  }

  fullNameInput.value = fullName;
  /*
  |--------------------------------------------------------------------------
  | Afficher le téléphone normalisé dans le formulaire
  |--------------------------------------------------------------------------
  */
  phoneInput.value = window.MarkiPhone ? window.MarkiPhone.formatMobile(phone) : phone;
  /*
  |--------------------------------------------------------------------------
  | Validation du nom
  |--------------------------------------------------------------------------
  */
  if (!fullName) {
    setAddPatientFormMessage(
      'Le nom complet est obligatoire.',
      'error'
    );

    fullNameInput.focus();
    return;
  }

  /*
  |--------------------------------------------------------------------------
  | Validation du téléphone
  |--------------------------------------------------------------------------
  */
  if (!phone) {
    setAddPatientFormMessage('Le numéro de téléphone est obligatoire.', 'error');

    phoneInput.focus();
    return;
  }
  /*
  |--------------------------------------------------------------------------
  | Vérifier le nombre de chiffres
  |--------------------------------------------------------------------------
  */
  if (!isValidPhoneNumber(phone)) {
    setAddPatientFormMessage(
      'Le numéro doit être sous forme de 0551223344',
      'error'
    );

    phoneInput.focus();
    return;
  }
  /*
  |--------------------------------------------------------------------------
  | Construire les données normales du formulaire
  |--------------------------------------------------------------------------
  */
  const currentPayload = {
    full_name: fullName,
    phone,
    birth_date: birthDate || null,
    source: 'secretary'
  };

  if (mode === 'edit' && entryIdInput?.value) {
    currentPayload.entry_id = Number(entryIdInput.value);
  }

  /*
  |--------------------------------------------------------------------------
  | Si un avertissement a déjà été affiché, le deuxième clic utilise
  | le payload confirmé avec allow_shared_phone = true.
  |--------------------------------------------------------------------------
  */
  const isSharedPhoneConfirmation =
    pendingSharedPhonePayload !== null
    && pendingSharedPhoneMode === mode;

  const payloadToSend = isSharedPhoneConfirmation
    ? pendingSharedPhonePayload
    : currentPayload;

  form.dataset.submitting = 'true';
  submitBtn.disabled = true;

  submitBtn.textContent = isSharedPhoneConfirmation
    ? 'Confirmation...'
    : mode === 'edit'
      ? 'Mise à jour...'
      : 'Ajout en cours...';

  setAddPatientFormMessage('', 'error');

  try {
    const { response, data } = await submitPatientModalPayload(
      mode,
      payloadToSend
    );

    /*
    |--------------------------------------------------------------------------
    | Le numéro appartient déjà à un autre nom
    |--------------------------------------------------------------------------
    | On affiche un avertissement orange et on attend un deuxième clic.
    |--------------------------------------------------------------------------
    */
    if (
      !response.ok
      && data?.error_code === 'PHONE_SHARED_CONFIRMATION_REQUIRED'
    ) {
      showSharedPhoneConfirmation(
        data.message,
        mode,
        currentPayload
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | Erreur normale : doublon de nom, validation, liste fermée...
    |--------------------------------------------------------------------------
    */
    if (!response.ok) {
      resetSharedPhoneConfirmation();

      setAddPatientFormMessage(
        data?.message || 'Impossible de traiter la demande.',
        'error'
      );

      return;
    }

    resetSharedPhoneConfirmation();

    setAddPatientFormMessage(
      data?.message || (
        mode === 'edit'
          ? 'Patient mis à jour avec succès.'
          : 'Patient ajouté avec succès.'
      ),
      'success'
    );

    await loadDashboardData();

    setTimeout(() => {
      closeAddPatientModal();
    }, 400);
  } catch (error) {
    console.error('Erreur formulaire patient :', error);

    resetSharedPhoneConfirmation();

    setAddPatientFormMessage(
      error.message || 'Une erreur réseau est survenue.',
      'error'
    );
  } finally {
    form.dataset.submitting = 'false';
    submitBtn.disabled = false;

    if (
      pendingSharedPhonePayload !== null
      && pendingSharedPhoneMode === mode
    ) {
      submitBtn.textContent = getSharedPhoneSubmitLabel(mode);
    } else {
      submitBtn.textContent = getPatientDefaultSubmitLabel(mode);
    }
  }
}


/*
|--------------------------------------------------------------------------
| Afficher une notification non bloquante
|--------------------------------------------------------------------------
*/
function showToast(message, type = 'info') {
  let container = document.getElementById('marki-toast-container');

  if (!container) {
    container = document.createElement('div');
    container.id = 'marki-toast-container';
    container.className = 'marki-toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    document.body.append(container);
  }

  const toast = document.createElement('div');
  toast.className = `marki-toast marki-toast--${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.textContent = message;

  container.append(toast);

  requestAnimationFrame(() => {
    toast.classList.add('is-visible');
  });

  window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => toast.remove(), 250);
  }, 3200);
}

window.showToast = showToast;

/*
|--------------------------------------------------------------------------
| Récupérer les éléments de la modal de confirmation métier
|--------------------------------------------------------------------------
*/
function getQueueActionModalElements() {
  return {
    modal: document.getElementById('queueActionModal'),
    title: document.getElementById('queueActionModalTitle'),
    message: document.getElementById('queueActionModalMessage'),
    closeBtn: document.getElementById('closeQueueActionModalBtn'),
    cancelBtn: document.getElementById('cancelQueueActionBtn'),
    secondaryBtn: document.getElementById('secondaryQueueActionBtn'),
    confirmBtn: document.getElementById('confirmQueueActionBtn'),
    reasonGroup: document.getElementById('queueActionReasonGroup'),
    reasonSelect: document.getElementById('queueActionReason'),
    backdrop: document.querySelector('[data-close-queue-action-modal]')
  };
}

/*
|--------------------------------------------------------------------------
| Fermer la modal de confirmation métier
|--------------------------------------------------------------------------
*/
function closeQueueActionModal() {
  const {
    modal,
    secondaryBtn,
    confirmBtn,
    reasonGroup,
    reasonSelect
  } = getQueueActionModalElements();

  if (!modal) return;

  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');

  if (secondaryBtn) {
    secondaryBtn.hidden = true;
    secondaryBtn.textContent = 'Mettre en pause';
  }

  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirmer';
    confirmBtn.classList.remove('btn-primary');
    confirmBtn.classList.add('btn-danger');
  }

  if (reasonGroup) {
    reasonGroup.hidden = true;
  }

  if (reasonSelect) {
    reasonSelect.innerHTML = '';
  }

  pendingQueueAction = null;
}

/*
|--------------------------------------------------------------------------
| Ouvrir une confirmation métier réutilisable
|--------------------------------------------------------------------------
*/
function openQueueActionConfirmation(options) {
  const {
    modal,
    title,
    message,
    secondaryBtn,
    confirmBtn,
    reasonGroup,
    reasonSelect
  } = getQueueActionModalElements();

  if (!modal || !title || !message || !confirmBtn) {
    return;
  }

  pendingQueueAction = options;
  title.textContent = options.title || 'Confirmer l’action';
  message.textContent = options.message || '';
  confirmBtn.textContent = options.confirmLabel || 'Confirmer';
  confirmBtn.classList.toggle(
    'btn-primary',
    options.confirmType === 'primary'
  );
  confirmBtn.classList.toggle(
    'btn-danger',
    options.confirmType !== 'primary'
  );

  if (secondaryBtn) {
    secondaryBtn.hidden = typeof options.onSecondary !== 'function';
    secondaryBtn.textContent = options.secondaryLabel || 'Mettre en pause';
  }

  const reasonOptions = Array.isArray(options.reasonOptions)
    ? options.reasonOptions
    : [];

  if (reasonGroup && reasonSelect) {
    reasonGroup.hidden = reasonOptions.length === 0;
    reasonSelect.innerHTML = '';

    reasonOptions.forEach(optionData => {
      const option = document.createElement('option');
      option.value = optionData.value;
      option.textContent = optionData.label;
      option.selected = optionData.value === options.defaultReason;
      reasonSelect.append(option);
    });
  }

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');

  window.setTimeout(() => confirmBtn.focus(), 0);
}

/*
|--------------------------------------------------------------------------
| Brancher la modal de confirmation métier
|--------------------------------------------------------------------------
*/
function bindQueueActionModalEvents() {
  const {
    closeBtn,
    cancelBtn,
    secondaryBtn,
    confirmBtn,
    reasonSelect,
    backdrop
  } = getQueueActionModalElements();

  closeBtn?.addEventListener('click', closeQueueActionModal);
  cancelBtn?.addEventListener('click', closeQueueActionModal);
  backdrop?.addEventListener('click', closeQueueActionModal);

  secondaryBtn?.addEventListener('click', async () => {
    const callback = pendingQueueAction?.onSecondary;

    if (typeof callback !== 'function') return;

    secondaryBtn.disabled = true;

    try {
      await callback();
      closeQueueActionModal();
    } catch (error) {
      console.error('Erreur action secondaire :', error);
      showToast(
        error.message || 'Impossible d’exécuter cette action.',
        'error'
      );
    } finally {
      secondaryBtn.disabled = false;
    }
  });

  confirmBtn?.addEventListener('click', async () => {
    const callback = pendingQueueAction?.onConfirm;

    if (typeof callback !== 'function') return;

    confirmBtn.disabled = true;
    const previousLabel = confirmBtn.textContent;
    confirmBtn.textContent = 'Traitement...';

    try {
      await callback({
        reason: reasonSelect?.value || null
      });
      closeQueueActionModal();
    } catch (error) {
      console.error('Erreur action confirmée :', error);
      showToast(
        error.message || 'Impossible d’exécuter cette action.',
        'error'
      );
      confirmBtn.disabled = false;
      confirmBtn.textContent = previousLabel;
    }
  });
}

async function updateQueueEntryStatus(
  entryId,
  status,
  extraPayload = {}
) {
  const headers = { 'Content-Type': 'application/json' };
  const csrf = getCsrfToken();
  if (csrf) headers['X-CSRF-Token'] = csrf;

  const response = await fetch(UPDATE_QUEUE_STATUS_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entry_id: entryId,
      status,
      ...extraPayload
    })
  });

  const data = await parseJsonResponseSafely(response);

  if (!response.ok) {
    throw new Error(
      data?.message || 'Impossible de mettre à jour le statut.'
    );
  }

  return data;
}

/*
|--------------------------------------------------------------------------
| Ouvrir ou fermer les nouvelles inscriptions
|--------------------------------------------------------------------------
| Cette action ne clôture pas la journée et ne bloque pas les patients
| déjà présents dans la file.
|--------------------------------------------------------------------------
*/
async function toggleTodayQueueStatus() {
  const headers = { 'Content-Type': 'application/json' };
  const csrf = getCsrfToken();
  if (csrf) headers['X-CSRF-Token'] = csrf;

  const response = await fetch(TOGGLE_QUEUE_STATUS_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({})
  });

  const data = await parseJsonResponseSafely(response);

  if (!response.ok) {
    throw new Error(
      data?.message || 'Impossible de modifier l’état des inscriptions.'
    );
  }

  return data;
}

/*
|--------------------------------------------------------------------------
| Modifier l'état opérationnel de la Liste du jour
|--------------------------------------------------------------------------
*/
async function changeTodayQueueDayStatus(
  action,
  cancellationReason = null
) {
  const payload = { action };

  if (cancellationReason) {
    payload.cancellation_reason = cancellationReason;
  }

  const headers = { 'Content-Type': 'application/json' };
  const csrf = getCsrfToken();
  if (csrf) headers['X-CSRF-Token'] = csrf;

  const response = await fetch(CHANGE_QUEUE_DAY_STATUS_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const data = await parseJsonResponseSafely(response);

  if (!response.ok) {
    throw new Error(
      data?.message || 'Impossible de modifier l’état de la liste.'
    );
  }

  return data;
}

/*
|--------------------------------------------------------------------------
| Brancher les événements de la modal patient
|--------------------------------------------------------------------------
*/
function bindAddPatientModalEvents() {
  const {
    openBtn,
    closeBtn,
    cancelBtn,
    backdrop,
    form,
    fullNameInput,
    phoneInput,
    birthDateInput
  } = getAddPatientModalElements();

  openBtn?.addEventListener(
    'click',
    openAddPatientModal
  );

  closeBtn?.addEventListener(
    'click',
    closeAddPatientModal
  );

  cancelBtn?.addEventListener(
    'click',
    closeAddPatientModal
  );

  backdrop?.addEventListener(
    'click',
    closeAddPatientModal
  );

  form?.addEventListener(
    'submit',
    handleAddPatientSubmit
  );

  /*
  |--------------------------------------------------------------------------
  | Toute modification annule l’ancienne confirmation
  |--------------------------------------------------------------------------
  */
  fullNameInput?.addEventListener(
    'input',
    clearPatientFormFeedback
  );

  phoneInput?.addEventListener(
    'input',
    clearPatientFormFeedback
  );

  birthDateInput?.addEventListener(
    'change',
    clearPatientFormFeedback
  );
  bindFrenchBirthDateInput(birthDateInput);
}
/*
|--------------------------------------------------------------------------
| Brancher l'ouverture / fermeture des inscriptions
|--------------------------------------------------------------------------
*/
function bindToggleListButton() {
  const toggleButton = document.getElementById('toggle-list-btn');

  if (!toggleButton) return;

  toggleButton.addEventListener('click', () => {
    const registrationIsOpen =
      dashboardState.queue?.registration_status === 'open';

    const title = registrationIsOpen
      ? 'Fermer les inscriptions ?'
      : 'Rouvrir les inscriptions ?';

    const message = registrationIsOpen
      ? 'Aucun nouveau patient ne pourra s’inscrire manuellement, par QR code ou par lien public. Les patients déjà inscrits resteront traitables.'
      : 'Les nouvelles inscriptions seront de nouveau autorisées.';

    openQueueActionConfirmation({
      title,
      message,
      confirmLabel: registrationIsOpen
        ? 'Fermer les inscriptions'
        : 'Rouvrir les inscriptions',
      confirmType: registrationIsOpen ? 'danger' : 'primary',
      onConfirm: async () => {
        const result = await toggleTodayQueueStatus();
        showToast(result.message, 'success');
        await loadDashboardData();
      }
    });
  });
}

/*
|--------------------------------------------------------------------------
| Ouvrir / fermer le menu de gestion de la journée
|--------------------------------------------------------------------------
*/
function closeQueueDayMenu() {
  const menu = document.getElementById('queue-day-menu');
  const button = document.getElementById('queue-day-menu-btn');

  if (menu) menu.hidden = true;
  if (button) button.setAttribute('aria-expanded', 'false');
}

function handleDocumentQueueDayMenuClick(event) {
  if (!event.target.closest('.queue-day-menu-wrapper')) {
    closeQueueDayMenu();
  }
}

function bindQueueDayControls() {
  const menuButton = document.getElementById('queue-day-menu-btn');
  const menu = document.getElementById('queue-day-menu');
  const pauseButton = document.getElementById('pause-day-btn');
  const resumeButton = document.getElementById('resume-day-btn');
  const completeButton = document.getElementById('complete-day-btn');
  const reopenButton = document.getElementById(
    'reopen-completed-day-btn'
  );

  menuButton?.addEventListener('click', event => {
    event.stopPropagation();

    if (!menu) return;

    menu.hidden = !menu.hidden;
    menuButton.setAttribute(
      'aria-expanded',
      menu.hidden ? 'false' : 'true'
    );
  });

  document.removeEventListener(
    'click',
    handleDocumentQueueDayMenuClick
  );
  document.addEventListener(
    'click',
    handleDocumentQueueDayMenuClick
  );

  /*
  |--------------------------------------------------------------------------
  | Bouton de secours : annuler immédiatement la clôture
  |--------------------------------------------------------------------------
  | Aucun message de confirmation n'est affiché. Le backend restaure la queue
  | et uniquement les patients annulés automatiquement par la clôture.
  |--------------------------------------------------------------------------
  */
  reopenButton?.addEventListener('click', async () => {
    if (reopenButton.disabled) return;

    reopenButton.disabled = true;

    try {
      const result = await changeTodayQueueDayStatus('reopen');
      showToast(result.message, 'success');
      await loadDashboardData({ focusCurrent: true });
    } catch (error) {
      console.error('Erreur annulation de clôture :', error);
      showToast(
        error.message || 'Impossible d’annuler la clôture.',
        'error'
      );
    } finally {
      reopenButton.disabled = false;
    }
  });

  pauseButton?.addEventListener('click', () => {
    closeQueueDayMenu();

    openQueueActionConfirmation({
      title: 'Mettre la liste en pause ?',
      message: 'Les patients conserveront leur position. Les nouvelles inscriptions seront fermées et le traitement pourra reprendre plus tard.',
      confirmLabel: 'Mettre en pause',
      onConfirm: async () => {
        const result = await changeTodayQueueDayStatus('pause');
        showToast(result.message, 'info');
        await loadDashboardData();
      }
    });
  });

  resumeButton?.addEventListener('click', async () => {
    closeQueueDayMenu();

    try {
      const result = await changeTodayQueueDayStatus('resume');
      showToast(result.message, 'success');
      await loadDashboardData({ focusCurrent: true });
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  completeButton?.addEventListener('click', async () => {
    closeQueueDayMenu();

    const waitingCount = Number(
      document.getElementById('counter-waiting')?.textContent || 0
    );

    const completeDay = async () => {
      const result = await changeTodayQueueDayStatus(
        'complete',
        'end_of_day'
      );
      showToast(result.message, 'success');
      await loadDashboardData();
    };

    // Clôturer = la journée est finie : tous les patients doivent être passés.
    if (waitingCount === 0) {
      openQueueActionConfirmation({
        title: 'Clôturer la journée ?',
        message: 'Tous les patients sont passés. La liste du jour sera fermée et plus personne ne pourra s’inscrire aujourd’hui. Vous pourrez annuler la clôture si vous vous êtes trompé.',
        confirmLabel: 'Clôturer la journée',
        confirmType: 'primary',
        onConfirm: completeDay
      });
      return;
    }

    openQueueActionConfirmation({
      title: 'Clôturer la journée ?',
      message: `Pour clôturer, tous les patients doivent être passés. Il reste ${waitingCount} patient(s) en attente. Si vous clôturez maintenant, ils seront annulés (« fin de journée ») et devront se réinscrire un autre jour. Pour les garder, mettez plutôt la liste en pause.`,
      confirmLabel: `Clôturer et annuler ${waitingCount} inscription(s)`,
      secondaryLabel: 'Mettre en pause',
      onSecondary: async () => {
        const result = await changeTodayQueueDayStatus('pause');
        showToast(result.message, 'info');
        await loadDashboardData();
      },
      onConfirm: completeDay
    });
  });
}
// ==========================================================
// MENU / NAVIGATION
// ==========================================================

function setActiveMenuItem(page) {
    document.querySelectorAll('.sidebar__item, .mobile-bottom-nav__item').forEach(item => {
        item.classList.remove('active');

        if (item.getAttribute('data-page') === page) {
            item.classList.add('active');
        }
    });
}

// ==========================================================
// CHARGEMENT DES PAGES
// ==========================================================

let markiPageLoadController = null;
let markiPageLoadSequence = 0;
let markiCurrentPage = null;

const MARKI_NAV_ORDER = ['dashboard', 'patients', 'lists', 'settings'];

/*
| Sens de la transition : la page glisse depuis la droite quand on avance
| dans la barre de navigation, depuis la gauche quand on recule.
*/
function getPageTransitionDirection(fromPage, toPage) {
  const from = MARKI_NAV_ORDER.indexOf(fromPage);
  const to = MARKI_NAV_ORDER.indexOf(toPage);

  if (from < 0 || to < 0 || from === to) return 'none';
  return to > from ? 'forward' : 'back';
}

async function loadPage(page) {
  const mainContent = document.getElementById('main-content');

  if (!mainContent) {
    return;
  }

  mainContent.dataset.navDirection = getPageTransitionDirection(markiCurrentPage, page);
  markiCurrentPage = page;

  markiPageLoadController?.abort();
  markiPageLoadController = new AbortController();
  const sequence = ++markiPageLoadSequence;
  const extension = page === 'settings' ? 'php' : 'html';
  const source = `pages/${encodeURIComponent(page)}.${extension}`;

  try {
    const response = await fetch(source, {
      cache: 'no-store',
      signal: markiPageLoadController.signal,
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    if (!response.ok) {
      throw new Error(`Erreur de chargement de la page (${response.status})`);
    }

    const html = await response.text();

    if (sequence !== markiPageLoadSequence) {
      return;
    }

    mainContent.innerHTML = html;
    initPage(page);
  } catch (error) {
    if (error?.name === 'AbortError') {
      return;
    }

    console.error('Erreur de chargement MARKI :', error);
    mainContent.innerHTML = '<div class="v1-message is-error">Impossible de charger cette page. Réessayez.</div>';
  }
}

function initPage(page) {
  stopDashboardAutoRefresh();

  if (page === 'dashboard') {
    initDashboardPage();
    return;
  }

  if (typeof window.initMarkiV1Page === 'function') {
    window.initMarkiV1Page(page);
  }
}
window.loadPage = loadPage;
window.setActiveMenuItem = setActiveMenuItem;

// ==========================================================
// DASHBOARD / LISTE DU JOUR
// ==========================================================
/*
|--------------------------------------------------------------------------
| Réinitialiser la vue du dashboard
|--------------------------------------------------------------------------
| Utilisé lorsque la page Dashboard est chargée à nouveau.
|--------------------------------------------------------------------------
*/
function resetDashboardViewState() {
  dashboardKnownEntryIds = new Set();
  dashboardInitialLoadComplete = false;
  dashboardState.entries = [];
  dashboardState.queue = null;
  dashboardState.searchTerm = '';
  dashboardState.statusFilter = 'all';
  dashboardState.pageSize = 12;
  dashboardState.currentPage = 1;
  dashboardState.selectedEntryId = null;
  dashboardState.scrollToEntryId = null;
  dashboardState.inlineRecordPatientId = null;
  inlinePatientRecordCache.clear();
}

/*
|--------------------------------------------------------------------------
| Trouver le patient actuel selon la logique FIFO
|--------------------------------------------------------------------------
| La liste reçue de l’API est déjà triée par position_number.
| Le premier patient waiting est donc le patient actuel.
|--------------------------------------------------------------------------
*/
function getCurrentWaitingEntry() {
  return dashboardState.entries.find(
    entry => entry.status === 'waiting'
  ) || null;
}

/*
|--------------------------------------------------------------------------
| Normaliser une valeur utilisée dans la recherche
|--------------------------------------------------------------------------
*/
function normalizeDashboardSearchValue(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('fr');
}

/*
|--------------------------------------------------------------------------
| Appliquer la recherche et le filtre de statut
|--------------------------------------------------------------------------
*/
function getFilteredDashboardEntries() {
  const searchTerm = normalizeDashboardSearchValue(
    dashboardState.searchTerm
  );

  const searchedPhone = searchTerm.replace(/\D+/g, '');

  return dashboardState.entries.filter(entry => {
    /*
    |--------------------------------------------------------------------------
    | Filtre par statut
    |--------------------------------------------------------------------------
    */
    const matchesStatus =
      dashboardState.statusFilter === 'all'
      || entry.status === dashboardState.statusFilter;

    if (!matchesStatus) {
      return false;
    }

    /*
    |--------------------------------------------------------------------------
    | Sans recherche, le statut suffit
    |--------------------------------------------------------------------------
    */
    if (searchTerm === '') {
      return true;
    }

    const patientName =
      normalizeDashboardSearchValue(
        entry.display_name
      );

    const patientPhone = String(
      entry.phone ?? ''
    ).replace(/\D+/g, '');

    const matchesName =
      patientName.includes(searchTerm);

    const matchesPhone =
      searchedPhone !== ''
      && patientPhone.includes(searchedPhone);

    return matchesName || matchesPhone;
  });
}

/*
|--------------------------------------------------------------------------
| Calculer le nombre de pages
|--------------------------------------------------------------------------
*/
function getDashboardTotalPages(filteredEntries) {
  return Math.max(
    1,
    Math.ceil(
      filteredEntries.length / dashboardState.pageSize
    )
  );
}

/*
|--------------------------------------------------------------------------
| Récupérer les entrées de la page actuelle
|--------------------------------------------------------------------------
*/
function getCurrentDashboardPageEntries(filteredEntries) {
  const startIndex =
    (dashboardState.currentPage - 1)
    * dashboardState.pageSize;

  const endIndex =
    startIndex + dashboardState.pageSize;

  return filteredEntries.slice(
    startIndex,
    endIndex
  );
}

/*
|--------------------------------------------------------------------------
| Synchroniser les contrôles HTML avec l’état JavaScript
|--------------------------------------------------------------------------
*/
function syncDashboardControls() {
  const searchInput =
    document.getElementById('day-list-search');

  const filterSelect =
    document.getElementById('day-list-filter');

  if (
    searchInput
    && searchInput.value !== dashboardState.searchTerm
  ) {
    searchInput.value = dashboardState.searchTerm;
  }

  if (filterSelect) {
    filterSelect.value =
      dashboardState.statusFilter;
  }

  document
    .querySelectorAll('[data-page-size]')
    .forEach(button => {
      const pageSize =
        Number(button.dataset.pageSize);

      button.classList.toggle(
        'is-active',
        pageSize === dashboardState.pageSize
      );
    });
}

/*
|--------------------------------------------------------------------------
| Rendre une entrée visible dans la pagination
|--------------------------------------------------------------------------
| Si la recherche ou le filtre cache le patient actuel,
| on revient à la vue générale pour pouvoir le retrouver.
|--------------------------------------------------------------------------
*/
function ensureDashboardEntryIsVisible(entryId) {
  let filteredEntries =
    getFilteredDashboardEntries();

  const isPresent =
    filteredEntries.some(
      entry => String(entry.id) === String(entryId)
    );

  if (!isPresent) {
    dashboardState.searchTerm = '';
    dashboardState.statusFilter = 'all';

    filteredEntries =
      getFilteredDashboardEntries();
  }

  const entryIndex =
    filteredEntries.findIndex(
      entry => String(entry.id) === String(entryId)
    );

  if (entryIndex === -1) {
    return;
  }

  dashboardState.currentPage =
    Math.floor(
      entryIndex / dashboardState.pageSize
    ) + 1;
}

/*
|--------------------------------------------------------------------------
| Faire défiler uniquement la zone du tableau
|--------------------------------------------------------------------------
| On ne déplace pas toute la page.
|--------------------------------------------------------------------------
*/
function scrollDashboardEntryIntoView(
  entryId,
  useSmoothScroll = true
) {
  const container =
    document.querySelector('.waiting-list');

  const row = document.querySelector(
    `.patient-row[data-entry-id="${entryId}"]`
  );

  if (!container || !row) {
    return;
  }

  const containerRect =
    container.getBoundingClientRect();

  const rowRect =
    row.getBoundingClientRect();

  const targetScrollTop =
    container.scrollTop
    + rowRect.top
    - containerRect.top
    - (
      container.clientHeight
      - row.clientHeight
    ) / 2;

  container.scrollTo({
    top: Math.max(0, targetScrollTop),
    behavior: useSmoothScroll
      ? 'smooth'
      : 'auto'
  });
}

/*
|--------------------------------------------------------------------------
| Revenir au patient actuel
|--------------------------------------------------------------------------
*/
function focusCurrentPatient() {
  const currentEntry =
    getCurrentWaitingEntry();

  if (!currentEntry) {
    return;
  }

  ensureDashboardEntryIsVisible(
    currentEntry.id
  );

  dashboardState.selectedEntryId =
    currentEntry.id;

  dashboardState.scrollToEntryId =
    currentEntry.id;

  syncDashboardControls();
  renderDashboardView();
}

/*
|--------------------------------------------------------------------------
| Sélectionner un patient pour afficher ses détails
|--------------------------------------------------------------------------
| Cette action ne change pas le patient actuel FIFO.
|--------------------------------------------------------------------------
*/
function selectDashboardEntry(entryId) {
  dashboardState.selectedEntryId =
    Number(entryId);

  document
    .querySelectorAll('.patient-row')
    .forEach(row => {
      row.classList.toggle(
        'is-selected',
        String(row.dataset.entryId)
          === String(entryId)
      );
    });

  const selectedEntry = findEntryById(
    dashboardState.entries,
    entryId
  );

  updatePatientDetails(selectedEntry);
  renderCurrentPatientButton();
}

/*
|--------------------------------------------------------------------------
| Mettre à jour le nombre de résultats
|--------------------------------------------------------------------------
*/
function renderDashboardResultsCount(totalResults) {
  const resultElement =
    document.getElementById(
      'day-list-results-count'
    );

  if (!resultElement) {
    return;
  }

  resultElement.textContent =
    totalResults <= 1
      ? `${totalResults} patient`
      : `${totalResults} patients`;
}

/*
|--------------------------------------------------------------------------
| Construire une pagination compacte
|--------------------------------------------------------------------------
| Exemple :
| 1 2 3 4 5
|
| Pour un grand nombre de pages :
| 1 … 6 7 8 … 15
|--------------------------------------------------------------------------
*/
function buildPaginationItems(
  totalPages,
  currentPage
) {
  if (totalPages <= 7) {
    return Array.from(
      { length: totalPages },
      (_, index) => index + 1
    );
  }

  const pages = new Set([
    1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1
  ]);

  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }

  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }

  const validPages = [...pages]
    .filter(page => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);

  const items = [];

  validPages.forEach((page, index) => {
    const previousPage =
      validPages[index - 1];

    if (
      previousPage !== undefined
      && page - previousPage > 1
    ) {
      items.push('ellipsis');
    }

    items.push(page);
  });

  return items;
}

/*
|--------------------------------------------------------------------------
| Afficher la pagination
|--------------------------------------------------------------------------
*/
function renderDashboardPagination(totalPages) {
  const pagination =
    document.getElementById(
      'day-list-pagination'
    );

  if (!pagination) {
    return;
  }

  const pageItems = buildPaginationItems(
    totalPages,
    dashboardState.currentPage
  );

  const previousDisabled =
    dashboardState.currentPage === 1;

  const nextDisabled =
    dashboardState.currentPage === totalPages;

  const pageButtons = pageItems
    .map(item => {
      if (item === 'ellipsis') {
        return `
          <span
            class="pagination__ellipsis"
            aria-hidden="true"
          >
            …
          </span>
        `;
      }

      const isActive =
        item === dashboardState.currentPage;

      return `
        <button
          class="pagination__item ${isActive ? 'is-active' : ''}"
          type="button"
          data-page="${item}"
          ${isActive ? 'aria-current="page"' : ''}
        >
          ${item}
        </button>
      `;
    })
    .join('');

  pagination.innerHTML = `
    <button
      class="pagination__item pagination__item--navigation"
      type="button"
      data-page="${dashboardState.currentPage - 1}"
      ${previousDisabled ? 'disabled' : ''}
      aria-label="Page précédente"
    >
      ‹
    </button>

    ${pageButtons}

    <button
      class="pagination__item pagination__item--navigation"
      type="button"
      data-page="${dashboardState.currentPage + 1}"
      ${nextDisabled ? 'disabled' : ''}
      aria-label="Page suivante"
    >
      ›
    </button>
  `;
}

/*
|--------------------------------------------------------------------------
| Mettre à jour le bouton Patient actuel
|--------------------------------------------------------------------------
*/
function renderCurrentPatientButton() {
  const button =
    document.getElementById(
      'focus-current-patient-btn'
    );

  const label =
    document.getElementById(
      'focus-current-patient-label'
    );

  if (!button || !label) {
    return;
  }

  const currentEntry =
    getCurrentWaitingEntry();

  if (!currentEntry) {
    button.disabled = true;
    label.textContent =
      'Aucun patient en attente';

    return;
  }

  button.disabled = false;

  label.textContent =
    `Voir le patient actuel · N° ${currentEntry.number}`;
}
/*
|--------------------------------------------------------------------------
| Brancher les contrôles de la Liste du jour
|--------------------------------------------------------------------------
*/
function bindDashboardListControls() {
  const searchInput =
    document.getElementById(
      'day-list-search'
    );

  const filterSelect =
    document.getElementById(
      'day-list-filter'
    );

  const currentPatientButton =
    document.getElementById(
      'focus-current-patient-btn'
    );

  const pagination =
    document.getElementById(
      'day-list-pagination'
    );

  /*
  |--------------------------------------------------------------------------
  | Recherche avec une temporisation légère de 150 ms
  |--------------------------------------------------------------------------
  */
  searchInput?.addEventListener(
    'input',
    event => {
      clearTimeout(dashboardSearchTimer);

      dashboardSearchTimer = setTimeout(
        () => {
          dashboardState.searchTerm =
            event.target.value;

          dashboardState.currentPage = 1;
          dashboardState.scrollToEntryId = null;

          renderDashboardView();
        },
        150
      );
    }
  );

  /*
  |--------------------------------------------------------------------------
  | Filtre par statut
  |--------------------------------------------------------------------------
  */
  filterSelect?.addEventListener(
    'change',
    event => {
      dashboardState.statusFilter =
        event.target.value;

      dashboardState.currentPage = 1;
      dashboardState.scrollToEntryId = null;

      renderDashboardView();
    }
  );

  /*
  |--------------------------------------------------------------------------
  | Affichage 12, 24 ou 48
  |--------------------------------------------------------------------------
  */
  document
    .querySelectorAll('[data-page-size]')
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          const pageSize =
            Number(button.dataset.pageSize);

          if (![12, 24, 48].includes(pageSize)) {
            return;
          }

          dashboardState.pageSize = pageSize;
          dashboardState.currentPage = 1;
          dashboardState.scrollToEntryId = null;

          renderDashboardView();

          document
            .querySelector('.waiting-list')
            ?.scrollTo({
              top: 0,
              behavior: 'smooth'
            });
        }
      );
    });

  /*
  |--------------------------------------------------------------------------
  | Pagination avec délégation d’événement
  |--------------------------------------------------------------------------
  */
  pagination?.addEventListener(
    'click',
    event => {
      const pageButton =
        event.target.closest('[data-page]');

      if (
        !pageButton
        || pageButton.disabled
      ) {
        return;
      }

      const requestedPage =
        Number(pageButton.dataset.page);

      if (
        !Number.isInteger(requestedPage)
        || requestedPage < 1
      ) {
        return;
      }

      dashboardState.currentPage =
        requestedPage;

      dashboardState.scrollToEntryId = null;

      renderDashboardView();

      document
        .querySelector('.waiting-list')
        ?.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
    }
  );

  /*
  |--------------------------------------------------------------------------
  | Retour immédiat au patient actuel FIFO
  |--------------------------------------------------------------------------
  */
  currentPatientButton?.addEventListener(
    'click',
    focusCurrentPatient
  );
}
/*
|--------------------------------------------------------------------------
| Initialiser la page Liste du jour
|--------------------------------------------------------------------------
*/
function initDashboardPage() {
  resetDashboardViewState();

  bindAddPatientModalEvents();
  bindQueueActionModalEvents();
  bindToggleListButton();
  bindQueueDayControls();
  bindDashboardListControls();
  bindPatientDetailsEvents();

  /*
  |--------------------------------------------------------------------------
  | Au premier affichage, sélectionner automatiquement
  | le premier patient en attente.
  |--------------------------------------------------------------------------
  */
  loadDashboardData({
    focusCurrent: true
  }).then(() => {
    if (!markiOpenAddPatientAfterLoad) return;
    markiOpenAddPatientAfterLoad = false;
    openAddPatientFromFab();
  });
  startDashboardAutoRefresh();
}

let dashboardLastRenderSnapshot = null;

function invalidateDashboardSnapshot() {
  dashboardLastRenderSnapshot = null;
}

/*
|--------------------------------------------------------------------------
| Charger les données du dashboard
|--------------------------------------------------------------------------
| focusCurrent :
| demande à l’interface de revenir automatiquement au prochain patient
| en attente après Terminer ou Absent.
|--------------------------------------------------------------------------
*/
async function loadDashboardData({ focusCurrent = false, silent = false } = {}) {
  if (dashboardLoadInFlight) {
    return;
  }

  dashboardLoadInFlight = true;

  try {
    const response = await fetch(
      QUEUE_ENTRIES_API_URL
    );

    const result =
      await parseJsonResponseSafely(response);

    if (!response.ok || !result.ok) {
      throw new Error(
        result?.message
        || 'Impossible de charger le dashboard.'
      );
    }

    const currentSnapshot = JSON.stringify({
      queue: result.data.queue,
      entries: result.data.entries,
      counts: result.data.counts,
      selectedId: dashboardState.selectedEntryId,
      page: dashboardState.currentPage,
      search: dashboardState.searchQuery,
      filter: dashboardState.statusFilter,
      pageSize: dashboardState.pageSize
    });

    if (silent && dashboardLastRenderSnapshot === currentSnapshot) {
      return;
    }

    dashboardLastRenderSnapshot = currentSnapshot;
    dashboardState.queue =
      result.data.queue;

    /*
    |--------------------------------------------------------------------------
    | Sécuriser l’ordre FIFO côté front
    |--------------------------------------------------------------------------
    | Même si l’API trie déjà les données, le front conserve explicitement
    | l’ordre basé sur le numéro d’inscription.
    |--------------------------------------------------------------------------
    */
    dashboardState.entries = [
      ...(result.data.entries ?? [])
    ].sort(
      (left, right) =>
        Number(left.number)
        - Number(right.number)
    );

    notifyNewQrRegistrations(dashboardState.entries);

    const currentEntry =
      getCurrentWaitingEntry();

    const selectedEntryStillExists =
      dashboardState.entries.some(
        entry =>
          String(entry.id)
          === String(
            dashboardState.selectedEntryId
          )
      );

    /*
    |--------------------------------------------------------------------------
    | Premier chargement ou passage au patient suivant
    |--------------------------------------------------------------------------
    */
    if (
      focusCurrent
      || dashboardState.selectedEntryId === null
    ) {
      dashboardState.selectedEntryId =
        currentEntry?.id
        ?? dashboardState.entries[0]?.id
        ?? null;

      if (currentEntry) {
        ensureDashboardEntryIsVisible(
          currentEntry.id
        );

        dashboardState.scrollToEntryId =
          currentEntry.id;
      }
    } else if (!selectedEntryStillExists) {
      dashboardState.selectedEntryId =
        currentEntry?.id
        ?? dashboardState.entries[0]?.id
        ?? null;
    }

    updateQueueStatusBadge(
      dashboardState.queue
    );

    renderDashboardCounters(
      result.data.counts
    );

    syncDashboardControls();
    renderDashboardView();
  } catch (error) {
    console.error(
      'Erreur dashboard :',
      error
    );

    if (!silent) {
      const tableBody =
        document.getElementById(
          'day-list-table-body'
        );

      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="6" class="table-empty-state-cell">
              <div class="table-empty-illustration">
                <div class="table-empty-icon-wrap">
                  <span class="empty-sparkle empty-sparkle--top-right">✦</span>
                  <span class="empty-sparkle empty-sparkle--bottom-left">✦</span>
                  <div class="table-empty-circle">
                    <svg class="mk-icon" aria-hidden="true"><use href="#mk-document-user"></use></svg>
                  </div>
                </div>
                <strong>Impossible de charger les données.</strong>
              </div>
            </td>
          </tr>
        `;
      }
    }
  } finally {
    dashboardLoadInFlight = false;
  }
}
/*
|--------------------------------------------------------------------------
| Mettre à jour le bouton Nouveau patient
|--------------------------------------------------------------------------
*/
function updateAddPatientButtonState(queue) {
  const addPatientButton = document.getElementById('openAddPatientModalBtn');

  if (!addPatientButton) return;

  const canRegister =
    queue?.registration_status === 'open'
    && queue?.day_status === 'active';

  addPatientButton.disabled = !canRegister;
  document
    .getElementById('mobileFabAddPatient')
    ?.classList.toggle('is-unavailable', !canRegister);

  const buttonLabel = addPatientButton.querySelector('span');
  const buttonIconUse = addPatientButton.querySelector('use');

  if (buttonLabel) {
    if (queue?.day_status === 'completed') {
      buttonLabel.textContent = 'Journée clôturée';
      if (buttonIconUse) buttonIconUse.setAttribute('href', '#mk-check-circle');
    } else if (queue?.day_status === 'paused') {
      buttonLabel.textContent = 'Liste en pause';
      if (buttonIconUse) buttonIconUse.setAttribute('href', '#mk-pause');
    } else if (queue?.registration_status === 'closed') {
      buttonLabel.textContent = 'Inscriptions fermées';
      if (buttonIconUse) buttonIconUse.setAttribute('href', '#mk-lock');
    } else {
      buttonLabel.textContent = '+ Nouveau patient';
      if (buttonIconUse) buttonIconUse.setAttribute('href', '#mk-user-plus');
    }
  }

  addPatientButton.title = canRegister
    ? 'Ajouter un nouveau patient à la liste du jour'
    : 'Les nouvelles inscriptions sont actuellement indisponibles';
}

/*
|--------------------------------------------------------------------------
| Mettre à jour les deux états de la queue
|--------------------------------------------------------------------------
*/
function updateQueueStatusBadge(queue) {
  const dayBadge = document.getElementById('day-status-badge');
  const registrationBadge = document.getElementById(
    'registration-status-badge'
  );
  const toggleButton = document.getElementById('toggle-list-btn');
  const menuButton = document.getElementById('queue-day-menu-btn');
  const pauseButton = document.getElementById('pause-day-btn');
  const resumeButton = document.getElementById('resume-day-btn');
  const completeButton = document.getElementById('complete-day-btn');
  const reopenButton = document.getElementById(
    'reopen-completed-day-btn'
  );

  if (!queue) return;

  const dayStatus = queue.day_status;
  const registrationsOpen = queue.registration_status === 'open';
  const isCompleted = dayStatus === 'completed';
  const isPaused = dayStatus === 'paused';

  if (dayBadge) {
    dayBadge.classList.remove(
      'list-status-badge--open',
      'list-status-badge--paused',
      'list-status-badge--closed'
    );

    if (isCompleted) {
      dayBadge.textContent = 'Journée clôturée';
      dayBadge.classList.add('list-status-badge--closed');
    } else if (isPaused) {
      dayBadge.textContent = 'Liste en pause';
      dayBadge.classList.add('list-status-badge--paused');
    } else {
      dayBadge.textContent = 'Liste active';
      dayBadge.classList.add('list-status-badge--open');
    }
  }

  if (registrationBadge) {
    registrationBadge.innerHTML = `
      <svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#${registrationsOpen ? 'mk-shield-check' : 'mk-lock'}"></use></svg>
      <span>${registrationsOpen ? 'Inscriptions ouvertes' : 'Inscriptions fermées'}</span>
    `;

    registrationBadge.classList.toggle(
      'registration-status-badge--open',
      registrationsOpen
    );
    registrationBadge.classList.toggle(
      'registration-status-badge--closed',
      !registrationsOpen
    );
  }

  if (toggleButton) {
    toggleButton.innerHTML = `
      <svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#${registrationsOpen ? 'mk-lock' : 'mk-shield-check'}"></use></svg>
      <span>${registrationsOpen ? 'Fermer les inscriptions' : 'Rouvrir les inscriptions'}</span>
    `;

    toggleButton.disabled = isCompleted || isPaused;
    toggleButton.classList.toggle(
      'btn-toggle-list--close',
      registrationsOpen
    );
    toggleButton.classList.toggle(
      'btn-toggle-list--open',
      !registrationsOpen
    );
  }

  if (menuButton) {
    const menuWrapper = menuButton.closest(
      '.queue-day-menu-wrapper'
    );

    menuButton.disabled = false;

    if (menuWrapper) {
      menuWrapper.hidden = isCompleted;
    }

    if (isCompleted) {
      closeQueueDayMenu();
    }
  }

  if (reopenButton) {
    reopenButton.hidden = !isCompleted;
    reopenButton.disabled = false;
  }

  if (pauseButton) {
    pauseButton.hidden = isPaused || isCompleted;
  }

  if (resumeButton) {
    resumeButton.hidden = !isPaused || isCompleted;
  }

  if (completeButton) {
    completeButton.disabled = isCompleted;
  }

  updateAddPatientButtonState(queue);
}

/*
|--------------------------------------------------------------------------
| Construire le tableau visible
|--------------------------------------------------------------------------
| La liste conserve toujours son ordre FIFO.
|--------------------------------------------------------------------------
*/
function getPatientInitials(displayName) {
  const parts = String(displayName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'P';
  return parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0].substring(0, 2).toUpperCase();
}

function canOpenPatientRecords() {
  return Boolean(document.querySelector('.sidebar__item[data-page="patients"]'));
}

/*
| Détails dépliables d'une ligne (mobile) : seules les informations
| renseignées sont affichées.
*/
function renderPatientRowDetails(entry) {
  const items = [];

  if (entry.birth_date) {
    items.push(`
      <div class="patient-row-details__item">
        <dt>Date de naissance</dt>
        <dd>${escapeHtml(formatBirthDate(entry.birth_date))}</dd>
      </div>
    `);
  }

  if (entry.source) {
    items.push(`
      <div class="patient-row-details__item">
        <dt>Inscription</dt>
        <dd>${escapeHtml(formatSourceLabel(entry.source))}</dd>
      </div>
    `);
  }

  const note = (entry.patient_notes || '').trim();
  const visits = Array.isArray(entry.recent_visits) ? entry.recent_visits : [];
  const patientId = Number(entry.patient_id || 0);
  const canOpenRecord = canOpenPatientRecords() && patientId > 0;
  // Après un rafraîchissement, la fiche ouverte reste affichée.
  const cachedRecord = canOpenRecord
    && dashboardState.inlineRecordPatientId === patientId
    ? inlinePatientRecordCache.get(patientId)
    : null;

  return `
    <td class="patient-row-details${cachedRecord ? ' has-record' : ''}">
      ${items.length ? `<dl class="patient-row-details__grid">${items.join('')}</dl>` : ''}
      ${note ? `
        <div class="patient-row-details__note">
          <span>Note cabinet</span>
          <p>${escapeHtml(note)}</p>
        </div>
      ` : ''}
      ${visits.length ? `
        <div class="patient-row-details__visits">
          <span>Dernières visites</span>
          <ul class="visit-history">${renderPatientHistory(visits)}</ul>
        </div>
      ` : ''}
      ${cachedRecord ? renderInlinePatientRecord(cachedRecord, note, { animate: false }) : ''}
      ${canOpenRecord ? `
        <button
          type="button"
          class="patient-row-details__record"
          data-patient-id="${patientId}"
          aria-expanded="${cachedRecord ? 'true' : 'false'}"
        >
          <span>${cachedRecord ? 'Masquer la fiche complète' : 'Voir la fiche complète'}</span>
          <svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#mk-chevron-down"></use></svg>
        </button>
      ` : ''}
    </td>
  `;
}

/*
| Fiche complète affichée directement dans la carte du patient (mobile).
| Seules les informations renseignées apparaissent.
*/
function renderInlinePatientRecord(patient, rowNote = '', { animate = true } = {}) {
  const fields = [
    ['Téléphone', patient.phone
      ? (window.MarkiPhone ? window.MarkiPhone.formatMobile(patient.phone) : patient.phone)
      : ''],
    ['Date de naissance', patient.birth_date ? formatBirthDate(patient.birth_date) : ''],
    ['E-mail', patient.email],
    ['Adresse', patient.address],
    ['Patient depuis', patient.created_at ? formatVisitDate(patient.created_at) : '']
  ].filter(([, value]) => String(value || '').trim() !== '');

  const notes = String(patient.notes_non_medical || '').trim();
  const visits = (Array.isArray(patient.recent_visits) ? patient.recent_visits : [])
    .map(visit => ({
      status: visit.status,
      visit_at: visit.ended_at || visit.started_at || visit.created_at
    }));

  return `
    <section class="patient-row-record${animate ? '' : ' is-static'}" aria-label="Fiche complète">
      <div class="patient-row-record__inner">
        <p class="patient-row-record__title">
          <svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#mk-document-user"></use></svg>
          <span>Fiche complète</span>
        </p>

        ${fields.length ? `
          <dl class="patient-row-record__grid">
            ${fields.map(([label, value]) => `
              <div class="patient-row-record__field">
                <dt>${escapeHtml(label)}</dt>
                <dd>${escapeHtml(value)}</dd>
              </div>
            `).join('')}
          </dl>
        ` : ''}

        ${notes && notes !== rowNote ? `
          <div class="patient-row-details__note">
            <span>Note cabinet</span>
            <p>${escapeHtml(notes)}</p>
          </div>
        ` : ''}

        <div class="patient-row-details__visits patient-row-record__visits">
          <span>Historique des visites (${visits.length})</span>
          ${visits.length
            ? `<ul class="visit-history">${renderPatientHistory(visits)}</ul>`
            : '<p class="patient-row-record__empty">Aucune visite enregistrée.</p>'}
        </div>

        <button
          type="button"
          class="patient-row-record__open"
          data-patient-id="${Number(patient.id) || 0}"
        >
          <svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#mk-pencil"></use></svg>
          <span>Modifier la fiche</span>
        </button>
      </div>
    </section>
  `;
}

function renderInlinePatientRecordLoading() {
  return `
    <section class="patient-row-record is-loading" aria-label="Chargement de la fiche" aria-busy="true">
      <div class="patient-row-record__inner">
        <span class="mk-skeleton mk-skeleton--title"></span>
        <span class="mk-skeleton mk-skeleton--text"></span>
        <span class="mk-skeleton mk-skeleton--text"></span>
      </div>
    </section>
  `;
}

function setInlineRecordButtonState(button, isOpen) {
  if (!button) return;
  button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  const label = button.querySelector('span');
  if (label) {
    label.textContent = isOpen ? 'Masquer la fiche complète' : 'Voir la fiche complète';
  }
}

function closeInlinePatientRecord(detailsCell) {
  const section = detailsCell?.querySelector('.patient-row-record');
  dashboardState.inlineRecordPatientId = null;
  detailsCell?.classList.remove('has-record');
  setInlineRecordButtonState(detailsCell?.querySelector('.patient-row-details__record'), false);

  if (!section) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    section.remove();
    return;
  }

  section.classList.add('is-leaving');
  section.addEventListener('animationend', () => section.remove(), { once: true });
  // Filet de sécurité si l'animation ne se déclenche pas.
  window.setTimeout(() => section.remove(), 400);
}

async function toggleInlinePatientRecord(button) {
  const detailsCell = button.closest('.patient-row-details');
  const patientId = Number(button.dataset.patientId || 0);

  if (!detailsCell || patientId <= 0) return;

  if (detailsCell.querySelector('.patient-row-record')) {
    closeInlinePatientRecord(detailsCell);
    return;
  }

  dashboardState.inlineRecordPatientId = patientId;
  setInlineRecordButtonState(button, true);

  const rowNote = detailsCell.querySelector('.patient-row-details__note p')?.textContent?.trim() || '';
  const cached = inlinePatientRecordCache.get(patientId);

  if (cached) {
    button.insertAdjacentHTML('beforebegin', renderInlinePatientRecord(cached, rowNote));
    detailsCell.classList.add('has-record');
    return;
  }

  button.insertAdjacentHTML('beforebegin', renderInlinePatientRecordLoading());
  button.disabled = true;

  try {
    const response = await fetch(
      `api/patient_details.php?patient_id=${encodeURIComponent(patientId)}`,
      { cache: 'no-store' }
    );
    const result = await parseJsonResponseSafely(response);
    const patient = result?.data?.patient;

    if (!response.ok || !result?.ok || !patient) {
      throw new Error(result?.message || 'Fiche patient introuvable.');
    }

    inlinePatientRecordCache.set(patientId, patient);

    // La carte a pu être refermée, ou redessinée par le rafraîchissement.
    if (dashboardState.inlineRecordPatientId !== patientId) return;

    const liveButton = detailsCell.isConnected
      ? button
      : document.querySelector(
        `.patient-row.is-expanded .patient-row-details__record[data-patient-id="${patientId}"]`
      );
    const liveCell = liveButton?.closest('.patient-row-details');
    if (!liveCell) return;

    liveCell.querySelector('.patient-row-record')?.remove();
    liveButton.insertAdjacentHTML('beforebegin', renderInlinePatientRecord(patient, rowNote));
    liveCell.classList.add('has-record');
    setInlineRecordButtonState(liveButton, true);
  } catch (error) {
    console.error('Fiche complète :', error);
    detailsCell.querySelector('.patient-row-record.is-loading')?.remove();
    dashboardState.inlineRecordPatientId = null;
    setInlineRecordButtonState(button, false);
    showToast(error.message || 'Impossible de charger la fiche patient.', 'error');
  } finally {
    button.disabled = false;
  }
}

/*
| Bouton d'appel direct (mobile) : lien tel: vers le numéro du patient.
*/
function renderPatientCallCell(entry) {
  const dialable = String(entry.phone || '').replace(/[^\d+]/g, '');
  if (!dialable) return '<td class="patient-call-cell"></td>';

  return `
    <td class="patient-call-cell">
      <a
        class="patient-call"
        href="tel:${escapeHtml(dialable)}"
        aria-label="Appeler ${escapeHtml(entry.display_name ?? 'le patient')}"
      >
        <svg class="mk-icon" aria-hidden="true"><use href="#mk-phone"></use></svg>
      </a>
    </td>
  `;
}

function renderDashboardTable(entries) {
  const tableBody = document.getElementById('day-list-table-body');

  if (!tableBody) return;

  if (!entries || entries.length === 0) {
    const message = dashboardState.entries.length === 0
      ? 'Aucun patient pour aujourd’hui.'
      : 'Aucun patient ne correspond à la recherche.';

    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="table-empty-state-cell">
          <div class="table-empty-illustration">
            <div class="table-empty-icon-wrap">
              <span class="empty-sparkle empty-sparkle--top-right">✦</span>
              <span class="empty-sparkle empty-sparkle--bottom-left">✦</span>
              <div class="table-empty-circle">
                <svg class="mk-icon" aria-hidden="true"><use href="#mk-document-user"></use></svg>
              </div>
            </div>
            <strong>${escapeHtml(message)}</strong>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const currentEntry = getCurrentWaitingEntry();
  const currentEntryId = currentEntry?.id ?? null;
  const dayStatus = dashboardState.queue?.day_status;
  const canProcessPatients = dayStatus === 'active';
  const canEdit = dayStatus !== 'completed';

  const allRejoined = (dashboardState.entries || []).filter(e => Boolean(e.last_rejoined_at));
  const isFullList = dashboardState.statusFilter === 'all' && !dashboardState.searchTerm;
  const rowsHtml = [];
  let prevNumber = 0;
  const usedRejoinedIds = new Set();

  entries.forEach((entry, index) => {
    const currentNum = Number(entry.number);

    if (isFullList && !isNaN(currentNum)) {
      const startGap = index === 0 ? 1 : prevNumber + 1;
      if (currentNum > startGap) {
        for (let missing = startGap; missing < currentNum; missing++) {
          const matchRejoined = allRejoined.find(r => !usedRejoinedIds.has(r.id) && Number(r.number) > missing);
          let explanationText = 'Ce patient a été marqué comme absent puis réintégré tout en bas de la liste.';
          if (matchRejoined) {
            usedRejoinedIds.add(matchRejoined.id);
            explanationText = `Ce patient a été marqué comme absent puis réintégré tout en bas de la liste (actuellement <strong>N° ${matchRejoined.number}</strong> — ${escapeHtml(matchRejoined.display_name)}).`;
          }

          rowsHtml.push(`
            <tr class="patient-row patient-row--rejoined-info" aria-label="Information de réintégration">
              <td class="patient-num-cell">
                <span class="rejoined-info-num">${missing}</span>
              </td>
              <td colspan="5" class="rejoined-info-cell">
                <div class="rejoined-info-content">
                  <span class="rejoined-info-icon" aria-hidden="true">
                    <svg class="mk-icon mk-icon--xs"><use href="#mk-undo"></use></svg>
                  </span>
                  <span class="rejoined-info-text">${explanationText}</span>
                </div>
              </td>
            </tr>
          `);
        }
      }
      prevNumber = currentNum;
    }

    const isCurrent = String(entry.id) === String(currentEntryId);
    const isSelected = String(entry.id) === String(
      dashboardState.selectedEntryId
    );
    const isWaiting = ['waiting', 'called'].includes(entry.status);
    const canChangeWaitingStatus = canProcessPatients && isWaiting;
    const canReturnToWaiting =
      canProcessPatients && entry.status === 'no_show';

    const isExpanded = String(entry.id) === String(
      dashboardState.expandedEntryId
    );

    const rowClasses = [
      'patient-row',
      isCurrent ? 'is-current' : '',
      isSelected ? 'is-selected' : '',
      isExpanded ? 'is-expanded' : ''
    ].filter(Boolean).join(' ');

    let statusActions = '';

    if (isWaiting) {
      statusActions = `
        <button
          class="btn-action-icon btn-action-icon--done mk-tooltip"
          type="button"
          data-tooltip="Marquer comme terminé"
          aria-label="Terminer"
          ${canChangeWaitingStatus ? '' : 'disabled'}
        >
          <svg class="mk-icon" aria-hidden="true"><use href="#mk-check"></use></svg>
        </button>

        <button
          class="btn-action-icon btn-action-icon--absent mk-tooltip"
          type="button"
          data-tooltip="Marquer comme absent"
          aria-label="Absent"
          ${canChangeWaitingStatus ? '' : 'disabled'}
        >
          <svg class="mk-icon" aria-hidden="true"><use href="#mk-user-x"></use></svg>
        </button>

        <button
          class="btn-action-icon btn-action-icon--cancel mk-tooltip"
          type="button"
          data-tooltip="Annuler l’inscription"
          aria-label="Annuler"
          ${canChangeWaitingStatus ? '' : 'disabled'}
        >
          <svg class="mk-icon" aria-hidden="true"><use href="#mk-slash-circle"></use></svg>
        </button>
      `;
    } else if (entry.status === 'no_show') {
      statusActions = `
        <button
          class="btn-action-icon btn-action-icon--return mk-tooltip"
          type="button"
          data-tooltip="Remettre en attente"
          aria-label="Remettre en attente"
          ${canReturnToWaiting ? '' : 'disabled'}
        >
          <svg class="mk-icon" aria-hidden="true"><use href="#mk-undo"></use></svg>
        </button>
      `;
    }

    rowsHtml.push(`
      <tr class="${rowClasses}" data-entry-id="${entry.id}" aria-expanded="${isExpanded ? 'true' : 'false'}">
        <td class="patient-num-cell">${entry.number}</td>
        <td class="patient-name-cell">
          <div class="patient-name-text">${escapeHtml(entry.display_name ?? '')}</div>
          ${entry.patient_notes ? `<div class="patient-desc-subtext">${escapeHtml(entry.patient_notes)}</div>` : ''}
        </td>
        <td class="patient-phone-cell">
          ${escapeHtml(window.MarkiPhone ? window.MarkiPhone.formatMobile(entry.phone ?? '') : (entry.phone ?? '-'))}
        </td>
        <td class="patient-time-cell">${escapeHtml(entry.time ?? '-')}</td>
        <td>${renderStatusPill(entry.status, isCurrent)}</td>
        <td>
          <div class="table-actions">
            <button
              class="btn-action-icon btn-action-icon--edit mk-tooltip"
              type="button"
              data-tooltip="Modifier les informations"
              aria-label="Modifier"
              ${canEdit ? '' : 'disabled'}
            >
              <svg class="mk-icon" aria-hidden="true"><use href="#mk-pencil"></use></svg>
            </button>

            ${statusActions}
          </div>
        </td>
        ${renderPatientRowDetails(entry)}
        ${renderPatientCallCell(entry)}
      </tr>
    `);
  });

  tableBody.innerHTML = rowsHtml.join('');

  bindPatientRowEvents(entries);
}
/*
|--------------------------------------------------------------------------
| Rendu central du dashboard
|--------------------------------------------------------------------------
| Ordre :
| 1. recherche et filtre
| 2. pagination
| 3. tableau
| 4. détails
| 5. bouton patient actuel
|--------------------------------------------------------------------------
*/
function renderDashboardView() {
  const filteredEntries =
    getFilteredDashboardEntries();

  const totalPages =
    getDashboardTotalPages(filteredEntries);

  /*
  |--------------------------------------------------------------------------
  | Empêcher une page inexistante après un filtre
  |--------------------------------------------------------------------------
  */
  dashboardState.currentPage = Math.min(
    Math.max(1, dashboardState.currentPage),
    totalPages
  );

  const pageEntries =
    getCurrentDashboardPageEntries(
      filteredEntries
    );

  /*
  |--------------------------------------------------------------------------
  | Si le patient sélectionné n’est pas présent sur cette page,
  | sélectionner automatiquement la première ligne visible.
  |--------------------------------------------------------------------------
  */
  const selectedEntryIsVisible =
    pageEntries.some(
      entry =>
        String(entry.id)
        === String(
          dashboardState.selectedEntryId
        )
    );

  if (!selectedEntryIsVisible) {
    dashboardState.selectedEntryId =
      pageEntries[0]?.id ?? null;
  }

  renderDashboardTable(pageEntries);

  renderDashboardPagination(totalPages);

  renderDashboardResultsCount(
    filteredEntries.length
  );

  renderCurrentPatientButton();

  syncDashboardControls();

  const selectedEntry = findEntryById(
    dashboardState.entries,
    dashboardState.selectedEntryId
  );

  updatePatientDetails(selectedEntry);

  /*
  |--------------------------------------------------------------------------
  | Après Terminer, Absent ou clic sur Patient actuel,
  | rendre automatiquement la bonne ligne visible.
  |--------------------------------------------------------------------------
  */
  const entryIdToScroll =
    dashboardState.scrollToEntryId;

  dashboardState.scrollToEntryId = null;

  if (entryIdToScroll !== null) {
    requestAnimationFrame(() => {
      scrollDashboardEntryIntoView(
        entryIdToScroll
      );
    });
  }
}
/*
|--------------------------------------------------------------------------
| Construire le badge de statut
|--------------------------------------------------------------------------
| Mapping DB -> UI :
| waiting = En attente
| no_show = Absent
| done = Terminé
|--------------------------------------------------------------------------
*/
function renderStatusPill(status, isCurrent = false) {
    if (isCurrent || status === 'in_progress' || status === 'called') {
        return '<span class="status-pill status-pill--in_progress">En cours</span>';
    }

    if (status === 'waiting') {
        return '<span class="status-pill status-pill--waiting">En attente</span>';
    }

    if (status === 'no_show') {
        return '<span class="status-pill status-pill--absent">Absent</span>';
    }

    if (status === 'done') {
        return '<span class="status-pill status-pill--done">Terminé</span>';
    }

    if (status === 'canceled') {
        return '<span class="status-pill status-pill--canceled">Annulé</span>';
    }

    return `<span class="status-pill">${escapeHtml(status)}</span>`;
}
const MARKI_MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
];

function formatBirthDate(value) {
    if (!value) return '-';

    const parts = String(value).split('-');
    if (parts.length !== 3) return escapeHtml(String(value));

    const [year, month, day] = parts;
    const monthIndex = parseInt(month, 10) - 1;
    const monthName = MARKI_MONTHS_FR[monthIndex] || month;
    return `${parseInt(day, 10)} ${monthName} ${year}`;
}

function formatSourceLabel(source) {
    if (source === 'secretary') return 'Secrétaire';
    if (source === 'doctor') return 'Médecin';
    if (source === 'qr') return 'QR code';
    if (source === 'link') return 'Lien public';
    if (!source) return '-';
    return escapeHtml(String(source));
}

function renderDetailStatusPill(status, isCurrent = false) {
    return renderStatusPill(status, isCurrent);
}

function renderDefaultPatientHistory() {
  return `
    <li>
      <span>Aucune visite récente</span>
      <strong class="history-status">-</strong>
    </li>
  `;
}

function formatVisitDate(value) {
  if (!value) return '-';

  const date = new Date(String(value).replace(' ', 'T'));

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(String(value));
  }

  return new Intl.DateTimeFormat('fr-DZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function formatRelativeVisitDate(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';

  const timezone = document.querySelector('meta[name="marki-timezone"]')?.content
    || 'Africa/Algiers';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const part = type => Number(parts.find(item => item.type === type)?.value || 0);
  const todayUtc = Date.UTC(part('year'), part('month') - 1, part('day'));
  const visitUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const days = Math.max(0, Math.round((todayUtc - visitUtc) / 86400000));

  if (days === 0) return 'Aujourd’hui';
  if (days === 1) return 'Hier';
  if (days < 31) return `Il y a ${days} jours`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Il y a ${months} mois`;
  const years = Math.floor(days / 365);
  return `Il y a ${years} an${years > 1 ? 's' : ''}`;
}

function getVisitStatusLabel(status) {
  if (status === 'done') return 'Terminée';
  if (status === 'in_progress') return 'En cours';
  if (status === 'canceled') return 'Annulée';
  return status || '-';
}

function renderPatientHistory(visits) {
  if (!Array.isArray(visits) || visits.length === 0) {
    return renderDefaultPatientHistory();
  }

  return visits.map(visit => `
    <li>
      <span class="visit-date-stack">
        <span>${formatVisitDate(visit.visit_at)}</span>
        <small>${formatRelativeVisitDate(visit.visit_at)}</small>
      </span>
      <strong class="history-status history-status--${escapeHtml(visit.status)}">
        ${escapeHtml(getVisitStatusLabel(visit.status))}
      </strong>
    </li>
  `).join('');
}

function openSelectedPatientFullRecord() {
  const button = document.getElementById('view-full-patient-record-btn');
  openPatientFullRecord(Number(button?.dataset.patientId || 0));
}

function openPatientFullRecord(patientId) {
  if (patientId <= 0) {
    showToast('Aucune fiche patient liée à cette inscription.','error');
    return;
  }

  if (typeof window.openPatientProfile === 'function') {
    window.openPatientProfile(patientId);
    return;
  }

  sessionStorage.setItem('marki.openPatientId',String(patientId));

  setActiveMenuItem('patients');
  loadPage('patients');
}

function bindPatientDetailsEvents() {
  document
    .getElementById('view-full-patient-record-btn')
    ?.addEventListener('click', openSelectedPatientFullRecord);
}

function updatePatientDetails(entry) {
  const emptyState = document.getElementById('patient-details-empty');
  const detailsContent = document.getElementById('patient-details-content');
  const nameEl = document.getElementById('patient-details-name');
  const phoneEl = document.getElementById('patient-details-phone');
  const birthDateEl = document.getElementById('patient-details-birth-date');
  const sourceEl = document.getElementById('patient-details-source');
  const statusEl = document.getElementById('patient-details-status');
  const notesEl = document.getElementById('patient-details-notes');
  const historyEl = document.getElementById('patient-details-history');
  const fullRecordButton = document.getElementById(
    'view-full-patient-record-btn'
  );

  if (
    !emptyState
    || !detailsContent
    || !nameEl
    || !phoneEl
    || !birthDateEl
    || !sourceEl
    || !statusEl
    || !notesEl
    || !historyEl
    || !fullRecordButton
  ) {
    return;
  }

  if (!entry) {
    emptyState.hidden = false;
    detailsContent.hidden = true;
    fullRecordButton.hidden = !document.querySelector('.sidebar__item[data-page="patients"]');
    fullRecordButton.disabled = true;
    delete fullRecordButton.dataset.patientId;
    return;
  }

  emptyState.hidden = true;
  detailsContent.hidden = false;

  const avatarEl = document.getElementById('patient-details-avatar');
  if (avatarEl) {
    avatarEl.innerHTML = `<span>${escapeHtml(getPatientInitials(entry.display_name))}</span>`;
  }

  const currentWaiting = getCurrentWaitingEntry();
  const isCurrentPatient = currentWaiting && String(entry.id) === String(currentWaiting.id);

  nameEl.textContent = entry.display_name || '-';
  phoneEl.textContent = window.MarkiPhone ? window.MarkiPhone.formatMobile(entry.phone || '') : (entry.phone || '-');
  birthDateEl.textContent = formatBirthDate(entry.birth_date);
  const birthDateRow = birthDateEl.closest('.patient-detail-row');
  if (birthDateRow) birthDateRow.hidden = !entry.birth_date;
  sourceEl.textContent = formatSourceLabel(entry.source);
  statusEl.innerHTML = renderDetailStatusPill(entry.status, isCurrentPatient);

  const notesCard = document.getElementById('patient-details-notes-card') || notesEl.closest('.patient-detail-card--notes');
  const patientNote = (entry.patient_notes || '').trim();
  if (patientNote) {
    notesEl.textContent = patientNote;
    if (notesCard) notesCard.hidden = false;
  } else {
    notesEl.textContent = '';
    if (notesCard) notesCard.hidden = true;
  }

  historyEl.innerHTML = renderPatientHistory(
    entry.recent_visits
  );
  const historyCard = historyEl.closest('.patient-detail-card--history');
  if (historyCard) {
    historyCard.hidden = !(
      Array.isArray(entry.recent_visits) && entry.recent_visits.length > 0
    );
  }

  const patientId = Number(entry.patient_id || 0);
  const canViewPatients = canOpenPatientRecords();

  fullRecordButton.hidden = !canViewPatients;
  fullRecordButton.disabled = !canViewPatients || patientId <= 0;

  if (canViewPatients && patientId > 0) {
    fullRecordButton.dataset.patientId = String(patientId);
  } else {
    delete fullRecordButton.dataset.patientId;
  }
}

function selectPatientRowByEntryId(entryId) {
    const rows = document.querySelectorAll('.patient-row');

    rows.forEach(row => {
        const isSelected = String(row.dataset.entryId) === String(entryId);
        row.classList.toggle('is-selected', isSelected);
    });
}
function findEntryById(entries, entryId) {
    return entries.find(entry => String(entry.id) === String(entryId)) || null;
}
/*
|--------------------------------------------------------------------------
| Exécuter une action de statut
|--------------------------------------------------------------------------
| Le bouton est désactivé pendant la requête afin d’éviter les doubles clics.
|--------------------------------------------------------------------------
*/
async function handleQueueEntryStatusAction(
  button,
  entry,
  newStatus,
  extraPayload = {}
) {
  if (!button || button.disabled) return;

  button.disabled = true;

  try {
    const result = await updateQueueEntryStatus(
      entry.id,
      newStatus,
      extraPayload
    );

    showToast(result.message, 'success');

    await loadDashboardData({
      focusCurrent: ['done', 'no_show', 'canceled'].includes(newStatus)
    });
  } catch (error) {
    console.error('Erreur de changement de statut :', error);
    showToast(
      error.message || 'Impossible de modifier le statut.',
      'error'
    );
    button.disabled = false;
  }
}

/*
|--------------------------------------------------------------------------
| Brancher les événements des lignes
|--------------------------------------------------------------------------
*/
function togglePatientRowExpansion(row, entryId) {
  const willExpand = !row.classList.contains('is-expanded');

  document.querySelectorAll('.patient-row.is-expanded').forEach(openRow => {
    openRow.classList.remove('is-expanded');
    openRow.setAttribute('aria-expanded', 'false');

    // Une carte refermée referme aussi sa fiche complète.
    const detailsCell = openRow.querySelector('.patient-row-record')?.closest('.patient-row-details');
    if (detailsCell) {
      detailsCell.querySelector('.patient-row-record')?.remove();
      detailsCell.classList.remove('has-record');
      setInlineRecordButtonState(detailsCell.querySelector('.patient-row-details__record'), false);
      dashboardState.inlineRecordPatientId = null;
    }
  });

  row.classList.toggle('is-expanded', willExpand);
  row.setAttribute('aria-expanded', willExpand ? 'true' : 'false');
  dashboardState.expandedEntryId = willExpand ? Number(entryId) : null;
}

function bindPatientRowEvents(entries) {
  const rows = document.querySelectorAll('.patient-row');

  rows.forEach(row => {
    const entry = findEntryById(entries, row.dataset.entryId);

    if (!entry) return;

    row.addEventListener('click', event => {
      // L'appel ou une action ne déplient pas la ligne.
      if (event.target.closest('.btn-action-icon, .patient-call')) return;

      const recordButton = event.target.closest('.patient-row-details__record');
      if (recordButton) {
        // Sur téléphone, la fiche s'ouvre dans la carte au lieu de changer de page.
        if (window.matchMedia('(max-width: 768px)').matches) {
          toggleInlinePatientRecord(recordButton);
        } else {
          openPatientFullRecord(Number(recordButton.dataset.patientId || 0));
        }
        return;
      }

      const openRecordButton = event.target.closest('.patient-row-record__open');
      if (openRecordButton) {
        openPatientFullRecord(Number(openRecordButton.dataset.patientId || 0));
        return;
      }

      // Un clic dans le bloc déplié ne le referme pas.
      if (event.target.closest('.patient-row-details')) return;

      togglePatientRowExpansion(row, entry.id);
      selectDashboardEntry(entry.id);
    });

    const editButton = row.querySelector('.btn-action-icon--edit');
    editButton?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      if (!editButton.disabled) {
        openEditPatientModal(entry);
      }
    });

    // Une confirmation évite les appuis accidentels (surtout sur téléphone).
    const absentButton = row.querySelector('.btn-action-icon--absent');
    absentButton?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (absentButton.disabled) return;

      openQueueActionConfirmation({
        title: 'Marquer ce patient absent ?',
        message: `${entry.display_name} ne s’est pas présenté. Il sortira de la file d’attente. S’il arrive plus tard, vous pourrez le remettre en attente.`,
        confirmLabel: 'Marquer absent',
        onConfirm: async () => {
          await handleQueueEntryStatusAction(absentButton, entry, 'no_show');
        }
      });
    });

    const doneButton = row.querySelector('.btn-action-icon--done');
    doneButton?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (doneButton.disabled) return;

      openQueueActionConfirmation({
        title: 'Consultation terminée ?',
        message: `${entry.display_name} sera marqué comme terminé. Attention : cette action ne peut pas être annulée.`,
        confirmLabel: 'Oui, terminer',
        confirmType: 'primary',
        onConfirm: async () => {
          await handleQueueEntryStatusAction(doneButton, entry, 'done');
        }
      });
    });

    const cancelButton = row.querySelector('.btn-action-icon--cancel');
    cancelButton?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      openQueueActionConfirmation({
        title: 'Annuler cette inscription ?',
        message: `${entry.display_name} ne passera pas chez le médecin. Choisissez la raison à conserver dans l’historique.`,
        confirmLabel: 'Annuler l’inscription',
        defaultReason: 'patient_request',
        reasonOptions: [
          {
            value: 'patient_request',
            label: 'Annulation demandée par le patient'
          },
          {
            value: 'registration_error',
            label: 'Erreur d’inscription'
          },
          {
            value: 'doctor_unavailable',
            label: 'Médecin indisponible'
          },
          {
            value: 'other',
            label: 'Autre raison'
          }
        ],
        onConfirm: async ({ reason }) => {
          await handleQueueEntryStatusAction(
            cancelButton,
            entry,
            'canceled',
            {
              cancellation_reason: reason || 'other'
            }
          );
        }
      });
    });

    const returnButton = row.querySelector('.btn-action-icon--return');
    returnButton?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      openQueueActionConfirmation({
        title: 'Remettre le patient en attente ?',
        message: `${entry.display_name} sera replacé à la fin de la file afin de respecter les patients qui ont continué à attendre.`,
        confirmLabel: 'Remettre en attente',
        confirmType: 'primary',
        onConfirm: async () => {
          await handleQueueEntryStatusAction(
            returnButton,
            entry,
            'waiting'
          );
        }
      });
    });
  });
}
/*
|--------------------------------------------------------------------------
| Mettre à jour les compteurs
|--------------------------------------------------------------------------
*/
function renderDashboardCounters(counts) {
    const waitingEl = document.getElementById('counter-waiting');
    const absentEl = document.getElementById('counter-absent');
    const doneEl = document.getElementById('counter-done');
    const canceledEl = document.getElementById('counter-canceled');

    if (waitingEl) waitingEl.textContent = counts.waiting ?? 0;
    if (absentEl) absentEl.textContent = counts.absent ?? 0;
    if (doneEl) doneEl.textContent = counts.done ?? 0;
    if (canceledEl) canceledEl.textContent = counts.canceled ?? 0;
}

// ==========================================================
// SETTINGS
// ==========================================================

function addSaveButtonListener() {
    const saveButton = document.getElementById('save-button');

    if (saveButton) {
        saveButton.addEventListener('click', function () {
            const nom = document.getElementById('nom-prenom')?.value;
            const specialite = document.getElementById('specialite')?.value;
            const telephone = document.getElementById('telephone')?.value;
            const email = document.getElementById('email')?.value;
            const adresse = document.getElementById('adresse')?.value;

            console.log('Nom et Prénom:', nom);
            console.log('Spécialité:', specialite);
            console.log('Téléphone:', telephone);
            console.log('Email:', email);
            console.log('Adresse du cabinet:', adresse);

            this.classList.toggle('clicked');

            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300);
        });
    }
}

// ==========================================================
// HELPERS
// ==========================================================

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
}

// ==========================================================
// EVENTS MENU
// ==========================================================

document.querySelectorAll('.sidebar__item, .mobile-bottom-nav__item').forEach(item => {
    item.addEventListener('click', function () {
        const page = this.getAttribute('data-page');
        if (page) {
            setActiveMenuItem(page);
            loadPage(page);
        }
    });
});

/*
| Bouton « + » de la barre mobile : la fenêtre d'ajout vit dans la page
| Liste du jour. Depuis une autre page, on y retourne puis on l'ouvre.
*/
let markiOpenAddPatientAfterLoad = false;

function openAddPatientFromFab() {
  const openBtn = document.getElementById('openAddPatientModalBtn');

  if (openBtn?.disabled) {
    const reason = openBtn.querySelector('span')?.textContent?.trim();
    showToast(
      reason ? `${reason} : ajout impossible pour le moment.` : 'Ajout impossible pour le moment.',
      'error'
    );
    return;
  }

  openAddPatientModal();
}

document.getElementById('mobileFabAddPatient')?.addEventListener('click', function (event) {
    event.preventDefault();

    if (document.getElementById('addPatientModal')) {
      openAddPatientFromFab();
      return;
    }

    markiOpenAddPatientAfterLoad = true;
    setActiveMenuItem('dashboard');
    loadPage('dashboard');
});

// ==========================================================
// PAGE PAR DÉFAUT AU REFRESH
// ==========================================================

/*
|--------------------------------------------------------------------------
| Initialisation globale de l’application
|--------------------------------------------------------------------------
| Le listener clavier est installé une seule fois.
| Les pages internes peuvent ensuite être rechargées sans duplication.
|--------------------------------------------------------------------------
*/
document.addEventListener('DOMContentLoaded', function () {
  document.addEventListener(
    'keydown',
    handlePatientModalKeydown
  );

  setActiveMenuItem('dashboard');
  loadPage('dashboard');
});

/*
|--------------------------------------------------------------------------
| Configurer la modal en création ou en modification
|--------------------------------------------------------------------------
*/
function setPatientModalMode(mode = 'create', entry = null) {
  const {
    titleEl,
    submitBtn,
    formModeInput,
    entryIdInput,
    fullNameInput,
    phoneInput,
    birthDateInput
  } = getAddPatientModalElements();

  if (formModeInput) {
    formModeInput.value = mode;
  }

  if (entryIdInput) {
    entryIdInput.value = entry?.id ?? '';
  }

  if (mode === 'edit') {
    if (titleEl) {
      titleEl.textContent = 'Modifier le patient';
    }

    if (submitBtn) {
      submitBtn.textContent = getPatientDefaultSubmitLabel('edit');
    }

    if (fullNameInput) {
      fullNameInput.value = entry?.display_name ?? '';
    }

    if (phoneInput) {
      phoneInput.value = window.MarkiPhone ? window.MarkiPhone.formatMobile(entry?.phone ?? '') : (entry?.phone ?? '');
      window.MarkiPhone?.bind(modal);
    }

    if (birthDateInput) {
      birthDateInput.value = formatBirthDate(entry?.birth_date).replace('-', '');
    }

    return;
  }

  if (titleEl) {
    titleEl.textContent = 'Nouveau patient';
  }

  if (submitBtn) {
    submitBtn.textContent = getPatientDefaultSubmitLabel('create');
  }

  if (entryIdInput) {
    entryIdInput.value = '';
  }
}
/*
|--------------------------------------------------------------------------
| Envoyer la requête d'ajout patient
|--------------------------------------------------------------------------
| Cette fonction centralise l'appel API pour pouvoir la réutiliser
| en mode normal ou en mode "confirmation téléphone partagé".
|--------------------------------------------------------------------------
*/
async function submitPatientModalPayload(mode, payload) {
  const endpoint = mode === 'edit'
    ? UPDATE_PATIENT_API_URL
    : ADD_PATIENT_API_URL;

  const headers = {
    'Content-Type': 'application/json'
  };
  const csrf = getCsrfToken();
  if (csrf) {
    headers['X-CSRF-Token'] = csrf;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const data = await parseJsonResponseSafely(response);

  return { response, data };
}
/*
|--------------------------------------------------------------------------
| Ouvrir la modal en mode modification
|--------------------------------------------------------------------------
*/
function openEditPatientModal(entry) {
  const {
    modal,
    fullNameInput,
    messageBox,
    form
  } = getAddPatientModalElements();

  if (!modal || !entry) {
    return;
  }

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');

  if (messageBox) {
    messageBox.textContent = '';
    messageBox.className = 'marki-form__message';
  }

  if (form) {
    form.dataset.submitting = 'false';
  }

  resetSharedPhoneConfirmation();
  setPatientModalMode('edit', entry);

  if (fullNameInput) {
    setTimeout(() => fullNameInput.focus(), 0);
  }
}
