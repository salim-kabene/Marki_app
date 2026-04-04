const ADD_PATIENT_API_URL = '/Marki_app/Partie_medecin/public/api/queue_add_patient.php';
const UPDATE_QUEUE_STATUS_API_URL = '/Marki_app/Partie_medecin/public/api/queue_update_status.php';
/*
|--------------------------------------------------------------------------
| URL API : basculer le statut de la liste du jour
|--------------------------------------------------------------------------
| Cette API permet de fermer / réouvrir la liste du jour.
|--------------------------------------------------------------------------
*/
const TOGGLE_QUEUE_STATUS_API_URL = '/Marki_app/Partie_medecin/public/api/queue_toggle_status.php';

function getAddPatientModalElements() {
  return {
    modal: document.getElementById('addPatientModal'),
    openBtn: document.getElementById('openAddPatientModalBtn'),
    closeBtn: document.getElementById('closeAddPatientModalBtn'),
    cancelBtn: document.getElementById('cancelAddPatientBtn'),
    form: document.getElementById('addPatientForm'),
    messageBox: document.getElementById('addPatientFormMessage'),
    submitBtn: document.getElementById('submitAddPatientBtn'),
    fullNameInput: document.getElementById('addPatientFullName'),
    phoneInput: document.getElementById('addPatientPhone'),
    birthDateInput: document.getElementById('addPatientBirthDate'),
    backdrop: document.querySelector('[data-close-add-patient-modal]')
  };
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
  }

  /*
  |--------------------------------------------------------------
  | Focus automatique sur le nom complet
  |--------------------------------------------------------------
  */
  if (fullNameInput) {
    setTimeout(() => fullNameInput.focus(), 0);
  }
}

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
  }

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Ajouter le patient';
  }
}

function setAddPatientFormMessage(message, type = 'error') {
  const { messageBox } = getAddPatientModalElements();
  if (!messageBox) return;

  messageBox.textContent = message;
  messageBox.className = `marki-form__message is-${type}`;
}
async function handleAddPatientSubmit(event) {
  event.preventDefault();

  const {
    form,
    submitBtn,
    fullNameInput,
    phoneInput,
    birthDateInput
  } = getAddPatientModalElements();

  if (!form || !submitBtn || !fullNameInput) return;

  const fullName = fullNameInput.value.trim();
  const phone = phoneInput ? phoneInput.value.trim() : '';
  const birthDate = birthDateInput ? birthDateInput.value.trim() : '';

  if (!fullName) {
    setAddPatientFormMessage('Le nom complet est obligatoire.', 'error');
    fullNameInput.focus();
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Ajout en cours...';
  setAddPatientFormMessage('', 'error');

  try {
    const response = await fetch(ADD_PATIENT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        full_name: fullName,
        phone: phone || null,
        birth_date: birthDate || null,
        source: 'secretary'
      })
    });

    const data = await response.json();

    if (!response.ok) {
      setAddPatientFormMessage(
        data?.message || 'Impossible d’ajouter le patient.',
        'error'
      );
      return;
    }

    setAddPatientFormMessage(
      data?.message || 'Patient ajouté avec succès.',
      'success'
    );

    if (typeof loadDashboardData === 'function') {
      await loadDashboardData();
    }

    setTimeout(() => {
      closeAddPatientModal();
    }, 500);

  } catch (error) {
    console.error(error);
    setAddPatientFormMessage(
      'Une erreur réseau est survenue. Réessaie.',
      'error'
    );
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Ajouter le patient';
  }
}
async function updateQueueEntryStatus(entryId, status) {
    const response = await fetch(UPDATE_QUEUE_STATUS_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            entry_id: entryId,
            status: status
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data?.message || 'Impossible de mettre à jour le statut.');
    }

    return data;
}

