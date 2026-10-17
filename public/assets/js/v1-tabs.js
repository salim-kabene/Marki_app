/* =========================================================
   MARKI V1 — Mes Patients, Toutes les listes, Paramètres
   Ce fichier complète app.js sans remplacer le dashboard.
   Il doit être chargé APRÈS app.js.
   ========================================================= */

(function () {
  'use strict';

  const API = {
    patients: 'api/patients_index.php',
    patientDetails: 'api/patient_details.php',
    patientUpdate: 'api/patient_update_profile.php',
    patientAddToToday: 'api/patient_add_to_today.php',
    queues: 'api/queues_history.php',
    queueDetails: 'api/queue_history_details.php',
    settings: 'api/settings_get.php',
    settingsUpdate: 'api/settings_update.php'
  };

  const PATIENTS_SORT_KEY = 'marki.patientsSort';

  function readStoredPatientsSort() {
    try {
      return localStorage.getItem(PATIENTS_SORT_KEY) === 'name' ? 'name' : 'recent';
    } catch (error) {
      return 'recent';
    }
  }

  const patientsState = {
    query: '',
    page: 1,
    perPage: 15,
    sort: readStoredPatientsSort(),
    selectedId: null,
    // Mobile : patient dont la fiche est dépliée dans la liste.
    expandedId: null,
    requestId: 0
  };

  const queuesState = {
    dateFrom: '',
    dateTo: '',
    dayStatus: 'all',
    page: 1,
    perPage: 12,
    selectedId: null,
    expandedId: null,
    requestId: 0
  };

  let patientSearchTimer = null;

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

      if (!retryable) {
        throw error;
      }

      await new Promise(resolve => window.setTimeout(resolve, 300));
      return requestJson(url, options, retries - 1);
    }
  }

  function setMessage(element, message = '', type = '') {
    if (!element) return;

    element.textContent = message;
    element.className = 'v1-message';

    if (message && type) {
      element.classList.add(`is-${type}`);
    }
  }

  const MONTHS_FR = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ];

  function formatDate(value) {
    if (!value) return '-';

    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return escapeHtml(value);

    const day = parseInt(match[3], 10);
    const monthIndex = parseInt(match[2], 10) - 1;
    const year = match[1];
    const monthName = MONTHS_FR[monthIndex] || match[2];

    return `${day} ${monthName} ${year}`;
  }

  function formatDateToDigits(value) {
    if (!value) return '';

    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return String(value);

    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  function frenchDateToIso(value) {
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

  function bindFrenchDateInput(input) {
    if (!input || input.dataset.frenchDateBound === '1') return;
    input.dataset.frenchDateBound = '1';
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '').slice(0, 8);
      input.value = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
        .filter(Boolean)
        .join('/');
    });
  }

  function formatDateTime(value) {
    if (!value) return '-';

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

  /*
  |--------------------------------------------------------------------------
  | Afficher un téléphone algérien au format local
  |--------------------------------------------------------------------------
  | La base conserve +213. L'interface affiche 05, 06 ou 07.
  |--------------------------------------------------------------------------
  */
  function formatPhoneForDisplay(value) {
    if (window.MarkiPhone) {
      const local = window.MarkiPhone.localMobileDigits(value);
      return /^0[567]\d{8}$/.test(local)
        ? window.MarkiPhone.formatMobile(local)
        : window.MarkiPhone.formatAdaptivePhone(value);
    }

    return String(value ?? '').trim();
  }

  function formatRelativeDate(value) {
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

  function formatAlgerianPhoneForDisplay(value) {
    const raw = String(value ?? '').trim();
    const digits = raw.replace(/[^0-9]/g, '');

    if (/^0[567][0-9]{8}$/.test(digits)) {
      return digits;
    }

    if (/^213[567][0-9]{8}$/.test(digits)) {
      return `0${digits.slice(3)}`;
    }

    if (/^00213[567][0-9]{8}$/.test(digits)) {
      return `0${digits.slice(5)}`;
    }

    return raw;
  }

  function statusLabel(status) {
    const labels = {
      waiting: 'En attente',
      called: 'Appelé',
      done: 'Terminé',
      no_show: 'Absent',
      canceled: 'Annulé',
      active: 'Active',
      paused: 'En pause',
      completed: 'Clôturée',
      open: 'Ouverte',
      closed: 'Fermée',
      archived: 'Archivée',
      in_progress: 'En cours'
    };

    return labels[status] || status || '-';
  }

  function statusClass(status) {
    const normalized = String(status || '')
      .toLowerCase()
      .replace(/_/g, '-');

    return `v1-status v1-status--${normalized}`;
  }

  function renderStatus(status) {
    return `<span class="${statusClass(status)}">${escapeHtml(statusLabel(status))}</span>`;
  }

  function paginationPages(current, total) {
    if (total <= 7) {
      return Array.from({ length: total }, (_, index) => index + 1);
    }

    const pages = new Set([1, total, current - 1, current, current + 1]);
    const valid = [...pages]
      .filter(page => page >= 1 && page <= total)
      .sort((a, b) => a - b);

    const result = [];
    let previous = 0;

    valid.forEach(page => {
      if (previous && page - previous > 1) {
        result.push('…');
      }

      result.push(page);
      previous = page;
    });

    return result;
  }

  function renderPagination(container, pagination, onPage) {
    if (!container) return;

    const current = Number(pagination?.page || 1);
    const total = Math.max(1, Number(pagination?.total_pages || 1));

    const pageButtons = paginationPages(current, total).map(page => {
      if (page === '…') {
        return '<span class="v1-pagination-summary" aria-hidden="true">…</span>';
      }

      return `
        <button
          type="button"
          data-page="${page}"
          class="${Number(page) === current ? 'is-active' : ''}"
          aria-label="Page ${page}"
          ${Number(page) === current ? 'aria-current="page"' : ''}
        >${page}</button>
      `;
    }).join('');

    container.innerHTML = `
      <button type="button" data-page="${current - 1}" ${current <= 1 ? 'disabled' : ''} aria-label="Page précédente">‹</button>
      ${pageButtons}
      <button type="button" data-page="${current + 1}" ${current >= total ? 'disabled' : ''} aria-label="Page suivante">›</button>
    `;

    container.querySelectorAll('button[data-page]').forEach(button => {
      button.addEventListener('click', () => {
        const page = Number(button.dataset.page);
        if (page >= 1 && page <= total && page !== current) {
          onPage(page);
        }
      });
    });
  }

  function pageSummary(pagination) {
    const total = Number(pagination?.total || 0);
    const page = Number(pagination?.page || 1);
    const perPage = Number(pagination?.per_page || 12);

    if (total === 0) return 'Aucun résultat';

    const first = ((page - 1) * perPage) + 1;
    const last = Math.min(total, page * perPage);
    return `${first} à ${last} sur ${total}`;
  }

  /* =======================================================
     MES PATIENTS
     ======================================================= */

  function initPatientsPage() {
    const searchInput = document.getElementById('patients-search');
    const pageSize = document.getElementById('patients-page-size');
    const form = document.getElementById('patient-profile-form');
    const addButton = document.getElementById('patient-add-to-today-button');
    const editButton = document.getElementById('patient-profile-edit-button');
    const editModal = document.getElementById('patient-profile-edit-modal');
    const sortSelect = document.getElementById('patients-sort');

    if (!searchInput || !pageSize) return;

    patientsState.expandedId = null;
    rememberPanelHome(document.querySelector('.v1-patient-profile'));

    const requestedPatientId = Number(
      sessionStorage.getItem('marki.openPatientId') || 0
    );

    if (requestedPatientId > 0) {
      patientsState.selectedId = requestedPatientId;
      patientsState.expandedId = requestedPatientId;
      sessionStorage.removeItem('marki.openPatientId');
    }

    searchInput.value = patientsState.query;
    pageSize.value = String(patientsState.perPage);
    if (sortSelect) sortSelect.value = patientsState.sort;

    sortSelect?.addEventListener('change', () => {
      patientsState.sort = sortSelect.value === 'name' ? 'name' : 'recent';
      patientsState.page = 1;
      try {
        localStorage.setItem(PATIENTS_SORT_KEY, patientsState.sort);
      } catch (error) {
        // Préférence non mémorisée : le tri fonctionne quand même.
      }
      loadPatients();
    });

    searchInput.addEventListener('input', () => {
      clearTimeout(patientSearchTimer);
      patientSearchTimer = setTimeout(() => {
        patientsState.query = searchInput.value.trim();
        patientsState.page = 1;
        loadPatients();
      }, 280);
    });

    pageSize.addEventListener('change', () => {
      patientsState.perPage = Number(pageSize.value) || 15;
      patientsState.page = 1;
      loadPatients();
    });

    form?.addEventListener('submit', savePatientProfile);
    bindFrenchDateInput(document.getElementById('patient-profile-birth-date'));
    addButton?.addEventListener('click', addPatientToTodayQueue);
    editButton?.addEventListener('click', openPatientProfileModal);
    document.querySelectorAll('[data-close-patient-profile-modal]').forEach(button => {
      button.addEventListener('click', closePatientProfileModal);
    });
    editModal?.addEventListener('keydown', event => {
      if (event.key === 'Escape') closePatientProfileModal();
    });

    if (requestedPatientId > 0) {
      focusPatientFromNavigation(requestedPatientId, searchInput);
    } else {
      loadPatients();
    }
  }

  async function focusPatientFromNavigation(patientId, searchInput) {
    try {
      const response = await requestJson(
        `${API.patientDetails}?patient_id=${encodeURIComponent(patientId)}`
      );
      const patient = response.data?.patient;

      if (!patient) {
        throw new Error('Fiche patient introuvable.');
      }

      patientsState.selectedId = Number(patient.id);
      patientsState.expandedId = Number(patient.id);
      patientsState.query = patient.full_name || '';
      patientsState.page = 1;
      searchInput.value = patientsState.query;

      await loadPatients();

      requestAnimationFrame(() => {
        document
          .querySelector(`#patients-table-body tr[data-patient-id="${patientId}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    } catch (error) {
      console.error('Ouverture de la fiche patient :', error);
      await loadPatients();
      await loadPatientProfile(patientId);
    }
  }

  async function loadPatients() {
    const body = document.getElementById('patients-table-body');
    const message = document.getElementById('patients-page-message');
    const summary = document.getElementById('patients-results-summary');
    const paginationSummary = document.getElementById('patients-pagination-summary');
    const paginationContainer = document.getElementById('patients-pagination');

    if (!body) return;

    const requestId = ++patientsState.requestId;
    setMessage(message);
    restoreInlinePanel(body, document.querySelector('.v1-patient-profile'));
    body.innerHTML = '<tr><td colspan="6" class="v1-empty-cell">Chargement des patients…</td></tr>';

    const params = new URLSearchParams({
      q: patientsState.query,
      page: String(patientsState.page),
      per_page: String(patientsState.perPage),
      sort: patientsState.sort
    });

    try {
      const response = await requestJson(`${API.patients}?${params.toString()}`);
      if (requestId !== patientsState.requestId) return;

      const items = response.data?.items || [];
      const pagination = response.data?.pagination || {};

      if (summary) {
        summary.textContent = `${Number(pagination.total || 0)} patient(s) trouvé(s)`;
      }

      if (paginationSummary) {
        paginationSummary.textContent = pageSummary(pagination);
      }

      renderPagination(paginationContainer, pagination, page => {
        patientsState.page = page;
        loadPatients();
      });

      if (items.length === 0) {
        body.innerHTML = '<tr><td colspan="6" class="v1-empty-cell">Aucun patient ne correspond à la recherche.</td></tr>';
        clearPatientProfile();
        return;
      }

      body.innerHTML = items.map(patient => `
        <tr
          data-selectable="true"
          data-patient-id="${patient.id}"
          class="${Number(patient.id) === Number(patientsState.selectedId) ? 'is-selected' : ''}"
          tabindex="0"
        >
          <td>
            <div class="v1-table__patient-cell">
              <span class="v1-table__patient-avatar-mini" aria-hidden="true">
                <svg class="mk-icon mk-icon--sm"><use href="#mk-user"></use></svg>
              </span>
              <div class="v1-table__patient-info">
                <span class="v1-table__patient-name">${escapeHtml(patient.full_name)}</span>
                <span class="v1-table__subtext">Ajouté le ${formatDate(patient.created_at)}</span>
              </div>
            </div>
          </td>
          <td>${escapeHtml(formatPhoneForDisplay(patient.phone) || '-')}</td>
          <td>${formatDate(patient.birth_date)}</td>
          <td>${patient.last_visit_at ? formatDateTime(patient.last_visit_at) : '-'}</td>
          <td>${Number(patient.visit_count || 0)}</td>
          <td class="v1-table__action-heading">
            <button type="button" class="v1-icon-button" data-open-patient="${patient.id}" title="Ouvrir la fiche" aria-label="Ouvrir la fiche de ${escapeHtml(patient.full_name)}">›</button>
          </td>
        </tr>
      `).join('');

      body.querySelectorAll('tr[data-patient-id]').forEach(row => {
        const open = async () => {
          const patientId = Number(row.dataset.patientId);

          // Toutes tailles d'écran : la fiche se déplie sous le patient.
          {
            const panel = document.querySelector('.v1-patient-profile');
            if (patientsState.expandedId === patientId) {
              patientsState.expandedId = null;
              restoreInlinePanel(body, panel, { animate: true });
              return;
            }
            // On charge d'abord la fiche, puis elle se déplie à sa vraie hauteur.
            patientsState.expandedId = patientId;
            row.classList.add('is-loading');
            restoreInlinePanel(body, panel, { animate: true });
            await selectPatient(patientId);
            row.classList.remove('is-loading');
            if (patientsState.expandedId !== patientId || !row.isConnected) return;
            mountInlinePanel(row, panel, 6, { animate: true });
            return;
          }

        };
        row.addEventListener('click', open);
        row.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
          }
        });
      });

      {
        // Rien n'est déplié d'office, sauf la fiche demandée.
        const expandedRow = patientsState.expandedId
          ? body.querySelector(`tr[data-patient-id="${patientsState.expandedId}"]`)
          : null;
        if (expandedRow) {
          mountInlinePanel(expandedRow, document.querySelector('.v1-patient-profile'), 6);
          await selectPatient(patientsState.expandedId);
        } else {
          patientsState.expandedId = null;
        }
      }
    } catch (error) {
      console.error('Mes Patients :', error);
      body.innerHTML = '<tr><td colspan="6" class="v1-empty-cell">Impossible de charger les patients.</td></tr>';
      setMessage(message, error.message, 'error');
    }
  }

  async function selectPatient(patientId) {
    patientsState.selectedId = Number(patientId);

    document.querySelectorAll('#patients-table-body tr[data-patient-id]').forEach(row => {
      row.classList.toggle(
        'is-selected',
        Number(row.dataset.patientId) === patientsState.selectedId
      );
    });

    await loadPatientProfile(patientId);
  }

  async function loadPatientProfile(patientId) {
    const empty = document.getElementById('patient-profile-empty');
    const content = document.getElementById('patient-profile-content');
    const title = document.getElementById('patient-profile-title');
    const formMessage = document.getElementById('patient-profile-form-message');
    const editButton = document.getElementById('patient-profile-edit-button');

    if (!content || !empty) return;

    empty.hidden = true;
    content.hidden = true;
    if (editButton) editButton.hidden = true;
    setMessage(formMessage);

    try {
      const response = await requestJson(
        `${API.patientDetails}?patient_id=${encodeURIComponent(patientId)}`
      );
      const patient = response.data?.patient;

      if (!patient) {
        throw new Error('Fiche patient introuvable.');
      }

      patientsState.selectedId = Number(patient.id);

      if (title) title.textContent = patient.full_name;
      setProfileText('patient-view-full-name', patient.full_name, 'Patient');
      setProfileText('patient-view-phone', formatPhoneForDisplay(patient.phone), 'Téléphone non renseigné');
      // Les informations non renseignées ne sont pas affichées.
      setProfileDetail('patient-view-birth-date', patient.birth_date ? formatDate(patient.birth_date) : '');
      setProfileDetail('patient-view-email', patient.email);
      setProfileDetail('patient-view-address', patient.address);
      setProfileDetail('patient-view-notes', patient.notes_non_medical);
      const detailsList = document.querySelector('.v1-profile-details');
      if (detailsList) {
        detailsList.hidden = !detailsList.querySelector('.v1-profile-detail:not([hidden])');
      }
      setProfileText('patient-profile-avatar', patientInitials(patient.full_name), '—');
      setInputValue('patient-profile-id', patient.id);
      setInputValue('patient-profile-full-name', patient.full_name);
      setInputValue('patient-profile-phone', formatPhoneForDisplay(patient.phone));
      window.MarkiPhone?.bind(document.getElementById('patient-profile-edit-modal'));
      setInputValue('patient-profile-birth-date', patient.birth_date ? formatDateToDigits(patient.birth_date) : '');
      setInputValue('patient-profile-email', patient.email);
      setInputValue('patient-profile-address', patient.address);
      setInputValue('patient-profile-notes', patient.notes_non_medical);

      renderPatientVisits(patient.recent_visits || []);

      empty.hidden = true;
      content.hidden = false;
      if (editButton) editButton.hidden = false;
    } catch (error) {
      console.error('Fiche patient :', error);
      empty.hidden = false;
      empty.textContent = error.message;
      content.hidden = true;
      if (editButton) editButton.hidden = true;
    }
  }

  function setProfileDetail(id, value) {
    const element = document.getElementById(id);
    if (!element) return;
    const text = String(value || '').trim();
    element.textContent = text;
    const detail = element.closest('.v1-profile-detail');
    if (detail) detail.hidden = text === '';
  }

  /* -------------------------------------------------------
     Fiches dépliables (téléphone)
     Le panneau de détail existant est déplacé dans une ligne
     insérée sous l'élément touché : ses identifiants et ses
     boutons restent les mêmes, rien n'est dupliqué.
     ------------------------------------------------------- */
  const SMALL_SCREEN_QUERY = window.matchMedia('(max-width: 768px)');
  const panelHomes = new WeakMap();

  function isSmallScreen() {
    return SMALL_SCREEN_QUERY.matches;
  }

  function rememberPanelHome(panel) {
    if (panel && panel.parentElement) panelHomes.set(panel, panel.parentElement);
  }

  function restoreInlinePanel(body, panel, { animate = false } = {}) {
    if (!body) return;

    body.querySelectorAll(':scope > .is-expanded').forEach(row => {
      row.classList.remove('is-expanded');
      row.setAttribute('aria-expanded', 'false');
    });

    const holder = body.querySelector(':scope > .v1-inline-panel-row');
    if (!holder) return;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      const home = panel ? panelHomes.get(panel) : null;
      if (panel && home && holder.contains(panel)) home.appendChild(panel);
      holder.remove();
    };

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cell = holder.querySelector('.v1-inline-panel-cell');
    const clip = holder.querySelector('.v1-inline-panel-clip');
    if (!animate || reduceMotion || !clip?.animate) {
      finish();
      return;
    }

    // Repli : la hauteur descend en douceur jusqu'à zéro, puis on retire.
    // (Une cellule de tableau ne rétrécit pas : on anime l'enveloppe.)
    holder.classList.add('is-leaving');
    const timing = { duration: 260, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' };
    const height = clip.getBoundingClientRect().height;
    const animation = clip.animate([
      { height: `${height}px`, opacity: 1, transform: 'none' },
      { height: '0px', opacity: 0, transform: 'translateY(-6px)' }
    ], timing);
    const cellStyle = getComputedStyle(cell);
    cell.animate([
      { paddingTop: cellStyle.paddingTop, paddingBottom: cellStyle.paddingBottom },
      { paddingTop: '0px', paddingBottom: '0px' }
    ], timing);
    animation.finished.then(finish, finish);
    window.setTimeout(finish, 600);
  }

  // Dépliage : la fiche s'ouvre de zéro à sa vraie hauteur.
  function animateInlineOpen(holder) {
    const cell = holder?.querySelector('.v1-inline-panel-cell');
    const clip = holder?.querySelector('.v1-inline-panel-clip');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!clip?.animate || reduceMotion) return;

    const timing = { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
    const height = clip.getBoundingClientRect().height;
    clip.animate([
      { height: '0px', opacity: 0, transform: 'translateY(-6px)' },
      { height: `${height}px`, opacity: 1, transform: 'none' }
    ], timing);
    const cellStyle = getComputedStyle(cell);
    cell.animate([
      { paddingTop: '0px', paddingBottom: '0px' },
      { paddingTop: cellStyle.paddingTop, paddingBottom: cellStyle.paddingBottom }
    ], timing);
  }

  function mountInlinePanel(row, panel, colspan, { animate = false } = {}) {
    const body = row?.parentElement;
    if (!body || !panel) return;

    restoreInlinePanel(body, panel);

    // Ligne de tableau ou carte : le conteneur suit la nature de la liste.
    const isTableRow = row.tagName === 'TR';
    const holder = document.createElement(isTableRow ? 'tr' : 'div');
    holder.className = 'v1-inline-panel-row';
    const cell = document.createElement(isTableRow ? 'td' : 'div');
    if (isTableRow) cell.colSpan = colspan;
    cell.className = 'v1-inline-panel-cell';
    // Enveloppe animable (une cellule de tableau ne peut pas rétrécir).
    const clip = document.createElement('div');
    clip.className = 'v1-inline-panel-clip';
    clip.appendChild(panel);
    cell.appendChild(clip);
    holder.appendChild(cell);
    row.after(holder);

    row.classList.add('is-expanded');
    row.setAttribute('aria-expanded', 'true');

    if (animate) animateInlineOpen(holder);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => {
      row.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
    });
  }

  // Retour à l'écran large : les panneaux reprennent leur place à droite.
  SMALL_SCREEN_QUERY.addEventListener?.('change', event => {
    if (event.matches) return;
    // La fiche patient reste dépliée dans la liste à toutes les tailles.
    restoreInlinePanel(
      document.getElementById('queues-history-table-body'),
      document.querySelector('.v1-queue-detail')
    );
    queuesState.expandedId = null;
  });

  // Mobile / tablette : la fiche est sous la liste, on l'amène à l'écran.
  function revealOnSmallScreen(element) {
    if (!element || !window.matchMedia('(max-width: 768px)').matches) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  function setProfileText(id, value, fallback) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value || '').trim() || fallback;
  }

  function patientInitials(fullName) {
    const names = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (!names.length) return '—';
    return `${names[0][0] || ''}${names.length > 1 ? names[names.length - 1][0] : ''}`.toUpperCase();
  }

  function openPatientProfileModal() {
    const modal = document.getElementById('patient-profile-edit-modal');
    const patientId = Number(document.getElementById('patient-profile-id')?.value || 0);
    if (!modal || patientId <= 0) return;

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('v1-profile-modal-open');
    requestAnimationFrame(() => document.getElementById('patient-profile-full-name')?.focus());
  }

  function closePatientProfileModal() {
    const modal = document.getElementById('patient-profile-edit-modal');
    if (!modal || modal.hidden) return;

    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('v1-profile-modal-open');
    setMessage(document.getElementById('patient-profile-form-message'));
    document.getElementById('patient-profile-edit-button')?.focus();
  }

  function setInputValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value ?? '';
  }

  function clearPatientProfile() {
    patientsState.selectedId = null;
    const empty = document.getElementById('patient-profile-empty');
    const content = document.getElementById('patient-profile-content');
    const title = document.getElementById('patient-profile-title');
    const editButton = document.getElementById('patient-profile-edit-button');

    if (title) title.textContent = 'Sélectionnez un patient';
    if (empty) {
      empty.hidden = false;
      empty.textContent = 'Cliquez sur un patient pour afficher sa fiche et son historique.';
    }
    if (content) content.hidden = true;
    if (editButton) editButton.hidden = true;
    closePatientProfileModal();
  }

  function renderPatientVisits(visits) {
    const container = document.getElementById('patient-visits-list');
    const count = document.getElementById('patient-visits-count');
    if (!container) return;

    if (count) count.textContent = String(visits.length);

    const section = container.closest('.v1-history-section');
    if (section) section.hidden = visits.length === 0;

    if (!visits.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = visits.map(visit => {
      const date = visit.ended_at || visit.started_at || visit.created_at;
      return `
        <article class="v1-timeline__item">
          <div>
            <strong>Visite du ${formatDateTime(date)}</strong>
            <p class="v1-relative-date">${formatRelativeDate(date)}</p>
            <p>${visit.queue_entry_id ? `Reliée à l’entrée n° ${visit.queue_entry_id}` : 'Visite sans entrée de file'}</p>
          </div>
          ${renderStatus(visit.status)}
        </article>
      `;
    }).join('');
  }

  async function savePatientProfile(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const message = document.getElementById('patient-profile-form-message');
    const button = document.getElementById('patient-profile-save-button');
    const patientId = Number(document.getElementById('patient-profile-id')?.value || 0);

    if (patientId <= 0) return;

    const payload = Object.fromEntries(new FormData(form).entries());
    payload.patient_id = patientId;
    const birthDate = frenchDateToIso(payload.birth_date);
    if (birthDate === null) {
      setMessage(message, 'Saisissez la date de naissance au format JJ/MM/AAAA.', 'error');
      document.getElementById('patient-profile-birth-date')?.focus();
      return;
    }
    payload.birth_date = birthDate;

    setMessage(message);
    if (button) {
      button.disabled = true;
      button.textContent = 'Enregistrement…';
    }

    try {
      const response = await requestJson(API.patientUpdate, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      setMessage(message, response.message || 'Fiche patient mise à jour.', 'success');
      await loadPatients();
      await loadPatientProfile(patientId);
      closePatientProfileModal();
    } catch (error) {
      console.error('Mise à jour patient :', error);
      setMessage(message, error.message, 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Enregistrer les modifications';
      }
    }
  }

  async function addPatientToTodayQueue() {
    const button = document.getElementById('patient-add-to-today-button');
    const message = document.getElementById('patients-page-message');
    const patientId = Number(document.getElementById('patient-profile-id')?.value || 0);

    if (patientId <= 0) return;

    if (button) {
      button.disabled = true;
      button.textContent = 'Ajout en cours…';
    }
    setMessage(message);

    try {
      const response = await requestJson(API.patientAddToToday, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId })
      });

      setMessage(message, response.message || 'Patient ajouté à la Liste du jour.', 'success');
    } catch (error) {
      console.error('Ajout à la liste du jour :', error);
      setMessage(message, error.message, 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Ajouter à la liste du jour';
      }
    }
  }

  window.openPatientProfile = function (patientId) {
    const id = Number(patientId);
    if (id <= 0) return;

    sessionStorage.setItem('marki.openPatientId', String(id));
    patientsState.selectedId = id;

    if (typeof window.setActiveMenuItem === 'function') {
      window.setActiveMenuItem('patients');
    }

    if (typeof window.loadPage === 'function') {
      window.loadPage('patients');
    }
  };

  /* =======================================================
     TOUTES LES LISTES (VUE TABLEAU / HISTORIQUE)
     ======================================================= */

  function initListsPage() {
    const form = document.getElementById('queues-history-filters');
    const reset = document.getElementById('queues-reset-filters');
    const pageSize = document.getElementById('queues-page-size');

    if (!form || !pageSize) return;

    queuesState.expandedId = null;
    rememberPanelHome(document.querySelector('.v1-queue-detail'));

    pageSize.value = String(queuesState.perPage);
    setInputValue('queues-date-from', queuesState.dateFrom);
    setInputValue('queues-date-to', queuesState.dateTo);
    setInputValue('queues-day-status', queuesState.dayStatus);

    form.addEventListener('submit', event => {
      event.preventDefault();
      queuesState.dateFrom = document.getElementById('queues-date-from')?.value || '';
      queuesState.dateTo = document.getElementById('queues-date-to')?.value || '';
      queuesState.dayStatus = document.getElementById('queues-day-status')?.value || 'all';
      queuesState.perPage = Number(pageSize.value) || 12;
      queuesState.page = 1;

      loadQueuesHistory();
    });

    pageSize.addEventListener('change', () => {
      queuesState.perPage = Number(pageSize.value) || 12;
    });

    reset?.addEventListener('click', () => {
      queuesState.dateFrom = '';
      queuesState.dateTo = '';
      queuesState.dayStatus = 'all';
      queuesState.page = 1;
      setInputValue('queues-date-from', '');
      setInputValue('queues-date-to', '');
      setInputValue('queues-day-status', 'all');

      loadQueuesHistory();
    });

    loadQueuesHistory();
  }

  /* -------------------------------------------------------
     Cartes « journée » : les compteurs deviennent un bilan
     lisible d'un coup d'œil (barre de répartition + chiffres).
     ------------------------------------------------------- */
  const WEEKDAY_FORMAT = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' });
  const SHORT_MONTH_FORMAT = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });

  function queueCounts(queue) {
    return {
      total: Number(queue.total_entries || 0),
      done: Number(queue.done_count || 0),
      absent: Number(queue.no_show_count || 0),
      canceled: Number(queue.canceled_count || 0),
      waiting: Number(queue.waiting_count || 0) + Number(queue.called_count || 0)
    };
  }

  function percentOf(part, total) {
    return total > 0 ? Math.round((part / total) * 100) : 0;
  }

  function renderDayBar(counts) {
    if (counts.total <= 0) {
      return '<div class="v1-day-bar is-empty" aria-hidden="true"></div>';
    }

    const segments = [
      ['done', counts.done],
      ['absent', counts.absent],
      ['canceled', counts.canceled],
      ['waiting', counts.waiting]
    ].filter(([, value]) => value > 0);

    return `
      <div class="v1-day-bar" aria-hidden="true">
        ${segments.map(([key, value]) => `
          <span class="v1-day-bar__part v1-day-bar__part--${key}" style="flex-grow:${value}"></span>
        `).join('')}
      </div>
    `;
  }

  function renderDayStats(counts) {
    const tiles = [
      ['total', 'Total', counts.total, ''],
      ['done', 'Terminés', counts.done, counts.done ? `${percentOf(counts.done, counts.total)} %` : ''],
      ['absent', 'Absents', counts.absent, counts.absent ? `${percentOf(counts.absent, counts.total)} %` : ''],
      ['canceled', 'Annulés', counts.canceled, counts.canceled ? `${percentOf(counts.canceled, counts.total)} %` : '']
    ];

    if (counts.waiting > 0) {
      tiles.push(['waiting', 'En attente', counts.waiting, '']);
    }

    return `
      ${renderDayBar(counts)}
      <dl class="v1-day-stats__grid">
        ${tiles.map(([key, label, value, share]) => `
          <div class="v1-day-stat v1-day-stat--${key}">
            <dt>${label}</dt>
            <dd>
              <strong>${value}</strong>
              ${share ? `<small>${share}</small>` : ''}
            </dd>
          </div>
        `).join('')}
      </dl>
    `;
  }

  // Compteurs compacts d'une journée : une seule ligne, couleur = statut.
  function renderDayChips(counts) {
    const chips = [
      ['total', counts.total, 'patients', 'users'],
      ['done', counts.done, 'terminés', 'check'],
      ['absent', counts.absent, 'absents', 'user-x'],
      ['canceled', counts.canceled, 'annulés', 'slash-circle']
    ];
    if (counts.waiting > 0) chips.push(['waiting', counts.waiting, 'en attente', 'clock']);

    return `
      <span class="v1-day-chips">
        ${chips.map(([key, value, label, icon]) => `
          <span class="v1-day-chip v1-day-chip--${key}${value === 0 && key !== 'total' ? ' is-zero' : ''}" title="${value} ${label}">
            <svg class="mk-icon" aria-hidden="true"><use href="#mk-${icon}"></use></svg>
            <strong>${value}</strong><span class="v1-day-chip__label"> ${label}</span>
          </span>
        `).join('')}
      </span>
    `;
  }

  function renderDayCard(queue) {
    const counts = queueCounts(queue);
    const match = String(queue.queue_date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    const date = match ? new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])) : null;
    const weekday = date ? WEEKDAY_FORMAT.format(date) : '';
    const isSelected = Number(queue.id) === Number(queuesState.selectedId);
    const relative = formatRelativeDate(queue.queue_date);

    return `
      <article
        class="v1-day-card${isSelected ? ' is-selected' : ''}"
        role="listitem"
        data-selectable="true"
        data-queue-id="${queue.id}"
        tabindex="0"
        aria-expanded="false"
        aria-label="Journée du ${escapeHtml(formatDate(queue.queue_date))}"
      >
        <span class="v1-day-card__date" aria-hidden="true">
          <strong>${date ? date.getUTCDate() : '–'}</strong>
          <span>${date ? escapeHtml(SHORT_MONTH_FORMAT.format(date).replace('.', '')) : ''}</span>
        </span>
        <span class="v1-day-card__title">
          <strong>${escapeHtml(weekday)}</strong>
          <span>${escapeHtml(relative || formatDate(queue.queue_date))}</span>
        </span>
        ${renderDayChips(counts)}
        ${renderStatus(queue.day_status)}
        <svg class="mk-icon mk-icon--sm v1-day-card__chevron" aria-hidden="true"><use href="#mk-chevron-right"></use></svg>
        ${renderDayBar(counts)}
      </article>
    `;
  }

  function renderPeriodStats(items) {
    const sum = items.map(queueCounts).reduce((acc, counts) => {
      Object.keys(acc).forEach(key => { acc[key] += counts[key]; });
      return acc;
    }, { total: 0, done: 0, absent: 0, canceled: 0, waiting: 0 });

    const average = items.length ? Math.round(sum.total / items.length) : 0;

    return `
      <div class="v1-period-stats__head">
        <strong>Bilan des ${items.length} journée${items.length > 1 ? 's' : ''} affichée${items.length > 1 ? 's' : ''}</strong>
        <span>${average} patient${average > 1 ? 's' : ''} par jour en moyenne</span>
      </div>
      <div class="v1-day-stats">${renderDayStats(sum)}</div>
    `;
  }

  function renderDayCardSkeletons(count) {
    return Array.from({ length: count }, () => `
      <div class="v1-day-card is-skeleton" aria-hidden="true">
        <span class="mk-skeleton mk-skeleton--title"></span>
        <span class="mk-skeleton mk-skeleton--text"></span>
        <span class="mk-skeleton mk-skeleton--text"></span>
      </div>
    `).join('');
  }

  async function loadQueuesHistory() {
    const body = document.getElementById('queues-history-table-body');
    const message = document.getElementById('queues-history-message');
    const summary = document.getElementById('queues-results-summary');
    const paginationSummary = document.getElementById('queues-pagination-summary');
    const paginationContainer = document.getElementById('queues-pagination');

    if (!body) return;

    const requestId = ++queuesState.requestId;
    const periodStats = document.getElementById('queues-period-stats');
    setMessage(message);
    restoreInlinePanel(body, document.querySelector('.v1-queue-detail'));
    body.innerHTML = renderDayCardSkeletons(3);

    const params = new URLSearchParams({
      day_status: queuesState.dayStatus,
      page: String(queuesState.page),
      per_page: String(queuesState.perPage)
    });

    if (queuesState.dateFrom) params.set('date_from', queuesState.dateFrom);
    if (queuesState.dateTo) params.set('date_to', queuesState.dateTo);

    try {
      const response = await requestJson(`${API.queues}?${params.toString()}`);
      if (requestId !== queuesState.requestId) return;

      const items = response.data?.items || [];
      const pagination = response.data?.pagination || {};
      const filters = response.data?.filters || {};

      if (!queuesState.dateFrom && filters.date_from) {
        queuesState.dateFrom = filters.date_from;
        setInputValue('queues-date-from', filters.date_from);
      }
      if (!queuesState.dateTo && filters.date_to) {
        queuesState.dateTo = filters.date_to;
        setInputValue('queues-date-to', filters.date_to);
      }

      if (summary) summary.textContent = `${Number(pagination.total || 0)} journée(s) trouvée(s)`;
      if (paginationSummary) paginationSummary.textContent = pageSummary(pagination);

      renderPagination(paginationContainer, pagination, page => {
        queuesState.page = page;
        loadQueuesHistory();
      });

      if (!items.length) {
        body.innerHTML = '<p class="v1-empty-cell">Aucune liste dans cette période.</p>';
        if (periodStats) periodStats.hidden = true;
        clearQueueDetails();
        return;
      }

      if (periodStats) {
        periodStats.innerHTML = renderPeriodStats(items);
        periodStats.hidden = false;
      }

      body.innerHTML = items.map(queue => renderDayCard(queue)).join('');

      body.querySelectorAll('[data-queue-id]').forEach(row => {
        const open = async () => {
          const queueId = Number(row.dataset.queueId);

          // Téléphone : le détail se déplie sous la journée touchée.
          if (isSmallScreen()) {
            const panel = document.querySelector('.v1-queue-detail');
            if (queuesState.expandedId === queueId) {
              queuesState.expandedId = null;
              restoreInlinePanel(body, panel, { animate: true });
              return;
            }
            queuesState.expandedId = queueId;
            row.classList.add('is-loading');
            restoreInlinePanel(body, panel, { animate: true });
            await selectQueue(queueId);
            row.classList.remove('is-loading');
            if (queuesState.expandedId !== queueId || !row.isConnected) return;
            mountInlinePanel(row, panel, 1, { animate: true });
            return;
          }

          await selectQueue(queueId);
          revealOnSmallScreen(document.querySelector('.v1-queue-detail'));
        };
        row.addEventListener('click', open);
        row.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
          }
        });
      });

      if (isSmallScreen()) {
        const expandedRow = queuesState.expandedId
          ? body.querySelector(`[data-queue-id="${queuesState.expandedId}"]`)
          : null;
        if (expandedRow) {
          mountInlinePanel(expandedRow, document.querySelector('.v1-queue-detail'), 1);
          await selectQueue(queuesState.expandedId);
        } else {
          queuesState.expandedId = null;
        }
      } else if (
        queuesState.selectedId
        && items.some(item => Number(item.id) === Number(queuesState.selectedId))
      ) {
        await loadQueueDetails(queuesState.selectedId);
      } else {
        await selectQueue(items[0].id);
      }
    } catch (error) {
      console.error('Toutes les listes :', error);
      if (periodStats) periodStats.hidden = true;
      body.innerHTML = '<p class="v1-empty-cell">Impossible de charger les listes.</p>';
      setMessage(message, error.message, 'error');
    }
  }

  async function selectQueue(queueId) {
    queuesState.selectedId = Number(queueId);

    document.querySelectorAll('#queues-history-table-body [data-queue-id]').forEach(row => {
      row.classList.toggle(
        'is-selected',
        Number(row.dataset.queueId) === queuesState.selectedId
      );
    });

    await loadQueueDetails(queueId);
  }

  async function loadQueueDetails(queueId) {
    const empty = document.getElementById('queue-detail-empty');
    const content = document.getElementById('queue-detail-content');
    const title = document.getElementById('queue-detail-title');
    const summary = document.getElementById('queue-detail-summary');
    const body = document.getElementById('queue-detail-table-body');
    const count = document.getElementById('queue-detail-count');

    if (!empty || !content || !summary || !body) return;

    empty.hidden = false;
    empty.textContent = 'Chargement de la journée…';
    content.hidden = true;

    try {
      const response = await requestJson(
        `${API.queueDetails}?queue_id=${encodeURIComponent(queueId)}`
      );
      const queue = response.data?.queue;
      const entries = response.data?.entries || [];

      if (!queue) throw new Error('Liste introuvable.');

      queuesState.selectedId = Number(queue.id);
      if (title) title.textContent = `Liste du ${formatDate(queue.queue_date)}`;
      if (count) count.textContent = String(entries.length);

      const detailStats = document.getElementById('queue-detail-stats');
      if (detailStats) {
        const byStatus = status => entries.filter(entry => entry.status === status).length;
        detailStats.innerHTML = renderDayStats({
          total: entries.length,
          done: byStatus('done'),
          absent: byStatus('no_show'),
          canceled: byStatus('canceled'),
          waiting: byStatus('waiting') + byStatus('called') + byStatus('in_progress')
        });
      }

      summary.innerHTML = [
        ['État de la journée', renderStatus(queue.day_status), true],
        ['Inscriptions', statusLabel(queue.registration_status)],
        ['Ouverture', formatDateTime(queue.opened_at || queue.created_at)],
        ['Fermeture', formatDateTime(queue.completed_at || queue.closed_at)],
        ['Ouverte par', queue.opened_by_name || '-'],
        ['Clôturée par', queue.completed_by_name || queue.closed_by_name || '-']
      ]
        // Les informations absentes (journée pas encore clôturée…) ne sont pas affichées.
        .filter(([, value]) => value && value !== '-')
        .map(([label, value, raw]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${raw ? value : escapeHtml(value)}</dd>
        </div>
      `).join('');

      if (!entries.length) {
        body.innerHTML = '<tr><td colspan="6" class="v1-empty-cell">Aucun patient pour cette journée.</td></tr>';
      } else {
        const allRejoined = entries.filter(e => Boolean(e.last_rejoined_at));
        const rowsHtml = [];
        let prevNumber = 0;
        const usedRejoinedIds = new Set();

        entries.forEach((entry, index) => {
          const currentNum = Number(entry.position_number);
          if (!isNaN(currentNum)) {
            const startGap = index === 0 ? 1 : prevNumber + 1;
            if (currentNum > startGap) {
              for (let missing = startGap; missing < currentNum; missing++) {
                const matchRejoined = allRejoined.find(r => !usedRejoinedIds.has(r.id) && Number(r.position_number) > missing);
                let explanationText = 'Ce patient a été marqué comme absent puis réintégré tout en bas de la liste.';
                if (matchRejoined) {
                  usedRejoinedIds.add(matchRejoined.id);
                  explanationText = `Ce patient a été marqué comme absent puis réintégré tout en bas de la liste (actuellement <strong>N° ${matchRejoined.position_number}</strong> — ${escapeHtml(matchRejoined.display_name)}).`;
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

          rowsHtml.push(`
            <tr>
              <td>${entry.position_number ?? '-'}</td>
              <td><strong>${escapeHtml(entry.display_name)}</strong></td>
              <td>${escapeHtml(formatPhoneForDisplay(entry.phone) || '-')}</td>
              <td>${renderStatus(entry.status)}</td>
              <td>${escapeHtml(entry.created_by_name || '-')}</td>
              <td>${escapeHtml(entry.updated_by_name || '-')}</td>
            </tr>
          `);
        });

        body.innerHTML = rowsHtml.join('');
      }

      empty.hidden = true;
      content.hidden = false;
    } catch (error) {
      console.error('Détail liste :', error);
      empty.hidden = false;
      empty.textContent = error.message;
      content.hidden = true;
    }
  }

  function clearQueueDetails() {
    queuesState.selectedId = null;
    const empty = document.getElementById('queue-detail-empty');
    const content = document.getElementById('queue-detail-content');
    const title = document.getElementById('queue-detail-title');

    if (title) title.textContent = 'Sélectionnez une journée';
    if (empty) {
      empty.hidden = false;
      empty.textContent = 'Cliquez sur une journée pour consulter son résumé et ses patients.';
    }
    if (content) content.hidden = true;
  }

  /* =======================================================
     PARAMÈTRES
     ======================================================= */

  function setSettingsSectionExpanded(section, button, expanded) {
    section.classList.toggle('is-collapsed', !expanded);
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');

    const label = button.querySelector('[data-section-toggle-label]');
    if (label) {
      label.textContent = expanded ? 'Réduire' : 'Afficher';
    }
  }

  function bindSettingsCollapsibleSections() {
    document
      .querySelectorAll('[data-settings-section-toggle]')
      .forEach(button => {
        if (button.dataset.sectionToggleBound === '1') return;

        const section = document.getElementById(
          button.dataset.settingsSectionToggle || ''
        );

        if (!section) return;

        button.dataset.sectionToggleBound = '1';
        setSettingsSectionExpanded(section, button, section.id === 'public-registration-section');

        button.addEventListener('click', () => {
          const expanded = button.getAttribute('aria-expanded') === 'true';
          setSettingsSectionExpanded(section, button, !expanded);
        });
      });
  }

  async function initSettingsPage() {
    const clinicForm = document.getElementById('clinic-settings-form');
    const doctorForm = document.getElementById('doctor-settings-form');
    const page = document.querySelector('.v1-settings-page');
    if (!page || page.dataset.markiInitialized === '1') return;

    page.dataset.markiInitialized = '1';
    const settingsGrid = page.querySelector('.v1-settings-grid');
    const qrSection = document.getElementById('public-registration-section');
    if (settingsGrid && qrSection) settingsGrid.before(qrSection);
    clinicForm?.addEventListener('submit', saveSettings);
    doctorForm?.addEventListener('submit', saveSettings);
    document.getElementById('clinic-settings-edit-button')?.addEventListener('click', () => openSettingsModal('clinic-settings-modal'));
    document.getElementById('doctor-settings-edit-button')?.addEventListener('click', () => openSettingsModal('doctor-settings-modal'));
    document.querySelectorAll('[data-close-settings-modal]').forEach(button => {
      button.addEventListener('click', closeSettingsModals);
    });
    document.querySelectorAll('.v1-settings-modal').forEach(modal => {
      modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeSettingsModals();
      });
    });
    bindSettingsEnhancements();
    bindSettingsCollapsibleSections();

    // Une seule sequence de chargement : Parametres, QR, puis Equipe.
    // Cela evite trois requetes d'initialisation concurrentes sur la session PHP.
    await loadSettings();

    if (document.getElementById('public-registration-section')) {
      await window.initMarkiPublicRegistration?.();
    }

    if (document.getElementById('team-settings-section')) {
      await window.initMarkiTeam?.();
    }
  }

  async function loadSettings() {
    const message = document.getElementById('settings-page-message');
    const buttons = document.querySelectorAll('#clinic-settings-save-button, #doctor-settings-save-button');

    setMessage(message, 'Chargement des paramètres…', 'info');
    buttons.forEach(button => { button.disabled = true; });

    try {
      const response = await requestJson(API.settings);
      fillSettingsForm(response.data?.clinic || {}, response.data?.doctor || {});
      applySettingsPermissions(response.data?.permissions || {});
      setMessage(message);
      return true;
    } catch (error) {
      console.error('Paramètres :', error);
      const detail = error.serverError ? ` Détail : ${error.serverError}` : '';
      const reference = error.errorId ? ` Référence : ${error.errorId}.` : '';
      setMessage(message, `${error.message}${detail}${reference}`, 'error');
      return false;
    } finally {
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  function fillSettingsForm(clinic, doctor) {
    setInputValue('settings-clinic-name', clinic.name);
    setInputValue('settings-clinic-type', clinic.type || 'solo');
    setInputValue('settings-clinic-phone', window.MarkiPhone
      ? window.MarkiPhone.formatAdaptivePhone(clinic.phone)
      : formatPhoneForDisplay(clinic.phone));
    setInputValue('settings-clinic-address', clinic.address);

    const wilayaSelect = document.getElementById('settings-clinic-wilaya');
    if (wilayaSelect) {
      wilayaSelect.dataset.initialValue = clinic.wilaya || '';
      window.MarkiAlgeriaLocations?.fillWilayas(wilayaSelect, clinic.wilaya || '');
    }
    setInputValue('settings-clinic-city', clinic.city);
    window.MarkiAlgeriaLocations?.bind(document);
    const cityInput = document.getElementById('settings-clinic-city');
    const cityList = document.getElementById('settings-clinic-city-options');
    window.MarkiAlgeriaLocations?.fillCommunes(wilayaSelect, cityInput, cityList);

    const timezone = clinic.timezone || 'Africa/Algiers';
    setInputValue('settings-clinic-timezone', timezone);
    updateTimezoneFlag(timezone);
    window.MarkiPhone?.bind(document);

    setInputValue('settings-doctor-name', doctor.display_name);
    setInputValue('settings-doctor-specialty', doctor.specialty);
    setInputValue('settings-doctor-license', doctor.license_number);
    setInputValue('settings-doctor-address', doctor.address);

    const clinicTypes = {
      solo: 'Cabinet individuel',
      clinic: 'Clinique',
      hospital_simple: 'Établissement médical'
    };
    const clinicAddress = [clinic.address, clinic.city].filter(Boolean).join(', ');
    setProfileText('settings-view-clinic-name', clinic.name, 'Structure sans nom');
    setProfileText('settings-view-clinic-type', clinicTypes[clinic.type] || 'Structure médicale', 'Structure médicale');
    setProfileText('settings-view-clinic-phone', window.MarkiPhone
      ? window.MarkiPhone.formatAdaptivePhone(clinic.phone)
      : formatPhoneForDisplay(clinic.phone), 'Non renseigné');
    setProfileText('settings-view-clinic-wilaya', clinic.wilaya, 'Non renseignée');
    setProfileText('settings-view-clinic-address', clinicAddress, 'Non renseignée');
    setProfileText('settings-view-clinic-timezone', timezone, 'Africa/Algiers');
    setProfileText('settings-view-doctor-name', doctor.display_name, 'Médecin');
    setProfileText('settings-view-doctor-specialty', doctor.specialty, 'Spécialité non renseignée');
    setProfileText('settings-view-doctor-license', doctor.license_number, 'Non renseigné');
    setProfileText('settings-view-doctor-address', doctor.address, 'Non renseignée');
  }

  function updateTimezoneFlag(timezone) {
    const flag = document.getElementById('settings-timezone-flag');
    if (!flag) return;
    const files = {
      'Africa/Algiers': 'dz.svg',
      'America/Toronto': 'ca.svg',
      'Europe/Paris': 'fr.svg',
      'Africa/Tunis': 'tn.svg',
      'America/New_York': 'us.svg'
    };
    flag.src = `assets/icons/flags/${files[timezone] || 'dz.svg'}`;
    const viewFlag = document.getElementById('settings-view-timezone-flag');
    if (viewFlag) viewFlag.src = flag.src;
  }

  function openSettingsModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('v1-profile-modal-open');
    requestAnimationFrame(() => modal.querySelector('input, select')?.focus());
  }

  function closeSettingsModals() {
    document.querySelectorAll('.v1-settings-modal').forEach(modal => {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
    });
    document.body.classList.remove('v1-profile-modal-open');
  }

  function bindSettingsEnhancements() {
    const timezone = document.getElementById('settings-clinic-timezone');
    timezone?.addEventListener('change', () => updateTimezoneFlag(timezone.value));
    window.MarkiPhone?.bind(document);
    window.MarkiAlgeriaLocations?.bind(document);
  }

  function applySettingsPermissions(permissions) {
    const canManageClinic = Boolean(permissions.can_manage_clinic);
    const canManageDoctor = Boolean(permissions.can_manage_doctor);
    const clinicCard = document.getElementById('clinic-settings-card');
    const doctorCard = document.getElementById('doctor-settings-card');
    const clinicEditButton = document.getElementById('clinic-settings-edit-button');
    const doctorEditButton = document.getElementById('doctor-settings-edit-button');

    clinicCard?.classList.toggle('is-readonly', !canManageClinic);
    doctorCard?.classList.toggle('is-readonly', !canManageDoctor);

    document.getElementById('clinic-settings-form')?.querySelectorAll('input, select, textarea, button[type="submit"]').forEach(field => {
      field.disabled = !canManageClinic;
    });

    document.getElementById('doctor-settings-form')?.querySelectorAll('input, select, textarea, button[type="submit"]').forEach(field => {
      field.disabled = !canManageDoctor;
    });
    if (clinicEditButton) clinicEditButton.hidden = !canManageClinic;
    if (doctorEditButton) doctorEditButton.hidden = !canManageDoctor;
  }

  async function saveSettings(event) {
    event.preventDefault();

    const message = document.getElementById('settings-page-message');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const payload = {
      ...Object.fromEntries(new FormData(document.getElementById('clinic-settings-form')).entries()),
      ...Object.fromEntries(new FormData(document.getElementById('doctor-settings-form')).entries())
    };

    setMessage(message);
    if (button) {
      button.disabled = true;
      button.textContent = 'Enregistrement…';
    }

    try {
      const response = await requestJson(API.settingsUpdate, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      fillSettingsForm(response.data?.clinic || {}, response.data?.doctor || {});
      applySettingsPermissions(response.data?.permissions || {});
      setMessage(message);
      closeSettingsModals();

      if (typeof window.showToast === 'function') {
        window.showToast(
          response.message || 'Paramètres enregistrés.',
          'success'
        );
      }
    } catch (error) {
      console.error('Enregistrement paramètres :', error);
      setMessage(message, error.message, 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Enregistrer les modifications';
      }
    }
  }

  /* =======================================================
     POINT D'ENTRÉE PUBLIC POUR app.js
     ======================================================= */

  window.initMarkiV1Page = function (page) {
    if (page === 'patients') {
      initPatientsPage();
      return;
    }

    if (page === 'lists') {
      initListsPage();
      return;
    }

    if (page === 'settings') {
      initSettingsPage();
    }
  };
})();
