const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateReservation,
  hasConflict,
  sortReservations,
  loadReservations,
  saveReservation,
} = require('../script.js');

const valid = {
  persona: 'Alex',
  dia: '2030-05-12',
  espacio: 'Sala de proyectos',
  'hora-desde': '10:00',
  'hora-hasta': '11:00',
  tema: 'Repaso',
};

test('valida reservas completas y permite fechas pasadas', () => {
  assert.deepEqual(validateReservation({ ...valid, dia: '2000-01-01' }), { ok: true });
});

test('rechaza campos vacíos y fechas imposibles', () => {
  assert.equal(validateReservation({ ...valid, tema: '  ' }).ok, false);
  assert.equal(validateReservation({ ...valid, dia: '2030-02-30' }).ok, false);
});

test('exige que la hora final sea posterior a la inicial', () => {
  assert.equal(validateReservation({ ...valid, 'hora-hasta': '10:00' }).ok, false);
  assert.equal(validateReservation({ ...valid, 'hora-hasta': '09:30' }).ok, false);
});

test('detecta superposición solo en igual fecha y espacio, permitiendo consecutivos', () => {
  const existing = { ...valid, id: 'one' };
  assert.equal(hasConflict({ ...valid, 'hora-desde': '10:30', 'hora-hasta': '11:30' }, [existing]), true);
  assert.equal(hasConflict({ ...valid, 'hora-desde': '11:00', 'hora-hasta': '12:00' }, [existing]), false);
  assert.equal(hasConflict({ ...valid, espacio: 'Rincón de repaso' }, [existing]), false);
  assert.equal(hasConflict({ ...valid, dia: '2030-05-13' }, [existing]), false);
});

test('ordena por fecha y hora de inicio', () => {
  const result = sortReservations([
    { dia: '2030-05-13', 'hora-desde': '09:00' },
    { dia: '2030-05-12', 'hora-desde': '12:00' },
    { dia: '2030-05-12', 'hora-desde': '08:00' },
  ]);
  assert.deepEqual(result.map((item) => item['hora-desde']), ['08:00', '12:00', '09:00']);
});

test('maneja JSON corrupto y almacenamiento no disponible sin lanzar', () => {
  assert.deepEqual(loadReservations({ getItem: () => '{' }), { reservations: [], warning: true });
  assert.deepEqual(loadReservations({ getItem: () => '[{}]' }), { reservations: [], warning: true });
  assert.deepEqual(loadReservations({ getItem: () => null }), { reservations: [], warning: false });
  assert.deepEqual(loadReservations(null), { reservations: [], warning: true });
});

test('informa cuando no se puede guardar', () => {
  assert.equal(saveReservation({ setItem() { throw new Error('quota'); } }, []), false);
});
