const ADD_PATIENT_API_URL = '/Marki_app/Partie_medecin/public/api/queue_add_patient.php';
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

function openAddPatientModal() {
  const { modal, fullNameInput, messageBox, form } = getAddPatientModalElements();
  if (!modal) return;

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');

  if (messageBox) {
    messageBox.textContent = '';
    messageBox.className = 'marki-form__message';
  }

  if (form) {
    form.reset();
  }

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

function initDashboardPage() {
    bindAddPatientModalEvents();
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
| Mettre à jour le badge Liste ouverte / fermée
|--------------------------------------------------------------------------
*/
function updateQueueStatusBadge(queue) {
    const badge = document.getElementById('list-status-badge');
    const toggleButton = document.getElementById('toggle-list-btn');

    if (!badge || !toggleButton) return;

    const isOpen = queue.status === 'open';

    badge.textContent = isOpen ? 'Liste ouverte' : 'Liste fermée';
    badge.classList.remove('list-status-badge--open', 'list-status-badge--closed');
    badge.classList.add(isOpen ? 'list-status-badge--open' : 'list-status-badge--closed');

    toggleButton.textContent = isOpen ? 'Fermer la liste' : 'Réouvrir la liste';
    toggleButton.classList.remove('btn-toggle-list--close', 'btn-toggle-list--open');
    toggleButton.classList.add(isOpen ? 'btn-toggle-list--close' : 'btn-toggle-list--open');
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
        return;
    }

    tableBody.innerHTML = entries.map((entry, index) => `
        <tr class="patient-row ${index === 0 ? 'is-selected' : ''}">
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