/*
|--------------------------------------------------------------------------
| Basculer le statut de la liste du jour
|--------------------------------------------------------------------------
| Cette fonction appelle l'API backend qui fait :
| - open   -> closed
| - closed -> open
|
| Pourquoi une fonction dédiée ?
| - code plus lisible
| - réutilisable
| - plus simple à maintenir
|--------------------------------------------------------------------------
*/
async function toggleTodayQueueStatus() {
    const response = await fetch(TOGGLE_QUEUE_STATUS_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },

        /*
        |--------------------------------------------------------------
        | Ici on n’a pas besoin d’envoyer de body pour la V1
        |--------------------------------------------------------------
        | Le backend sait déjà retrouver la queue du jour grâce au
        | contexte dev + à la date du jour.
        */
        body: JSON.stringify({})
    });

    const data = await response.json();

    /*
    |--------------------------------------------------------------
    | Si l'API répond en erreur, on remonte un vrai message utile
    |--------------------------------------------------------------
    */
    if (!response.ok) {
        throw new Error(data?.message || 'Impossible de modifier le statut de la liste.');
    }

    return data;
}
function bindAddPatientModalEvents() {
  const {
    openBtn,
    closeBtn,
    cancelBtn,
    backdrop,
    form,
    modal
  } = getAddPatientModalElements();

  if (openBtn) {
    openBtn.addEventListener('click', openAddPatientModal);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeAddPatientModal);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeAddPatientModal);
  }

  if (backdrop) {
    backdrop.addEventListener('click', closeAddPatientModal);
  }

  if (form) {
    form.addEventListener('submit', handleAddPatientSubmit);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal?.classList.contains('is-open')) {
      closeAddPatientModal();
    }
  });
}
/*
|--------------------------------------------------------------------------
| Binder le bouton Fermer / Réouvrir la liste
|--------------------------------------------------------------------------
| Ce binder :
| - récupère le bouton #toggle-list-btn
| - empêche les doubles clics pendant la requête
| - appelle l'API
| - recharge le dashboard après succès
|--------------------------------------------------------------------------
*/
function bindToggleListButton() {
    const toggleButton = document.getElementById('toggle-list-btn');

    /*
    |--------------------------------------------------------------
    | Sécurité : si le bouton n'existe pas, on ne fait rien
    |--------------------------------------------------------------
    */
    if (!toggleButton) {
        return;
    }

    /*
    |--------------------------------------------------------------
    | On attache le click handler
    |--------------------------------------------------------------
    */
    toggleButton.addEventListener('click', async function () {
        /*
        |----------------------------------------------------------
        | Empêcher le double clic pendant la requête
        |----------------------------------------------------------
        */
        toggleButton.disabled = true;

        /*
        |----------------------------------------------------------
        | Sauvegarder le texte actuel pour pouvoir le restaurer
        |----------------------------------------------------------
        */
        const previousLabel = toggleButton.textContent;
        toggleButton.textContent = 'Mise à jour...';

        try {
            /*
            |------------------------------------------------------
            | Appel backend : bascule du statut de la liste
            |------------------------------------------------------
            */
            const result = await toggleTodayQueueStatus();

            /*
            |------------------------------------------------------
            | Recharger complètement le dashboard
            |------------------------------------------------------
            | Pourquoi reload complet ?
            | - met à jour le badge
            | - met à jour le texte du bouton
            | - garde une source de vérité unique côté API
            */
            await loadDashboardData();

            /*
            |------------------------------------------------------
            | Option simple V1 : feedback utilisateur minimal
            |------------------------------------------------------
            */
            console.log(result?.message || 'Statut de la liste mis à jour.');

        } catch (error) {
            /*
            |------------------------------------------------------
            | Erreur : on log + on affiche une alerte simple V1
            |------------------------------------------------------
            */
            console.error('Erreur toggle liste :', error);
            alert(error.message || 'Impossible de modifier le statut de la liste.');
        } finally {
            /*
            |------------------------------------------------------
            | Réactiver le bouton
            |------------------------------------------------------
            | Le vrai texte sera ensuite recalculé par
            | updateQueueStatusBadge(queue) après loadDashboardData()
            */
            toggleButton.disabled = false;
            toggleButton.textContent = previousLabel;
        }
    });
}
// ==========================================================
// MENU / NAVIGATION
// ==========================================================

function setActiveMenuItem(page) {
    document.querySelectorAll('.sidebar__item').forEach(item => {
        item.classList.remove('active');

        if (item.getAttribute('data-page') === page) {
            item.classList.add('active');
        }
    });
}

// ==========================================================
// CHARGEMENT DES PAGES
// ==========================================================

