(function () {
  'use strict';

  const API = {
    get: 'api/public_registration_get.php',
    save: 'api/public_registration_save.php',
    toggle: 'api/public_registration_toggle.php',
    revoke: 'api/public_registration_revoke.php'
  };

  const state = {
    initializedForDoctor: null,
    loading: false,
    data: null,
    confirmAction: null,
    qrInstance: null
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function setMessage(message = '', type = '') {
    const element = byId('qr-admin-message');
    if (!element) return;

    element.textContent = message;
    element.className = 'v1-message';
    if (message && type) {
      element.classList.add(`is-${type}`);
    }
  }

  function notify(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }

    setMessage(message, type);
  }

  async function readJson(response) {
    const raw = await response.text();

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error('[MARKI QR] Réponse non JSON :', raw);
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
        const error = new Error(
          data?.message || 'Une erreur est survenue.'
        );
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

      if (!retryable) throw error;

      await new Promise(resolve => window.setTimeout(resolve, 300));
      return requestJson(url, options, retries - 1);
    }
  }

  const MONTHS_FR = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ];

  function formatDateTime(value) {
    if (!value) return '—';

    const match = String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/
    );

    if (!match) return String(value);

    const day = parseInt(match[3], 10);
    const monthIndex = parseInt(match[2], 10) - 1;
    const year = match[1];
    const monthName = MONTHS_FR[monthIndex] || match[2];

    return `${day} ${monthName} ${year} à ${match[4]}:${match[5]}`;
  }

  function clearFieldErrors() {
    document.querySelectorAll('[data-qr-error]').forEach(element => {
      element.textContent = '';
    });

    document.querySelectorAll('#qr-settings-form .v1-field.is-invalid')
      .forEach(element => element.classList.remove('is-invalid'));
  }

  function showFieldErrors(errors = {}) {
    Object.entries(errors).forEach(([key, value]) => {
      const errorElement = document.querySelector(
        `[data-qr-error="${CSS.escape(key)}"]`
      );
      if (errorElement) {
        errorElement.textContent = String(value || '');
      }

      const field = document.querySelector(
        `#qr-settings-form [name="${CSS.escape(key)}"]`
      );
      field?.closest('.v1-field')?.classList.add('is-invalid');
    });
  }

  function renderStatus(active) {
    const badge = byId('qr-admin-status');
    const button = byId('qr-toggle-button');

    if (badge) {
      badge.textContent = active ? 'QR actif' : 'QR désactivé';
      badge.className = `qr-admin-status ${active ? 'is-active' : 'is-inactive'}`;
    }

    if (button) {
      button.textContent = active
        ? 'Désactiver temporairement'
        : 'Activer le QR';
      button.classList.toggle('v1-button--primary', !active);
      button.classList.toggle('v1-button--danger-outline', active);
      button.dataset.active = active ? '1' : '0';
    }
  }

  function drawRoundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function createStyledGradientQrCanvas(url, targetSize = 640) {
    if (!url || typeof window.QRCode !== 'function') return null;

    const tempDiv = document.createElement('div');
    tempDiv.style.display = 'none';
    document.body.appendChild(tempDiv);

    let qrModel = null;
    try {
      const qr = new window.QRCode(tempDiv, {
        text: url,
        width: 256,
        height: 256,
        correctLevel: window.QRCode.CorrectLevel.H
      });
      qrModel = qr._oQRCode;
    } catch (_) {}

    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      tempDiv.remove();
      return null;
    }

    // Fond blanc pur
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetSize, targetSize);

    // Extraction de la matrice
    let moduleCount = 0;
    let isDarkModule = null;

    if (qrModel && typeof qrModel.getModuleCount === 'function') {
      moduleCount = qrModel.getModuleCount();
      isDarkModule = (r, c) => qrModel.isDark(r, c);
    } else {
      const rawCanvas = tempDiv.querySelector('canvas');
      if (rawCanvas) {
        const rawCtx = rawCanvas.getContext('2d');
        const rawSize = rawCanvas.width;
        const imgData = rawCtx.getImageData(0, 0, rawSize, rawSize);
        const data = imgData.data;

        let startX = 0, startY = 0;
        for (let y = 0; y < rawSize; y++) {
          for (let x = 0; x < rawSize; x++) {
            const idx = (y * rawSize + x) * 4;
            if (data[idx] < 120 && data[idx + 3] > 100) {
              startX = x;
              startY = y;
              break;
            }
          }
          if (startY > 0 || startX > 0) break;
        }

        let finderW = 0;
        for (let x = startX; x < rawSize; x++) {
          const idx = (startY * rawSize + x) * 4;
          if (data[idx] < 120 && data[idx + 3] > 100) finderW++;
          else break;
        }

        const modPx = finderW / 7 || 1;
        let endX = rawSize - 1;
        for (let x = rawSize - 1; x >= 0; x--) {
          let found = false;
          for (let y = 0; y < rawSize; y++) {
            const idx = (y * rawSize + x) * 4;
            if (data[idx] < 120 && data[idx + 3] > 100) {
              endX = x;
              found = true;
              break;
            }
          }
          if (found) break;
        }
        moduleCount = Math.round((endX - startX + 1) / modPx);
        isDarkModule = (r, c) => {
          const sx = Math.round(startX + (c + 0.5) * modPx);
          const sy = Math.round(startY + (r + 0.5) * modPx);
          const idx = (sy * rawSize + sx) * 4;
          return idx < data.length && data[idx] < 120 && data[idx + 3] > 100;
        };
      }
    }

    tempDiv.remove();

    if (!moduleCount || !isDarkModule) return null;

    const quietZone = 3.5;
    const totalUnits = moduleCount + quietZone * 2;
    const unitSize = targetSize / totalUnits;
    const offset = quietZone * unitSize;

    // Dégradé luxueux pour les modules (Indigo foncé -> Violet signature -> Cyan médical)
    const moduleGradient = ctx.createLinearGradient(0, 0, targetSize, targetSize);
    moduleGradient.addColorStop(0, '#2e1065');
    moduleGradient.addColorStop(0.35, '#4f46e5');
    moduleGradient.addColorStop(0.7, '#7c3aed');
    moduleGradient.addColorStop(1, '#0891b2');

    // Zone centrale pour le logo MARKI
    const midModule = (moduleCount - 1) / 2;
    const logoModuleRadius = Math.max(3, Math.floor(moduleCount * 0.13));

    const isFinder = (r, c) => {
      if (r < 7 && c < 7) return true;
      if (r < 7 && c >= moduleCount - 7) return true;
      if (r >= moduleCount - 7 && c < 7) return true;
      return false;
    };

    const isCenterLogo = (r, c) => {
      return (
        r >= midModule - logoModuleRadius &&
        r <= midModule + logoModuleRadius &&
        c >= midModule - logoModuleRadius &&
        c <= midModule + logoModuleRadius
      );
    };

    // 1. Dessin des modules carrés nets
    ctx.fillStyle = moduleGradient;
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (isFinder(r, c) || isCenterLogo(r, c)) continue;
        if (isDarkModule(r, c)) {
          const x = offset + c * unitSize;
          const y = offset + r * unitSize;
          ctx.fillRect(x + 0.4, y + 0.4, unitSize - 0.4, unitSize - 0.4);
        }
      }
    }

    // 2. Dessin des 3 repères de coin (Finder Eyes)
    function drawFinderEye(startRow, startCol) {
      const x = offset + startCol * unitSize;
      const y = offset + startRow * unitSize;
      const eyeSize = 7 * unitSize;
      const cornerRadius = unitSize * 1.5;

      // Grand carré externe
      ctx.fillStyle = '#312e81';
      drawRoundedRect(ctx, x, y, eyeSize, eyeSize, cornerRadius);
      ctx.fill();

      // Anneau blanc interne
      ctx.fillStyle = '#ffffff';
      drawRoundedRect(ctx, x + unitSize, y + unitSize, 5 * unitSize, 5 * unitSize, unitSize * 1.1);
      ctx.fill();

      // Carré plein central avec dégradé
      const eyeGrad = ctx.createLinearGradient(x + 2 * unitSize, y + 2 * unitSize, x + 5 * unitSize, y + 5 * unitSize);
      eyeGrad.addColorStop(0, '#4f46e5');
      eyeGrad.addColorStop(1, '#7c3aed');
      ctx.fillStyle = eyeGrad;
      drawRoundedRect(ctx, x + 2 * unitSize, y + 2 * unitSize, 3 * unitSize, 3 * unitSize, unitSize * 0.8);
      ctx.fill();
    }

    drawFinderEye(0, 0);
    drawFinderEye(0, moduleCount - 7);
    drawFinderEye(moduleCount - 7, 0);

    // 3. Dessin du badge logo MARKI au centre
    const centerPx = targetSize / 2;
    const badgeSizePx = (logoModuleRadius * 2 + 1.2) * unitSize;
    const halfBadge = badgeSizePx / 2;
    const shieldPad = unitSize * 0.45;

    // Bouclier blanc externe avec ombre douce
    ctx.shadowColor = 'rgba(15, 23, 42, 0.2)';
    ctx.shadowBlur = Math.round(unitSize * 2.2);
    ctx.shadowOffsetY = Math.round(unitSize * 0.6);
    ctx.fillStyle = '#ffffff';
    drawRoundedRect(
      ctx,
      centerPx - halfBadge - shieldPad,
      centerPx - halfBadge - shieldPad,
      badgeSizePx + shieldPad * 2,
      badgeSizePx + shieldPad * 2,
      unitSize * 1.5
    );
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Pastille interne en dégradé
    const badgeGrad = ctx.createLinearGradient(centerPx - halfBadge, centerPx - halfBadge, centerPx + halfBadge, centerPx + halfBadge);
    badgeGrad.addColorStop(0, '#6d4aff');
    badgeGrad.addColorStop(1, '#00b4d8');
    ctx.fillStyle = badgeGrad;
    drawRoundedRect(ctx, centerPx - halfBadge, centerPx - halfBadge, badgeSizePx, badgeSizePx, unitSize * 1.2);
    ctx.fill();

    // Lettre 'M' centrale
    ctx.fillStyle = '#ffffff';
    ctx.font = `850 ${Math.round(badgeSizePx * 0.62)}px "Plus Jakarta Sans", "Inter", -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M', centerPx, centerPx + Math.round(badgeSizePx * 0.03));

    return canvas;
  }

  function renderQrCode(url) {
    const container = byId('qr-code-canvas');
    if (!container) return;

    container.innerHTML = '';
    state.styledCanvas = null;

    if (!url) {
      container.innerHTML = '<p class="qr-code-canvas__error">Lien public indisponible.</p>';
      return;
    }

    if (typeof window.QRCode !== 'function') {
      container.innerHTML = `
        <div class="qr-code-canvas__error">
          <strong>Le générateur QR n’a pas pu être chargé.</strong>
          <span>Le lien public reste disponible et peut être copié.</span>
        </div>
      `;
      return;
    }

    const styled = createStyledGradientQrCanvas(url, 600);
    if (styled) {
      styled.style.width = '100%';
      styled.style.height = '100%';
      styled.style.maxWidth = '236px';
      styled.style.aspectRatio = '1 / 1';
      styled.style.display = 'block';
      styled.style.borderRadius = '14px';
      container.appendChild(styled);
      state.styledCanvas = styled;
    } else {
      // Fallback direct
      state.qrInstance = new window.QRCode(container, {
        text: url,
        width: 236,
        height: 236,
        colorDark: '#17132f',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.H
      });
    }
  }

  function renderOverview(data) {
    state.data = data;

    const section = byId('public-registration-section');
    if (section) section.hidden = false;

    renderStatus(Boolean(data.link?.is_active));

    if (byId('qr-public-url')) {
      byId('qr-public-url').value = data.link?.public_url || '';
    }
    if (byId('qr-admin-doctor-name')) {
      byId('qr-admin-doctor-name').textContent = data.doctor?.name || '—';
    }
    if (byId('qr-admin-doctor-initials')) {
      const names = String(data.doctor?.name || '').replace(/^Dr\s+/i, '').trim().split(/\s+/).filter(Boolean);
      byId('qr-admin-doctor-initials').textContent = names.length
        ? `${names[0][0] || ''}${names.length > 1 ? names[names.length - 1][0] : ''}`.toUpperCase()
        : 'DR';
    }
    if (byId('qr-admin-clinic-name')) {
      byId('qr-admin-clinic-name').textContent = data.clinic?.name || '—';
    }
    if (byId('qr-token-version')) {
      byId('qr-token-version').textContent =
        `Version ${Number(data.link?.token_version || 1)}`;
    }

    if (byId('qr-scans-today')) {
      byId('qr-scans-today').textContent =
        String(Number(data.metrics?.scans_today || 0));
    }
    if (byId('qr-registrations-today')) {
      byId('qr-registrations-today').textContent =
        String(Number(data.metrics?.registrations_today || 0));
    }
    if (byId('qr-last-scan')) {
      byId('qr-last-scan').textContent =
        formatDateTime(data.link?.last_scanned_at);
    }

    if (byId('qr-birth-date-required')) {
      byId('qr-birth-date-required').checked =
        Boolean(data.settings?.birth_date_required);
    }
    if (byId('qr-max-registrations')) {
      byId('qr-max-registrations').value =
        data.settings?.max_public_registrations_per_day ?? '';
    }
    if (byId('qr-session-duration')) {
      byId('qr-session-duration').value = String(
        Number(data.settings?.public_session_duration_minutes || 720)
      );
    }

    const messageBindings = {
      'qr-message-day-not-open': 'day_not_open',
      'qr-message-open': 'registration_open',
      'qr-message-closed': 'registration_closed',
      'qr-message-paused': 'queue_paused',
      'qr-message-completed': 'day_completed',
      'qr-message-disabled': 'qr_disabled',
      'qr-message-outside-schedule': 'outside_schedule',
      'qr-message-success': 'registration_success'
    };

    Object.entries(messageBindings).forEach(([id, code]) => {
      const field = byId(id);
      if (field) field.value = data.messages?.[code] || '';
    });

    renderQrCode(data.link?.public_url || '');
    renderNetworkWarning(data.link?.public_url || '');
  }

  function renderNetworkWarning(url) {
    const warning = byId('qr-network-warning');
    if (!warning) return;

    try {
      const parsed = new URL(url, window.location.href);
      warning.hidden = !['localhost', '127.0.0.1', '::1'].includes(
        parsed.hostname
      );
    } catch (_) {
      warning.hidden = true;
    }
  }

  async function loadOverview({ silent = false } = {}) {
    if (state.loading) return;
    state.loading = true;

    if (!silent) setMessage('Chargement de la configuration du QR…', 'info');

    try {
      const response = await requestJson(API.get);
      renderOverview(response.data || {});
      setMessage();
    } catch (error) {
      if (error.status === 403) {
        const section = byId('public-registration-section');
        if (section) section.hidden = true;
        return;
      }

      console.error('[MARKI QR] Chargement :', error);
      const detail = error.serverError ? ` Détail : ${error.serverError}` : '';
      const reference = error.errorId ? ` Référence : ${error.errorId}.` : '';
      setMessage(`${error.message}${detail}${reference}`, 'error');
    } finally {
      state.loading = false;
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    clearFieldErrors();
    setMessage();

    const button = byId('qr-save-settings');
    if (button) {
      button.disabled = true;
      button.textContent = 'Enregistrement…';
    }

    const payload = {
      birth_date_required: Boolean(byId('qr-birth-date-required')?.checked),
      max_public_registrations_per_day:
        byId('qr-max-registrations')?.value.trim() || '',
      public_session_duration_minutes:
        Number(byId('qr-session-duration')?.value || 720),
      messages: {
        day_not_open: byId('qr-message-day-not-open')?.value.trim() || '',
        registration_open: byId('qr-message-open')?.value.trim() || '',
        registration_closed: byId('qr-message-closed')?.value.trim() || '',
        queue_paused: byId('qr-message-paused')?.value.trim() || '',
        day_completed: byId('qr-message-completed')?.value.trim() || '',
        qr_disabled: byId('qr-message-disabled')?.value.trim() || '',
        outside_schedule:
          byId('qr-message-outside-schedule')?.value.trim() || '',
        registration_success: byId('qr-message-success')?.value.trim() || ''
      }
    };

    try {
      const response = await requestJson(API.save, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      notify(response.message, 'success');
      await loadOverview({ silent: true });
    } catch (error) {
      console.error('[MARKI QR] Enregistrement :', error);
      showFieldErrors(error.data?.errors || {});
      setMessage(error.message, 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Enregistrer les réglages';
      }
    }
  }

  function openConfirm({ title, message, confirmLabel, danger = false, action }) {
    const modal = byId('qr-confirm-modal');
    if (!modal) return;

    state.confirmAction = action;
    byId('qr-confirm-title').textContent = title;
    byId('qr-confirm-message').textContent = message;

    const confirmButton = byId('qr-confirm-action');
    confirmButton.textContent = confirmLabel;
    confirmButton.classList.toggle('v1-button--primary', !danger);
    confirmButton.classList.toggle('v1-button--danger', danger);

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => confirmButton.focus(), 0);
  }

  function closeConfirm() {
    const modal = byId('qr-confirm-modal');
    if (!modal) return;

    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    state.confirmAction = null;
  }

  async function runConfirmedAction() {
    const action = state.confirmAction;
    if (typeof action !== 'function') return;

    const button = byId('qr-confirm-action');
    const previous = button.textContent;
    button.disabled = true;
    button.textContent = 'Traitement…';

    try {
      await action();
      closeConfirm();
    } catch (error) {
      console.error('[MARKI QR] Action confirmée :', error);
      setMessage(error.message, 'error');
      button.disabled = false;
      button.textContent = previous;
    }
  }

  function requestToggle() {
    const active = byId('qr-toggle-button')?.dataset.active === '1';

    openConfirm({
      title: active ? 'Désactiver le QR ?' : 'Activer le QR ?',
      message: active
        ? 'Le QR imprimé restera valide, mais les patients verront que l’inscription publique est indisponible.'
        : 'Les patients pourront de nouveau utiliser le même QR pour rejoindre la liste lorsque la journée est ouverte.',
      confirmLabel: active ? 'Désactiver' : 'Activer',
      danger: active,
      action: async () => {
        const response = await requestJson(API.toggle, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: !active })
        });
        notify(response.message, 'success');
        await loadOverview({ silent: true });
      }
    });
  }

  function requestRegeneration() {
    openConfirm({
      title: 'Régénérer le QR code ?',
      message: 'L’ancien QR et l’ancien lien cesseront immédiatement de fonctionner. Les affiches déjà imprimées devront être remplacées.',
      confirmLabel: 'Régénérer le QR',
      danger: true,
      action: async () => {
        const response = await requestJson(API.revoke, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        notify(response.message, 'success');
        await loadOverview({ silent: true });
      }
    });
  }

  async function copyPublicLink() {
    const url = byId('qr-public-url')?.value || '';
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      notify('Lien public copié.', 'success');
    } catch (_) {
      const field = byId('qr-public-url');
      field?.select();
      document.execCommand('copy');
      notify('Lien public copié.', 'success');
    }
  }

  function openPublicLink() {
    const url = byId('qr-public-url')?.value || '';
    if (!url) return;

    try {
      const publicUrl = new URL(url, window.location.href);
      const testUrl = `${publicUrl.pathname}${publicUrl.search}${publicUrl.hash}`;
      window.open(testUrl, '_blank', 'noopener,noreferrer');
    } catch (_) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  function qrImageDataUrl() {
    if (state.styledCanvas) {
      return state.styledCanvas.toDataURL('image/png');
    }
    const container = byId('qr-code-canvas');
    const source = container?.querySelector('canvas');
    if (source) return source.toDataURL('image/png');
    return container?.querySelector('img')?.src || '';
  }

  function downloadQr() {
    const imageUrl = qrImageDataUrl();
    if (!imageUrl) {
      setMessage('Le QR n’est pas encore disponible au téléchargement.', 'error');
      return;
    }

    const doctor = state.data?.doctor?.name || 'medecin';
    const filename = `marki-qr-${doctor}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `${filename || 'marki-qr'}.png`;
    document.body.append(link);
    link.click();
    link.remove();
  }

  function printQr() {
    const imageUrl = qrImageDataUrl();
    const url = byId('qr-public-url')?.value || '';
    if (!imageUrl || !url) {
      setMessage('Le QR n’est pas encore prêt à être imprimé.', 'error');
      return;
    }

    const doctor = state.data?.doctor?.name || 'Votre médecin';
    const specialty = state.data?.doctor?.specialty || '';
    const clinic = state.data?.clinic?.name || 'Cabinet médical';
    const popup = window.open('', '_blank');

    if (!popup) {
      setMessage('Autorisez les fenêtres contextuelles pour imprimer le QR.', 'error');
      return;
    }

    try { popup.opener = null; } catch (_) {}

    popup.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Affiche QR MARKI — ${escapeHtml(doctor)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page {
    size: A4 portrait;
    margin: 10mm 12mm;
  }
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    background: #ffffff;
    color: #0f172a;
    font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    line-height: 1.4;
  }
  .poster {
    width: 100%;
    max-width: 190mm;
    margin: 0 auto;
    border: 2px solid #e0e7ff;
    border-radius: 24px;
    padding: 10mm 12mm 8mm;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    position: relative;
    box-shadow: 0 4px 24px rgba(109, 74, 255, 0.06);
    page-break-inside: avoid;
  }
  .poster-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 5mm;
    border-bottom: 1.5px solid #f1f5f9;
  }
  .brand-group {
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
  }
  .brand-mark {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: linear-gradient(135deg, #6d4aff 0%, #00b4d8 100%);
    color: #ffffff;
    font-weight: 800;
    font-size: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 10px rgba(109, 74, 255, 0.25);
  }
  .brand-title {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #0f172a;
    line-height: 1.1;
  }
  .brand-subtitle {
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .secure-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 9999px;
    font-size: 11.5px;
    font-weight: 700;
    color: #166534;
  }
  .secure-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #22c55e;
  }

  .doctor-card {
    width: 100%;
    margin-top: 5mm;
    padding: 3.5mm 6mm;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    text-align: left;
  }
  .doctor-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .doctor-avatar {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: #ede9fe;
    color: #6d4aff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 15px;
  }
  .doctor-name {
    font-size: 17px;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.2;
  }
  .doctor-specialty {
    font-size: 13px;
    font-weight: 600;
    color: #6d4aff;
  }
  .clinic-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #ffffff;
    padding: 5px 12px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    font-size: 12.5px;
    font-weight: 700;
    color: #334155;
  }

  .hero-section {
    margin-top: 5mm;
    margin-bottom: 4mm;
  }
  .hero-eyebrow {
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6d4aff;
    margin-bottom: 2px;
  }
  .hero-title {
    font-size: 26px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }
  .hero-desc {
    font-size: 13.5px;
    color: #475569;
    max-width: 145mm;
    margin: 4px auto 0;
    line-height: 1.35;
  }

  .qr-centerpiece {
    position: relative;
    padding: 16px;
    background: #ffffff;
    border: 2.5px solid #6d4aff;
    border-radius: 22px;
    box-shadow: 0 10px 30px rgba(109, 74, 255, 0.12);
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin: 3mm auto 4mm;
  }
  .qr-target-corner {
    position: absolute;
    width: 20px;
    height: 20px;
    border-color: #6d4aff;
    border-style: solid;
  }
  .qr-corner-tl { top: 6px; left: 6px; border-width: 3.5px 0 0 3.5px; border-top-left-radius: 8px; }
  .qr-corner-tr { top: 6px; right: 6px; border-width: 3.5px 3.5px 0 0; border-top-right-radius: 8px; }
  .qr-corner-bl { bottom: 6px; left: 6px; border-width: 0 0 3.5px 3.5px; border-bottom-left-radius: 8px; }
  .qr-corner-br { bottom: 6px; right: 6px; border-width: 0 3.5px 3.5px 0; border-bottom-right-radius: 8px; }

  .qr-image {
    width: 66mm;
    height: 66mm;
    max-width: 260px;
    max-height: 260px;
    aspect-ratio: 1 / 1;
    object-fit: contain;
    display: block;
    border-radius: 12px;
  }
  .qr-badge {
    margin-top: 3.5mm;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 14px;
    background: #f1f5f9;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 700;
    color: #334155;
  }

  .steps-container {
    width: 100%;
    margin-top: 3mm;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3.5mm;
  }
  .step-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    padding: 3.5mm 3.5mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .step-badge {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #6d4aff;
    color: #ffffff;
    font-size: 13px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 2mm;
  }
  .step-title {
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 2px;
  }
  .step-text {
    font-size: 11px;
    color: #64748b;
    line-height: 1.3;
  }

  .poster-footer {
    width: 100%;
    margin-top: 4mm;
    padding-top: 3.5mm;
    border-top: 1.5px solid #f1f5f9;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2mm;
  }
  .reassurance-bar {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: #475569;
  }
  .direct-url {
    font-size: 9.5px;
    color: #94a3b8;
    word-break: break-all;
  }
