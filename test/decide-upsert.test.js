const { test } = require('node:test');
const assert = require('node:assert');
const { decideUpsert } = require('../scripts/lib/decide-upsert');

test('create when no existing issue', () => {
  assert.deepStrictEqual(decideUpsert({ existing: null, title: 'A', newBody: 'b' }), { action: 'create' });
});

test('unchanged when title and body match', () => {
  const existing = { number: 5, title: 'A', body: 'b' };
  assert.deepStrictEqual(decideUpsert({ existing, title: 'A', newBody: 'b' }), { action: 'unchanged' });
});

test('update body only when body differs', () => {
  const existing = { number: 5, title: 'A', body: 'old' };
  assert.deepStrictEqual(decideUpsert({ existing, title: 'A', newBody: 'new' }), { action: 'update', fields: { body: 'new' } });
});

test('update title only when title differs', () => {
  const existing = { number: 5, title: 'Old', body: 'b' };
  assert.deepStrictEqual(decideUpsert({ existing, title: 'New', newBody: 'b' }), { action: 'update', fields: { title: 'New' } });
});

test('update both when both differ', () => {
  const existing = { number: 5, title: 'Old', body: 'old' };
  assert.deepStrictEqual(decideUpsert({ existing, title: 'New', newBody: 'new' }), { action: 'update', fields: { title: 'New', body: 'new' } });
});