function loadPage(page) {
    const mainContent = document.getElementById('main-content');

    fetch(`pages/${page}.html`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Erreur de chargement de la page');
            }
            return response.text();
        })
        .then(html => {
            mainContent.innerHTML = html;

            // Initialisation spécifique selon la page chargée
            initPage(page);
        })
        .catch(error => {
            console.error('Erreur:', error);
            mainContent.innerHTML = '<p>Erreur de chargement de la page.</p>';
        });
}

function initPage(page) {
    if (page === 'dashboard') {
        initDashboardPage();
    }

    if (page === 'settings') {
        addSaveButtonListener();
    }
}

// ==========================================================
// DASHBOARD / LISTE DU JOUR
// ==========================================================

/*
|--------------------------------------------------------------------------
| Initialisation spécifique à la page dashboard
|--------------------------------------------------------------------------
| Ordre choisi :
| 1. binder la modal nouveau patient
| 2. binder le bouton fermer / réouvrir la liste
| 3. charger les données de la page
|--------------------------------------------------------------------------
*/
function initDashboardPage() {
    bindAddPatientModalEvents();
    bindToggleListButton();
    loadDashboardData();
}

/*
|--------------------------------------------------------------------------
| Charger les données du dashboard depuis l'API
|--------------------------------------------------------------------------
| Cette fonction :
| - appelle queue_entries.php
| - récupère la queue, les entrées, les compteurs
| - met à jour l'interface
|--------------------------------------------------------------------------
*/
function loadDashboardData() {
    fetch('api/queue_entries.php')
        .then(response => {
            if (!response.ok) {
                throw new Error('Erreur HTTP lors du chargement du dashboard');
            }
            return response.json();
        })
        .then(result => {
            if (!result.ok) {
                throw new Error(result.message || 'Erreur API');
            }

            const queue = result.data.queue;
            const entries = result.data.entries;
            const counts = result.data.counts;

            updateQueueStatusBadge(queue);
            renderDashboardTable(entries);
            renderDashboardCounters(counts);
        })
        .catch(error => {
            console.error('Erreur dashboard:', error);

            const tableBody = document.getElementById('day-list-table-body');
            if (tableBody) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="table-empty-state">
                            Impossible de charger les données.
                        </td>
                    </tr>
                `;
            }
        });
}
/*
|--------------------------------------------------------------------------
| Mettre à jour l'état du bouton "Nouveau patient"
|--------------------------------------------------------------------------
| Cette fonction rend le bouton cohérent avec l'état de la liste :
| - si la liste est ouverte  -> bouton actif
| - si la liste est fermée   -> bouton désactivé
|--------------------------------------------------------------------------
|
| Pourquoi une fonction dédiée ?
| - logique plus lisible
| - réutilisable
| - évite de mélanger trop de responsabilités dans une seule fonction
|--------------------------------------------------------------------------
*/
function updateAddPatientButtonState(queue) {
    const addPatientButton = document.getElementById('openAddPatientModalBtn');

    /*
    |--------------------------------------------------------------
    | Si le bouton n'existe pas, on sort sans erreur
    |--------------------------------------------------------------
    */
    if (!addPatientButton) {
        return;
    }

    /*
    |--------------------------------------------------------------
    | Déterminer si la liste est ouverte
    |--------------------------------------------------------------
    */
    const isOpen = queue?.status === 'open';

    /*
    |--------------------------------------------------------------
    | Désactiver / réactiver le bouton
    |--------------------------------------------------------------
    */
    addPatientButton.disabled = !isOpen;

    /*
    |--------------------------------------------------------------
    | Adapter le texte visible
    |--------------------------------------------------------------
    | On garde l'icône si elle existe déjà dans le HTML.
    | Ici on ne remplace que le texte du <span>.
    */
    const buttonLabel = addPatientButton.querySelector('span');

    if (buttonLabel) {
        buttonLabel.textContent = isOpen
            ? 'Nouveau patient'
            : 'Liste fermée';
    }

    /*
    |--------------------------------------------------------------
    | Accessibilité / UX
    |--------------------------------------------------------------
    | Le title aide à comprendre pourquoi le bouton est désactivé.
    */
    addPatientButton.title = isOpen
        ? 'Ajouter un nouveau patient à la liste du jour'
        : 'Impossible d’ajouter un patient : la liste du jour est fermée';
}
/*
|--------------------------------------------------------------------------
| Mettre à jour le badge Liste ouverte / fermée
|--------------------------------------------------------------------------
| Cette fonction met à jour :
| - le badge d'état
| - le bouton Fermer / Réouvrir la liste
| - le bouton Nouveau patient
|--------------------------------------------------------------------------
|
| Pourquoi centraliser ici ?
| - toute l'UI dépend de queue.status
| - quand loadDashboardData() recharge la queue,
|   tout l'état visuel se met à jour au même endroit
|--------------------------------------------------------------------------
*/
function updateQueueStatusBadge(queue) {
    const badge = document.getElementById('list-status-badge');
    const toggleButton = document.getElementById('toggle-list-btn');

    /*
    |--------------------------------------------------------------
    | Sécurité minimale
    |--------------------------------------------------------------
    */
    if (!badge || !toggleButton) return;

    /*
    |--------------------------------------------------------------
    | Calculer l'état métier
    |--------------------------------------------------------------
    */
    const isOpen = queue.status === 'open';

    /*
    |--------------------------------------------------------------
    | Mettre à jour le badge
    |--------------------------------------------------------------
    */
    badge.textContent = isOpen ? 'Liste ouverte' : 'Liste fermée';
    badge.classList.remove('list-status-badge--open', 'list-status-badge--closed');
    badge.classList.add(isOpen ? 'list-status-badge--open' : 'list-status-badge--closed');

    /*
    |--------------------------------------------------------------
    | Mettre à jour le bouton fermer / réouvrir
    |--------------------------------------------------------------
    */
    toggleButton.textContent = isOpen ? 'Fermer la liste' : 'Réouvrir la liste';
    toggleButton.classList.remove('btn-toggle-list--close', 'btn-toggle-list--open');
    toggleButton.classList.add(isOpen ? 'btn-toggle-list--close' : 'btn-toggle-list--open');

    /*
    |--------------------------------------------------------------
    | Mettre aussi à jour le bouton Nouveau patient
    |--------------------------------------------------------------
    | Cela garde l'interface cohérente avec l'état réel de la liste.
    */
    updateAddPatientButtonState(queue);
}

/*
|--------------------------------------------------------------------------
| Construire le tableau des patients du jour
|--------------------------------------------------------------------------
*/
function renderDashboardTable(entries) {
    const tableBody = document.getElementById('day-list-table-body');

    if (!tableBody) return;

    if (!entries || entries.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="table-empty-state">
                    Aucun patient pour aujourd'hui
                </td>
            </tr>
        `;

        updatePatientDetails(null);
        return;
    }

    tableBody.innerHTML = entries.map((entry, index) => `
        <tr
            class="patient-row ${index === 0 ? 'is-selected' : ''}"
            data-entry-id="${entry.id}"
        >
            <td>${entry.number}</td>
            <td class="patient-name-cell">${escapeHtml(entry.display_name ?? '')}</td>
            <td class="patient-phone-cell">${escapeHtml(entry.phone ?? '-')}</td>
            <td>${escapeHtml(entry.time ?? '-')}</td>
            <td>${renderStatusPill(entry.status)}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-action-icon btn-action-icon--view" type="button" title="Voir">
                        <span>👁</span>
                    </button>

                    <button class="btn-action-icon btn-action-icon--absent" type="button" title="Absent">
                        <span>✕</span>
                    </button>

                    <button class="btn-action-icon btn-action-icon--done" type="button" title="Terminer">
                        <span>✓</span>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    updatePatientDetails(entries[0]);
    bindPatientRowEvents(entries);
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
function renderStatusPill(status) {
    if (status === 'waiting') {
        return '<span class="status-pill status-pill--waiting">En attente</span>';
    }

    if (status === 'no_show') {
        return '<span class="status-pill status-pill--absent">Absent</span>';
    }

    if (status === 'done') {
        return '<span class="status-pill status-pill--done">Terminé</span>';
    }

    return `<span class="status-pill">${escapeHtml(status)}</span>`;
}
function formatBirthDate(value) {
    if (!value) return '-';

    const parts = String(value).split('-');
    if (parts.length !== 3) return escapeHtml(String(value));

    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
}

function formatSourceLabel(source) {
    if (source === 'secretary') return 'Secrétaire';
    if (source === 'doctor') return 'Médecin';
    if (source === 'qr') return 'QR code';
    if (source === 'link') return 'Lien public';
    if (!source) return '-';
    return escapeHtml(String(source));
}

function getStatusLabel(status) {
    if (status === 'waiting') return 'En attente';
    if (status === 'no_show') return 'Absent';
    if (status === 'done') return 'Terminé';
    return status || '-';
}

function renderDetailStatusPill(status) {
    return renderStatusPill(status);
}

function renderDefaultPatientHistory() {
    return `
        <li>
            <span>Aucune visite récente</span>
            <strong class="history-status">-</strong>
        </li>
    `;
}

function updatePatientDetails(entry) {
    const nameEl = document.getElementById('patient-details-name');
    const phoneEl = document.getElementById('patient-details-phone');
    const birthDateEl = document.getElementById('patient-details-birth-date');
    const sourceEl = document.getElementById('patient-details-source');
    const statusEl = document.getElementById('patient-details-status');
    const notesEl = document.getElementById('patient-details-notes');
    const historyEl = document.getElementById('patient-details-history');

    if (!nameEl || !phoneEl || !birthDateEl || !sourceEl || !statusEl || !notesEl || !historyEl) {
        return;
    }

    if (!entry) {
        nameEl.textContent = 'Aucun patient sélectionné';
        phoneEl.textContent = '-';
        birthDateEl.textContent = '-';
        sourceEl.textContent = '-';
        statusEl.innerHTML = '<span class="status-pill">-</span>';
        notesEl.textContent = 'Aucune note disponible.';
        historyEl.innerHTML = renderDefaultPatientHistory();
        return;
    }

    nameEl.textContent = entry.display_name || '-';
    phoneEl.textContent = entry.phone || '-';
    birthDateEl.textContent = formatBirthDate(entry.birth_date);
    sourceEl.textContent = formatSourceLabel(entry.source);
    statusEl.innerHTML = renderDetailStatusPill(entry.status);

    notesEl.textContent = 'Aucune note disponible pour le moment.';
    historyEl.innerHTML = renderDefaultPatientHistory();
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
function bindPatientRowEvents(entries) {
    const rows = document.querySelectorAll('.patient-row');

    rows.forEach(row => {
        const entryId = row.dataset.entryId;
        const entry = findEntryById(entries, entryId);

        if (!entry) return;

        row.addEventListener('click', (event) => {
            const clickedActionButton = event.target.closest('.btn-action-icon');

            if (clickedActionButton && !clickedActionButton.classList.contains('btn-action-icon--view')) {
                return;
            }

            selectPatientRowByEntryId(entry.id);
            updatePatientDetails(entry);
        });

        const viewBtn = row.querySelector('.btn-action-icon--view');
        if (viewBtn) {
            viewBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();

                selectPatientRowByEntryId(entry.id);
                updatePatientDetails(entry);
            });
        }

        const absentBtn = row.querySelector('.btn-action-icon--absent');
        if (absentBtn) {
            absentBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();

                try {
                    await updateQueueEntryStatus(entry.id, 'no_show');
                    await loadDashboardData();
                } catch (error) {
                    console.error('Erreur statut absent:', error);
                    alert(error.message || 'Impossible de marquer le patient absent.');
                }
            });
        }

        const doneBtn = row.querySelector('.btn-action-icon--done');
        if (doneBtn) {
            doneBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();

                try {
                    await updateQueueEntryStatus(entry.id, 'done');
                    await loadDashboardData();
                } catch (error) {
                    console.error('Erreur statut terminé:', error);
                    alert(error.message || 'Impossible de terminer le patient.');
                }
            });
        }
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

    if (waitingEl) waitingEl.textContent = counts.waiting ?? 0;
    if (absentEl) absentEl.textContent = counts.absent ?? 0;
    if (doneEl) doneEl.textContent = counts.done ?? 0;
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

document.querySelectorAll('.sidebar__item').forEach(item => {
    item.addEventListener('click', function () {
        const page = this.getAttribute('data-page');
        setActiveMenuItem(page);
        loadPage(page);
    });
});

// ==========================================================
// PAGE PAR DÉFAUT AU REFRESH
// ==========================================================

document.addEventListener('DOMContentLoaded', function () {
    setActiveMenuItem('dashboard');
    loadPage('dashboard');
});