</style>
</head>
<body>
  <main class="poster">
    <header class="poster-header">
      <div class="brand-group">
        <div class="brand-mark">M</div>
        <div>
          <div class="brand-title">MARKI</div>
          <div class="brand-subtitle">Accueil & File d'attente</div>
        </div>
      </div>
      <div class="secure-pill">
        <span class="secure-dot"></span>
        <span>Inscription Sécurisée & Privée</span>
      </div>
    </header>

    <div class="doctor-card">
      <div class="doctor-info">
        <div class="doctor-avatar">Dr</div>
        <div>
          <div class="doctor-name">${escapeHtml(doctor)}</div>
          <div class="doctor-specialty">${escapeHtml(specialty || 'Médecin Praticien')}</div>
        </div>
      </div>
      <div class="clinic-badge">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6d4aff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M9 7h1"/><path d="M9 11h1"/><path d="M9 15h1"/><path d="M14 7h1"/><path d="M14 11h1"/><path d="M14 15h1"/></svg>
        <span>${escapeHtml(clinic)}</span>
      </div>
    </div>

    <div class="hero-section">
      <div class="hero-eyebrow">Service Patient</div>
      <h1 class="hero-title">Prenez votre place en un scan</h1>
      <p class="hero-desc">Scannez ce QR code avec votre smartphone pour rejoindre la liste d’attente et suivre votre passage en temps réel.</p>
    </div>

    <div class="qr-centerpiece">
      <div class="qr-target-corner qr-corner-tl"></div>
      <div class="qr-target-corner qr-corner-tr"></div>
      <div class="qr-target-corner qr-corner-bl"></div>
      <div class="qr-target-corner qr-corner-br"></div>
      <img class="qr-image" src="${imageUrl}" alt="QR code d’inscription">
      <div class="qr-badge">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6d4aff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        <span>Pointez votre appareil photo</span>
      </div>
    </div>

    <div class="steps-container">
      <div class="step-card">
        <div class="step-badge">1</div>
        <div class="step-title">Scannez</div>
        <div class="step-text">Ouvrez l’appareil photo ou votre application de scan habituelle.</div>
      </div>
      <div class="step-card">
        <div class="step-badge">2</div>
        <div class="step-title">Inscrivez-vous</div>
        <div class="step-text">Indiquez votre nom et numéro de téléphone en 15 secondes.</div>
      </div>
      <div class="step-card">
        <div class="step-badge">3</div>
        <div class="step-title">Suivez votre tour</div>
        <div class="step-text">Consultez en direct votre position et le temps d'attente estimé.</div>
      </div>
    </div>

    <footer class="poster-footer">
      <div class="reassurance-bar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#166534" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span>Vos données sont strictement confidentielles et réservées au secrétariat médical.</span>
      </div>
      <div class="direct-url">Lien direct : ${escapeHtml(url)}</div>
    </footer>
  </main>
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.print();
      }, 300);
    });
  <\/script>
