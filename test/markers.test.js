const { test } = require('node:test');
const assert = require('node:assert');
const { parseMarker, setMarker, readListing, readState, MARKER } = require('../scripts/lib/markers');

test('parseMarker returns null when absent', () => {
  assert.strictEqual(parseMarker('no markers here', MARKER.state), null);
});

test('setMarker then parseMarker round-trips an object', () => {
  let body = '매물 설명\n';
  body = setMarker(body, MARKER.state, { reserver: 'octocat', reservedAt: '2026-07-01T20:00:05+09:00', availableSince: null });
  const parsed = parseMarker(body, MARKER.state);
  assert.strictEqual(parsed.reserver, 'octocat');
  assert.strictEqual(parsed.availableSince, null);
});

test('setMarker replaces an existing marker, not duplicates it', () => {
  let body = setMarker('x', MARKER.state, { reserver: 'a', reservedAt: null, availableSince: null });
  body = setMarker(body, MARKER.state, { reserver: 'b', reservedAt: null, availableSince: null });
  assert.strictEqual((body.match(/market-state/g) || []).length, 1);
  assert.strictEqual(parseMarker(body, MARKER.state).reserver, 'b');
});

test('readState supplies defaults when marker missing', () => {
  assert.deepStrictEqual(readState('plain body'), { reserver: null, reservedAt: null, availableSince: null });
});

test('readListing returns {} when marker missing', () => {
  assert.deepStrictEqual(readListing('plain body'), {});
});
