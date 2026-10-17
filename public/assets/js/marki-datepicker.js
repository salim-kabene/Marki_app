/* =========================================================
   MARKI — Sélecteur de date
   Remplace le calendrier par défaut du navigateur par un
   calendrier aux couleurs de MARKI, partout dans l'application.

   Deux sortes de champs sont pris en charge automatiquement :
   - input[type="date"] (valeur AAAA-MM-JJ) : le champ natif est
     masqué et un bouton affiche la date en français ;
   - champs texte « JJ/MM/AAAA » (dates de naissance) : la saisie
     au clavier reste possible, une icône ouvre le calendrier.

   Le code des formulaires ne change pas : la valeur du champ
   garde son format d'origine et les évènements input/change
   sont émis comme lors d'une saisie.
   ========================================================= */
(function () {
  'use strict';

  if (window.MarkiDatePicker) return;

  const MONTHS = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ];
  const MONTHS_SHORT = [
    'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'
  ];
  const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const FR_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
  const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

  /* ---------- Dates (toujours à midi pour éviter les décalages d'heure) ---------- */
  function makeDate(year, month, day) {
    return new Date(year, month, day, 12);
  }

  function today() {
    const now = new Date();
    return makeDate(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function sameDay(a, b) {
    return Boolean(a && b)
      && a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function toIso(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function toFr(date) {
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  }

  function parse(value, mode) {
    const text = String(value || '').trim();
    const match = mode === 'fr' ? text.match(FR_PATTERN) : text.match(ISO_PATTERN);
    if (!match) return null;

    const [year, month, day] = mode === 'fr'
      ? [Number(match[3]), Number(match[2]) - 1, Number(match[1])]
      : [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
    const date = makeDate(year, month, day);

    return date.getMonth() === month ? date : null;
  }

  function formatLong(date) {
    return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
  }

  /* ---------- Champs ---------- */
  const fields = new WeakMap();

  function readValue(input) {
    return valueDescriptor.get.call(input);
  }

  function getBounds(field) {
    const { input, mode } = field;
    let min = parse(input.min, 'iso');
    let max = parse(input.max, 'iso');

    // Date de naissance : jamais dans le futur.
    if (mode === 'fr' && !max) max = today();

    // Période : la fin ne précède jamais le début (et inversement).
    if (field.rangeStart) {
      const start = parse(readValue(field.rangeStart), 'iso');
      if (start && (!min || start > min)) min = start;
    }
    if (field.rangeEnd) {
      const end = parse(readValue(field.rangeEnd), 'iso');
      if (end && (!max || end < max)) max = end;
    }

    return { min, max };
  }

  function refreshTrigger(field) {
    if (!field.label) return;
    const date = parse(readValue(field.input), 'iso');
    field.label.textContent = date ? formatLong(date) : (field.input.dataset.placeholder || 'Choisir une date');
    field.trigger.classList.toggle('is-empty', !date);
  }

  function setValue(field, date) {
    const { input, mode } = field;
    valueDescriptor.set.call(input, date ? (mode === 'fr' ? toFr(date) : toIso(date)) : '');
    refreshTrigger(field);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Une valeur posée par le code (filtres réinitialisés…) met le bouton à jour.
  function watchProgrammaticValue(field) {
    Object.defineProperty(field.input, 'value', {
      configurable: true,
      get() {
        return valueDescriptor.get.call(this);
      },
      set(next) {
        valueDescriptor.set.call(this, next);
        refreshTrigger(field);
      }
    });
  }

  function linkRange(field) {
    const range = field.input.closest('.v1-date-range, [data-date-range]');
    if (!range) return;

    const inputs = [...range.querySelectorAll('input[type="date"], input[data-mk-date]')];
    const index = inputs.indexOf(field.input);
    if (index === 1) field.rangeStart = inputs[0];
    if (index === 0 && inputs[1]) field.rangeEnd = inputs[1];
  }

  function enhanceIso(input) {
    const field = { input, mode: 'iso' };

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'mk-dp-trigger';
    trigger.setAttribute('aria-haspopup', 'dialog');
    const ariaLabel = input.getAttribute('aria-label')
      || input.closest('label')?.querySelector('.v1-sr-only')?.textContent
      || 'Date';
    trigger.setAttribute('aria-label', `${ariaLabel.trim()} : choisir une date`);
    trigger.innerHTML = `
      <svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#mk-calendar"></use></svg>
      <span class="mk-dp-trigger__label"></span>
    `;

    input.classList.add('mk-dp-native');
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    input.after(trigger);

    field.trigger = trigger;
    field.label = trigger.querySelector('.mk-dp-trigger__label');
    trigger.addEventListener('click', () => open(field));

    linkRange(field);
    watchProgrammaticValue(field);
    refreshTrigger(field);

    return field;
  }

  function enhanceFr(input) {
    const field = { input, mode: 'fr' };

    // Le champ et son icône partagent un conteneur positionné.
    let wrapper = input.parentElement;
    if (!wrapper.classList.contains('mk-dp-wrap')) {
      wrapper = document.createElement('span');
      wrapper.className = 'mk-dp-wrap';
      input.before(wrapper);
      wrapper.appendChild(input);
    }

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'mk-dp-icon-button';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-label', 'Ouvrir le calendrier');
    trigger.innerHTML = '<svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#mk-calendar"></use></svg>';
    wrapper.appendChild(trigger);

    // La page d'inscription publique affichait déjà une icône décorative.
    wrapper.parentElement?.querySelector(':scope > .public-input-icon')?.setAttribute('hidden', '');

    field.trigger = trigger;
    trigger.addEventListener('click', () => open(field));

    return field;
  }

  function enhance(input) {
    if (fields.has(input) || input.dataset.mkDate === 'off') return;

    const field = input.type === 'date' ? enhanceIso(input) : enhanceFr(input);
    fields.set(input, field);
  }

  function scan(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('input[type="date"], input[placeholder="JJ/MM/AAAA"], input[data-mk-date="fr"]')
      .forEach(enhance);
  }

  /* ---------- Calendrier ---------- */
  let popover = null;
  let backdrop = null;
  let current = null; // { field, view: Date, focus: Date }

  function isSheet() {
    return window.matchMedia('(max-width: 600px)').matches;
  }

  function buildPopover() {
    backdrop = document.createElement('div');
    backdrop.className = 'mk-dp-backdrop';
    backdrop.hidden = true;
    backdrop.addEventListener('click', close);

    popover = document.createElement('div');
    popover.className = 'mk-dp';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-modal', 'false');
    popover.setAttribute('aria-label', 'Choisir une date');
    popover.hidden = true;
    popover.innerHTML = `
      <div class="mk-dp__header">
        <button type="button" class="mk-dp__nav" data-dp-step="-1" aria-label="Mois précédent">
          <svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#mk-chevron-left"></use></svg>
        </button>
        <div class="mk-dp__title">
          <label class="mk-dp__select">
            <span class="mk-dp__sr">Mois</span>
            <select data-dp-month>${MONTHS.map((name, index) => `<option value="${index}">${name}</option>`).join('')}</select>
          </label>
          <label class="mk-dp__select">
            <span class="mk-dp__sr">Année</span>
            <select data-dp-year></select>
          </label>
        </div>
        <button type="button" class="mk-dp__nav" data-dp-step="1" aria-label="Mois suivant">
          <svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#mk-chevron-right"></use></svg>
        </button>
      </div>
      <div class="mk-dp__weekdays" aria-hidden="true">${WEEKDAYS.map(day => `<span>${day}</span>`).join('')}</div>
      <div class="mk-dp__grid" role="grid"></div>
      <div class="mk-dp__footer">
        <button type="button" class="mk-dp__link" data-dp-clear>Effacer</button>
        <button type="button" class="mk-dp__today" data-dp-today>Aujourd’hui</button>
      </div>
    `;

    popover.addEventListener('click', onPopoverClick);
    popover.addEventListener('keydown', onPopoverKeydown);
    popover.querySelector('[data-dp-month]').addEventListener('change', event => {
      moveView(makeDate(current.view.getFullYear(), Number(event.target.value), 1));
    });
    popover.querySelector('[data-dp-year]').addEventListener('change', event => {
      moveView(makeDate(Number(event.target.value), current.view.getMonth(), 1));
    });

    document.body.append(backdrop, popover);
  }

  function moveView(view) {
    current.view = view;
    const lastDay = makeDate(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    current.focus = makeDate(view.getFullYear(), view.getMonth(), Math.min(current.focus.getDate(), lastDay));
    render();
  }

  function yearRange(bounds) {
    const now = today().getFullYear();
    const from = bounds.min ? bounds.min.getFullYear() : now - 110;
    const to = bounds.max ? bounds.max.getFullYear() : now + 5;
    return [Math.min(from, current.view.getFullYear()), Math.max(to, current.view.getFullYear())];
  }

  function render(focusGrid = false) {
    const { field, view } = current;
    const bounds = getBounds(field);
    const selected = parse(readValue(field.input), field.mode);
    const rangeOther = field.rangeStart
      ? parse(readValue(field.rangeStart), 'iso')
      : (field.rangeEnd ? parse(readValue(field.rangeEnd), 'iso') : null);
    const rangeFrom = field.rangeStart ? rangeOther : selected;
    const rangeTo = field.rangeStart ? selected : rangeOther;
    const now = today();

    // En-tête : mois et année choisis directement dans les listes.
    const monthSelect = popover.querySelector('[data-dp-month]');
    const yearSelect = popover.querySelector('[data-dp-year]');
    const [firstYear, lastYear] = yearRange(bounds);
    let years = '';
    for (let year = lastYear; year >= firstYear; year--) {
      years += `<option value="${year}">${year}</option>`;
    }
    yearSelect.innerHTML = years;
    monthSelect.value = String(view.getMonth());
    yearSelect.value = String(view.getFullYear());

    const firstOfMonth = makeDate(view.getFullYear(), view.getMonth(), 1);
    const startOffset = (firstOfMonth.getDay() + 6) % 7; // lundi en premier
    const start = makeDate(view.getFullYear(), view.getMonth(), 1 - startOffset);

    const prevDisabled = bounds.min && makeDate(view.getFullYear(), view.getMonth(), 0) < bounds.min;
    const nextDisabled = bounds.max && makeDate(view.getFullYear(), view.getMonth() + 1, 1) > bounds.max;
    popover.querySelector('[data-dp-step="-1"]').disabled = Boolean(prevDisabled);
    popover.querySelector('[data-dp-step="1"]').disabled = Boolean(nextDisabled);

    let html = '';
    for (let week = 0; week < 6; week++) {
      html += '<div class="mk-dp__row" role="row">';
      for (let weekday = 0; weekday < 7; weekday++) {
        const date = makeDate(start.getFullYear(), start.getMonth(), start.getDate() + week * 7 + weekday);
        const outside = date.getMonth() !== view.getMonth();
        const disabled = (bounds.min && date < bounds.min) || (bounds.max && date > bounds.max);
        const inRange = rangeFrom && rangeTo && date > rangeFrom && date < rangeTo;
        const isEdge = (rangeFrom && sameDay(date, rangeFrom)) || (rangeTo && sameDay(date, rangeTo));
        const classes = [
          'mk-dp__day',
          outside ? 'is-outside' : '',
          sameDay(date, now) ? 'is-today' : '',
          sameDay(date, selected) ? 'is-selected' : '',
          inRange ? 'is-in-range' : '',
          isEdge && !sameDay(date, selected) ? 'is-range-edge' : ''
        ].filter(Boolean).join(' ');

        html += `
          <button
            type="button"
            role="gridcell"
            class="${classes}"
            data-dp-date="${toIso(date)}"
            tabindex="${sameDay(date, current.focus) ? '0' : '-1'}"
            aria-selected="${sameDay(date, selected) ? 'true' : 'false'}"
            aria-label="${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}"
            ${disabled ? 'disabled' : ''}
          >${date.getDate()}</button>
        `;
      }
      html += '</div>';
    }

    popover.querySelector('.mk-dp__grid').innerHTML = html;
    popover.querySelector('[data-dp-today]').disabled = Boolean(
      (bounds.min && now < bounds.min) || (bounds.max && now > bounds.max)
    );

    if (focusGrid) {
      popover.querySelector('.mk-dp__day[tabindex="0"]')?.focus();
    }
  }

  function position() {
    if (!current) return;

    if (isSheet()) {
      popover.classList.add('is-sheet');
      popover.style.top = '';
      popover.style.left = '';
      return;
    }

    popover.classList.remove('is-sheet');
    const anchor = (current.field.trigger.classList.contains('mk-dp-icon-button')
      ? current.field.input
      : current.field.trigger).getBoundingClientRect();
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const margin = 8;

    let left = Math.min(anchor.left, window.innerWidth - width - margin);
    left = Math.max(margin, left);

    let top = anchor.bottom + 6;
    const fitsBelow = top + height <= window.innerHeight - margin;
    if (!fitsBelow && anchor.top - height - 6 >= margin) {
      top = anchor.top - height - 6;
      popover.classList.add('is-above');
    } else {
      popover.classList.remove('is-above');
    }

    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(Math.max(margin, top))}px`;
  }

  function open(field) {
    if (!popover) buildPopover();
    if (current?.field === field) {
      close();
      return;
    }

    const selected = parse(readValue(field.input), field.mode);
    const bounds = getBounds(field);
    let base = selected || today();
    // Date de naissance vide : on commence une trentaine d'années plus tôt.
    if (!selected && field.mode === 'fr') base = makeDate(today().getFullYear() - 30, 0, 1);
    if (bounds.max && base > bounds.max) base = bounds.max;
    if (bounds.min && base < bounds.min) base = bounds.min;

    current = {
      field,
      view: makeDate(base.getFullYear(), base.getMonth(), 1),
      focus: base
    };

    field.trigger.classList.add('is-open');
    field.trigger.setAttribute('aria-expanded', 'true');
    popover.hidden = false;
    backdrop.hidden = !isSheet();
    render();
    position();
    popover.classList.remove('is-entering');
    void popover.offsetWidth;
    popover.classList.add('is-entering');

    requestAnimationFrame(() => {
      popover.querySelector('.mk-dp__day[tabindex="0"]')?.focus({ preventScroll: true });
    });
  }

  function close({ restoreFocus = true } = {}) {
    if (!current) return;
    const { field } = current;
    field.trigger.classList.remove('is-open');
    field.trigger.setAttribute('aria-expanded', 'false');
    popover.hidden = true;
    backdrop.hidden = true;
    current = null;
    if (restoreFocus) field.trigger.focus({ preventScroll: true });
  }

  function choose(date) {
    const { field } = current;
    setValue(field, date);
    close();
  }

  function onPopoverClick(event) {
    const day = event.target.closest('[data-dp-date]');
    if (day && !day.disabled) {
      choose(parse(day.dataset.dpDate, 'iso'));
      return;
    }

    const step = event.target.closest('[data-dp-step]');
    if (step && !step.disabled) {
      const delta = Number(step.dataset.dpStep);
      moveView(makeDate(current.view.getFullYear(), current.view.getMonth() + delta, 1));
      return;
    }

    if (event.target.closest('[data-dp-today]')) {
      choose(today());
      return;
    }

    if (event.target.closest('[data-dp-clear]')) {
      setValue(current.field, null);
      close();
    }
  }

  function onPopoverKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (!event.target.closest('.mk-dp__grid')) return;

    const moves = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7
    };

    if (event.key in moves || event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      const focus = current.focus;
      const next = event.key === 'PageUp'
        ? makeDate(focus.getFullYear(), focus.getMonth() - 1, focus.getDate())
        : event.key === 'PageDown'
          ? makeDate(focus.getFullYear(), focus.getMonth() + 1, focus.getDate())
          : makeDate(focus.getFullYear(), focus.getMonth(), focus.getDate() + moves[event.key]);
      current.focus = next;
      current.view = makeDate(next.getFullYear(), next.getMonth(), 1);
      render(true);
    }
  }

  /* ---------- Fermeture et repositionnement ---------- */
  document.addEventListener('pointerdown', event => {
    if (!current || isSheet()) return;
    if (popover.contains(event.target) || current.field.trigger.contains(event.target)) return;
    close({ restoreFocus: false });
  }, true);

  window.addEventListener('resize', () => {
    if (!current) return;
    backdrop.hidden = !isSheet();
    position();
  });

  document.addEventListener('scroll', event => {
    if (!current || isSheet()) return;
    if (popover.contains(event.target)) return;
    position();
  }, true);

  /* ---------- Démarrage : champs présents et pages chargées ensuite ---------- */
  function start() {
    scan(document);
    new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.matches?.('input')) {
            if (node.matches('input[type="date"], input[placeholder="JJ/MM/AAAA"], input[data-mk-date="fr"]')) enhance(node);
          } else {
            scan(node);
          }
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.MarkiDatePicker = { scan, close };
})();
