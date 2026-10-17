(function () {
  'use strict';

  function updateClock() {
    const header = document.querySelector('.header[data-timezone]');
    if (!header) return;

    const timezone = header.dataset.timezone || 'Africa/Algiers';
    const now = new Date();
    const dateElement = document.getElementById('header-current-date');
    const timeElement = document.getElementById('header-current-time');

    if (dateElement) {
      dateElement.textContent = new Intl.DateTimeFormat('fr-DZ', {
        timeZone: timezone,
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      }).format(now);
    }

    if (timeElement) {
      timeElement.textContent = new Intl.DateTimeFormat('fr-DZ', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(now);
    }
  }

  async function changeDoctor(event) {
    const select = event.currentTarget;
    const doctorId = Number(select.value);
    if (doctorId <= 0) return;

    select.disabled = true;

    try {
      const response = await fetch('api/auth_select_doctor.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctor_id: doctorId })
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || 'Impossible de changer de médecin.');
      }

      location.reload();
    } catch (error) {
      const message = error.message || 'Impossible de changer de médecin.';

      if (typeof window.showToast === 'function') {
        window.showToast(message, 'error');
      } else {
        console.error(message);
      }

      select.disabled = false;
    }
  }

  function initSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    if (!sidebar || !toggleBtn) return;

    const STORAGE_KEY = 'marki_sidebar_collapsed';
    const isCollapsed = localStorage.getItem(STORAGE_KEY) === 'true';

    function setCollapsed(collapsed) {
      if (collapsed) {
        document.body.classList.add('is-sidebar-collapsed');
        sidebar.classList.add('is-collapsed');
        toggleBtn.setAttribute('title', 'Agrandir le menu');
        toggleBtn.setAttribute('aria-label', 'Agrandir le menu');
        const textSpan = toggleBtn.querySelector('.sidebar__toggle-text');
        if (textSpan) textSpan.textContent = 'Agrandir le menu';
      } else {
        document.body.classList.remove('is-sidebar-collapsed');
        sidebar.classList.remove('is-collapsed');
        toggleBtn.setAttribute('title', 'Réduire le menu');
        toggleBtn.setAttribute('aria-label', 'Réduire le menu');
        const textSpan = toggleBtn.querySelector('.sidebar__toggle-text');
        if (textSpan) textSpan.textContent = 'Réduire le menu';
      }
      try {
        localStorage.setItem(STORAGE_KEY, collapsed ? 'true' : 'false');
      } catch (e) {}
    }

    if (isCollapsed) {
      setCollapsed(true);
    }

    toggleBtn.addEventListener('click', () => {
      const currentlyCollapsed = sidebar.classList.contains('is-collapsed') || document.body.classList.contains('is-sidebar-collapsed');
      setCollapsed(!currentlyCollapsed);
    });
  }

  function initGlobalTooltips() {
    let tooltipEl = document.getElementById('mk-floating-tooltip');
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'mk-floating-tooltip';
      tooltipEl.className = 'mk-floating-tooltip';
      tooltipEl.setAttribute('role', 'tooltip');
      document.body.appendChild(tooltipEl);
    }

    let activeTarget = null;
    let showTimer = null;

    function getTargetTooltipText(target) {
      if (!target || target.nodeType !== Node.ELEMENT_NODE) return null;
      const el = target.closest('[data-tooltip], .mk-tooltip, [title]');
      if (!el) return null;

      if (el.hasAttribute('title') && !el.getAttribute('data-tooltip')) {
        const titleText = el.getAttribute('title');
        if (titleText) {
          el.setAttribute('data-tooltip', titleText);
        }
        el.removeAttribute('title');
      }

      return {
        element: el,
        text: el.getAttribute('data-tooltip')
      };
    }

    function hideTooltip() {
      clearTimeout(showTimer);
      activeTarget = null;
      tooltipEl.classList.remove('is-visible');
    }

    function positionTooltip(element, text) {
      if (!element || !text) {
        hideTooltip();
        return;
      }

      tooltipEl.textContent = text;
      tooltipEl.className = 'mk-floating-tooltip';

      const rect = element.getBoundingClientRect();
      const tooltipRect = tooltipEl.getBoundingClientRect();

      let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
      const padding = 10;
      left = Math.max(padding, Math.min(window.innerWidth - tooltipRect.width - padding, left));

      const spaceAbove = rect.top;
      let top;
      if (spaceAbove >= tooltipRect.height + 10) {
        top = rect.top - tooltipRect.height - 8;
        tooltipEl.classList.add('is-top');
      } else {
        top = rect.bottom + 8;
        tooltipEl.classList.add('is-bottom');
      }

      tooltipEl.style.left = `${Math.round(left)}px`;
      tooltipEl.style.top = `${Math.round(top)}px`;
      tooltipEl.classList.add('is-visible');
    }

    document.addEventListener('mouseover', event => {
      const info = getTargetTooltipText(event.target);
      if (!info || !info.text) {
        hideTooltip();
        return;
      }

      if (activeTarget === info.element) return;
      activeTarget = info.element;

      clearTimeout(showTimer);
      showTimer = setTimeout(() => {
        if (activeTarget === info.element && document.body.contains(info.element)) {
          positionTooltip(info.element, info.text);
        }
      }, 40);
    }, { passive: true });

    document.addEventListener('mouseout', event => {
      if (activeTarget && !activeTarget.contains(event.relatedTarget)) {
        hideTooltip();
      }
    }, { passive: true });

    document.addEventListener('click', hideTooltip, { passive: true });
    window.addEventListener('scroll', hideTooltip, { passive: true });
  }

  /*
  |--------------------------------------------------------------------------
  | Menu « changer de médecin »
  |--------------------------------------------------------------------------
  | Le select reste la source de vérité (et garde son évènement change).
  | Un menu aux couleurs de MARKI le remplace visuellement : initiales,
  | nom, spécialité et coche sur le médecin affiché.
  |--------------------------------------------------------------------------
  */
  function escapeMenuText(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  }

  function doctorInitials(name) {
    const parts = String(name || '')
      .trim()
      .replace(/^dr\.?\s+/i, '')
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '—';
    return `${parts[0][0] || ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
  }

  function initDoctorMenu() {
    const select = document.getElementById('header-doctor-select');
    const profile = select?.closest('.profile-info');
    if (!select || !profile) return;

    profile.classList.add('has-doctor-menu');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'doctor-menu__trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Changer de médecin');
    profile.appendChild(trigger);

    const menu = document.createElement('div');
    menu.className = 'doctor-menu';
    menu.hidden = true;
    menu.innerHTML = `
      <p class="doctor-menu__title">Afficher la liste de</p>
      <ul class="doctor-menu__list" role="listbox" aria-label="Médecins"></ul>
    `;
    document.body.appendChild(menu);
    const list = menu.querySelector('.doctor-menu__list');

    const render = () => {
      list.innerHTML = [...select.options].map(option => {
        const isCurrent = option.value === select.value;
        return `
          <li>
            <button
              type="button"
              class="doctor-menu__option${isCurrent ? ' is-current' : ''}"
              role="option"
              aria-selected="${isCurrent ? 'true' : 'false'}"
              data-doctor-id="${escapeMenuText(option.value)}"
            >
              <span class="doctor-menu__avatar" aria-hidden="true">${escapeMenuText(doctorInitials(option.textContent))}</span>
              <span class="doctor-menu__text">
                <strong>${escapeMenuText(option.textContent.trim())}</strong>
                <small>${escapeMenuText(option.dataset.specialty || 'Médecin')}</small>
              </span>
              <svg class="mk-icon mk-icon--sm doctor-menu__check" aria-hidden="true"><use href="#mk-check"></use></svg>
            </button>
          </li>
        `;
      }).join('');
    };

    const place = () => {
      const box = profile.getBoundingClientRect();
      const width = Math.min(288, window.innerWidth - 16);
      menu.style.width = `${width}px`;
      menu.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - width - 8))}px`;
      menu.style.top = `${Math.round(box.bottom + 6)}px`;
    };

    const close = ({ focusTrigger = false } = {}) => {
      if (menu.hidden) return;
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      profile.classList.remove('is-menu-open');
      if (focusTrigger) trigger.focus();
    };

    const open = () => {
      render();
      menu.hidden = false;
      place();
      trigger.setAttribute('aria-expanded', 'true');
      profile.classList.add('is-menu-open');
      menu.classList.remove('is-entering');
      void menu.offsetWidth;
      menu.classList.add('is-entering');
      (list.querySelector('.is-current') || list.querySelector('button'))?.focus();
    };

    trigger.addEventListener('click', () => (menu.hidden ? open() : close()));

    list.addEventListener('click', event => {
      const option = event.target.closest('[data-doctor-id]');
      if (!option) return;

      if (option.dataset.doctorId === select.value) {
        close({ focusTrigger: true });
        return;
      }

      // Le changement passe par le select : même chemin qu'avant.
      option.classList.add('is-loading');
      list.querySelectorAll('button').forEach(button => { button.disabled = true; });
      select.value = option.dataset.doctorId;
      select.dispatchEvent(new Event('change'));
    });

    // Si le changement échoue, le select est réactivé : le menu aussi.
    new MutationObserver(() => {
      if (!select.disabled && !menu.hidden) render();
    }).observe(select, { attributes: true, attributeFilter: ['disabled'] });

    menu.addEventListener('keydown', event => {
      const buttons = [...list.querySelectorAll('button:not(:disabled)')];
      const index = buttons.indexOf(document.activeElement);

      if (event.key === 'Escape') {
        event.preventDefault();
        close({ focusTrigger: true });
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        buttons[(index + step + buttons.length) % buttons.length]?.focus();
      } else if (event.key === 'Tab') {
        close();
      }
    });

    document.addEventListener('pointerdown', event => {
      if (menu.hidden || menu.contains(event.target) || trigger.contains(event.target)) return;
      close();
    });

    window.addEventListener('resize', () => { if (!menu.hidden) place(); });
    window.addEventListener('scroll', () => { if (!menu.hidden) place(); }, { passive: true });
  }

  /* Menu du compte : se referme au clic ailleurs ou avec Échap. */
  function initAccountMenu() {
    const menu = document.querySelector('.account-menu');
    if (!menu) return;

    document.addEventListener('pointerdown', event => {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });

    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.open) {
        menu.open = false;
        menu.querySelector('summary')?.focus();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    window.setInterval(updateClock, 1000);
    document
      .getElementById('header-doctor-select')
      ?.addEventListener('change', changeDoctor);
    initDoctorMenu();
    initAccountMenu();

    document.querySelectorAll('.sidebar__item[role="button"]').forEach(item => {
      item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          item.click();
        }
      });
    });

    initSidebar();
    initGlobalTooltips();
  });
})();