</body>
</html>`);
    popup.document.close();
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  }

  function bindEvents(section) {
    if (section.dataset.qrBound === '1') return;
    section.dataset.qrBound = '1';

    byId('qr-settings-form')?.addEventListener('submit', saveSettings);
    byId('qr-toggle-button')?.addEventListener('click', requestToggle);
    byId('qr-regenerate')?.addEventListener('click', requestRegeneration);
    byId('qr-copy-link')?.addEventListener('click', copyPublicLink);
    byId('qr-open-link')?.addEventListener('click', openPublicLink);
    byId('qr-download')?.addEventListener('click', downloadQr);
    byId('qr-print')?.addEventListener('click', printQr);
    byId('qr-confirm-action')?.addEventListener('click', runConfirmedAction);

    document.querySelectorAll('[data-close-qr-confirm]').forEach(button => {
      button.addEventListener('click', closeConfirm);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !byId('qr-confirm-modal')?.hidden) {
        closeConfirm();
      }
    });
  }

  window.initMarkiPublicRegistration = async function () {
    const section = byId('public-registration-section');
    if (!section) return false;

    const canManageQr = Boolean(
      window.MARKI_CONTEXT?.capabilities?.['settings.manage_doctor']
    );

    if (!canManageQr) {
      section.remove();
      return false;
    }

    bindEvents(section);
    const doctorId = String(
      window.MARKI_CONTEXT?.doctor_id
      || document.querySelector('[data-selected-doctor-id]')?.dataset.selectedDoctorId
      || 'current'
    );

    if (state.initializedForDoctor !== doctorId) {
      state.initializedForDoctor = doctorId;
      state.data = null;
    }

    await loadOverview();
    return true;
  };
})();
