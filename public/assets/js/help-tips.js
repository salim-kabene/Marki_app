/*
|--------------------------------------------------------------------------
| Bulles d'aide « ? »
|--------------------------------------------------------------------------
| Un bouton .mk-help porte son explication dans data-help (et un titre
| optionnel dans data-help-title). Un appui ouvre une petite bulle avec
| une croix ; un appui ailleurs, Échap ou la croix la referme.
| Délégation sur le document : fonctionne aussi pour les pages chargées
| dynamiquement dans #main-content.
|--------------------------------------------------------------------------
*/
(function () {
  'use strict';

  const GAP = 8;
  const EDGE = 12;

  let popover = null;
  let currentButton = null;

  function positionPopover() {
    if (!popover || !currentButton) return;

    const anchor = currentButton.getBoundingClientRect();

    // Le bouton est sorti de l'écran (défilement) : on ferme.
    if (anchor.bottom < 0 || anchor.top > window.innerHeight) {
      closeHelp(false);
      return;
    }

    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const left = Math.min(
      Math.max(anchor.left + anchor.width / 2 - width / 2, EDGE),
      window.innerWidth - width - EDGE
    );

    let top = anchor.bottom + GAP;
    if (top + height > window.innerHeight - EDGE) {
      top = Math.max(anchor.top - height - GAP, EDGE);
    }

    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  }

  function closeHelp(restoreFocus) {
    if (!popover) return;

    popover.remove();
    popover = null;

    if (currentButton) {
      currentButton.setAttribute('aria-expanded', 'false');
      if (restoreFocus) currentButton.focus();
    }
    currentButton = null;
  }

  function openHelp(button) {
    closeHelp(false);

    currentButton = button;
    popover = document.createElement('div');
    popover.className = 'mk-help-pop';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', button.dataset.helpTitle || 'Aide');

    const head = document.createElement('div');
    head.className = 'mk-help-pop__head';

    const title = document.createElement('strong');
    title.textContent = button.dataset.helpTitle || 'Aide';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'mk-help-pop__close';
    close.setAttribute('aria-label', 'Fermer l’aide');
    close.innerHTML = '<svg class="mk-icon mk-icon--sm" aria-hidden="true"><use href="#mk-close"></use></svg>';

    const text = document.createElement('p');
    text.textContent = button.dataset.help || '';

    head.append(title, close);
    popover.append(head, text);
    document.body.appendChild(popover);

    button.setAttribute('aria-expanded', 'true');
    positionPopover();
    close.focus({ preventScroll: true });
  }

  document.addEventListener('click', event => {
    const helpButton = event.target.closest('.mk-help');

    if (helpButton) {
      // Évite d'activer un <label>, un <summary> ou une ligne cliquable parente.
      event.preventDefault();
      event.stopPropagation();

      if (helpButton === currentButton) {
        closeHelp(true);
      } else {
        openHelp(helpButton);
      }
      return;
    }

    if (!popover) return;

    if (event.target.closest('.mk-help-pop__close')) {
      closeHelp(true);
      return;
    }

    if (!event.target.closest('.mk-help-pop')) {
      closeHelp(false);
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && popover) {
      event.stopPropagation();
      closeHelp(true);
    }
  }, true);

  window.addEventListener('resize', positionPopover);
  document.addEventListener('scroll', positionPopover, true);
})();
