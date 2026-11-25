(function (root) {
  'use strict';

  const STORAGE_KEY = 'punto-y-aparte-reservas';
  const SPACES = ['Sala de proyectos', 'Rincón de repaso'];

  function validateReservation(value) {
    const fields = ['persona', 'dia', 'espacio', 'hora-desde', 'hora-hasta', 'tema'];
    if (!value || fields.some((field) => typeof value[field] !== 'string' || !value[field].trim())) {
      return { ok: false, message: 'Completá todos los campos para reservar.' };
    }
    if (!SPACES.includes(value.espacio)) {
      return { ok: false, message: 'Elegí uno de los espacios disponibles.' };
    }
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.dia);
    if (!dateMatch) return { ok: false, message: 'Ingresá una fecha válida.' };
    const date = new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]));
    if (date.getFullYear() !== Number(dateMatch[1]) || date.getMonth() !== Number(dateMatch[2]) - 1 || date.getDate() !== Number(dateMatch[3])) {
      return { ok: false, message: 'Ingresá una fecha válida.' };
    }
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timePattern.test(value['hora-desde']) || !timePattern.test(value['hora-hasta'])) {
      return { ok: false, message: 'Ingresá horarios válidos.' };
    }
    if (value['hora-hasta'] <= value['hora-desde']) {
      return { ok: false, message: 'La hora de fin debe ser posterior a la de inicio.' };
    }
    return { ok: true };
  }

  function hasConflict(candidate, reservations) {
    return reservations.some((reservation) => reservation.id !== candidate.id
      && reservation.dia === candidate.dia
      && reservation.espacio === candidate.espacio
      && candidate['hora-desde'] < reservation['hora-hasta']
      && candidate['hora-hasta'] > reservation['hora-desde']);
  }

  function sortReservations(reservations) {
    return reservations.slice().sort((a, b) => a.dia.localeCompare(b.dia)
      || a['hora-desde'].localeCompare(b['hora-desde']));
  }

  function loadReservations(storage) {
    try {
      if (!storage || typeof storage.getItem !== 'function') throw new Error('Storage unavailable');
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null) return { reservations: [], warning: false };
      const reservations = JSON.parse(raw);
      if (!Array.isArray(reservations) || reservations.some((item) => !item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || !validateReservation(item).ok)) throw new Error('Invalid data');
      return { reservations, warning: false };
    } catch (error) {
      return { reservations: [], warning: true };
    }
  }

  function saveReservation(storage, reservations) {
    try {
      if (!storage || typeof storage.setItem !== 'function') return false;
      storage.setItem(STORAGE_KEY, JSON.stringify(reservations));
      return true;
    } catch (error) {
      return false;
    }
  }

  function init() {
    if (typeof document === 'undefined') return;
    const form = document.getElementById('formulario-reserva');
    if (!form) return;
    const agenda = document.getElementById('agenda');
    const notice = document.getElementById('aviso');
    const receipt = document.getElementById('comprobante');
    const receiptContent = document.getElementById('receipt-content');
    const printButton = document.getElementById('print-receipt');
    let storage;
    try { storage = root.localStorage; } catch (error) { storage = null; }
    const loaded = loadReservations(storage);
    let reservations = loaded.reservations;
    let activeReceiptId = null;

    function showNotice(message, kind) {
      notice.textContent = message;
      notice.className = 'notice' + (kind ? ' notice--' + kind : '');
      notice.hidden = !message;
    }

    function hideReceipt() {
      activeReceiptId = null;
      receipt.hidden = true;
      receiptContent.replaceChildren();
    }

    function renderReceipt(reservation) {
      receiptContent.replaceChildren();
      const details = [
        ['Participante', reservation.persona],
        ['Fecha', reservation.dia],
        ['Horario', reservation['hora-desde'] + ' a ' + reservation['hora-hasta']],
        ['Espacio', reservation.espacio],
        ['Tema', reservation.tema],
      ];
      details.forEach(([label, value]) => {
        const row = document.createElement('p');
        const strong = document.createElement('strong');
        strong.textContent = label + ': ';
        row.append(strong, document.createTextNode(value));
        receiptContent.append(row);
      });
      activeReceiptId = reservation.id;
      receipt.hidden = false;
    }

    function renderAgenda() {
      agenda.replaceChildren();
      const ordered = sortReservations(reservations);
      if (!ordered.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = 'Todavía no hay encuentros. ¡El primero puede ser tuyo!';
        agenda.append(empty);
        return;
      }
      ordered.forEach((reservation) => {
        const item = document.createElement('article');
        item.className = 'booking';
        const info = document.createElement('div');
        const title = document.createElement('h3');
        title.textContent = reservation.tema;
        const detail = document.createElement('p');
        detail.textContent = reservation.dia + ' · ' + reservation['hora-desde'] + '–' + reservation['hora-hasta'] + ' · ' + reservation.espacio + ' · ' + reservation.persona;
        info.append(title, detail);
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'button button--quiet cancel-booking';
        cancel.textContent = 'Cancelar encuentro';
        cancel.setAttribute('aria-label', 'Cancelar encuentro: ' + reservation.tema);
        cancel.dataset.id = reservation.id;
        item.append(info, cancel);
        agenda.append(item);
      });
    }

    if (loaded.warning) showNotice('No se pudieron leer las reservas guardadas. La agenda comienza vacía.', 'warning');
    renderAgenda();

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      hideReceipt();
      const data = new FormData(form);
      const value = Object.fromEntries(data.entries());
      const validation = validateReservation(value);
      if (!validation.ok) {
        showNotice(validation.message, 'error');
        return;
      }
      const reservation = { ...value, id: (root.crypto && root.crypto.randomUUID) ? root.crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2) };
      if (hasConflict(reservation, reservations)) {
        showNotice('Ese espacio ya está reservado en ese horario. Elegí otro momento.', 'error');
        return;
      }
      const updated = sortReservations([...reservations, reservation]);
      if (!saveReservation(storage, updated)) {
        showNotice('No se pudo guardar la reserva en este dispositivo. Probá liberar espacio e intentá de nuevo.', 'error');
        return;
      }
      reservations = updated;
      renderAgenda();
      form.reset();
      showNotice('¡Encuentro reservado! Guardamos tu reserva en este dispositivo.', 'success');
      renderReceipt(reservation);
    });

    agenda.addEventListener('click', (event) => {
      const button = event.target.closest('.cancel-booking');
      if (!button) return;
      const next = reservations.filter((item) => item.id !== button.dataset.id);
      if (next.length === reservations.length) return;
      if (!saveReservation(storage, next)) {
        showNotice('No se pudo guardar la cancelación. Intentá de nuevo.', 'error');
        return;
      }
      reservations = next;
      if (activeReceiptId === button.dataset.id) hideReceipt();
      renderAgenda();
      const nextCancel = agenda.querySelector('.cancel-booking');
      if (nextCancel) nextCancel.focus();
      else document.getElementById('agenda-title').focus();
      showNotice('El encuentro se canceló.', 'success');
    });

    printButton.addEventListener('click', () => {
      if (activeReceiptId && reservations.some((item) => item.id === activeReceiptId)) root.print();
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { validateReservation, hasConflict, sortReservations, loadReservations, saveReservation };
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
