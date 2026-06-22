const { test } = require('node:test');
const assert = require('node:assert');
const { reconcileNegotiation } = require('../scripts/lib/reconcile-negotiation');

test('accept picks the earliest accepted-active comment', () => {
  const r = reconcileNegotiation({ negotiationComments: [
    { id: 1, author: 'a', amount: 120000, klass: 'done' },
    { id: 2, author: 'b', amount: 100000, klass: 'accepted-active' },
    { id: 3, author: 'c', amount: 90000, klass: 'accepted-active' },
  ] });
  assert.deepStrictEqual(r, { action: 'accept', winner: 'b', amount: 100000, commentId: 2 });
});

test('stay_negotiating when only pending remain', () => {
  const r = reconcileNegotiation({ negotiationComments: [
    { id: 1, author: 'a', amount: 1, klass: 'done' },
    { id: 2, author: 'b', amount: 2, klass: 'pending' },
  ] });
  assert.strictEqual(r.action, 'stay_negotiating');
});

test('release when all done', () => {
  const r = reconcileNegotiation({ negotiationComments: [
    { id: 1, author: 'a', amount: 1, klass: 'done' },
  ] });
  assert.strictEqual(r.action, 'release');
});

test('release when empty', () => {
  assert.strictEqual(reconcileNegotiation({ negotiationComments: [] }).action, 'release');
});
