const { test } = require('node:test');
const assert = require('node:assert');
const { isOperator, operatorLogins } = require('../scripts/lib/operators');

test('operatorLogins keeps owner and additional operators', () => {
  assert.deepStrictEqual(operatorLogins({ owner: 'Suckzoo', operators: ['0x1f440'] }), ['Suckzoo', '0x1f440']);
});

test('isOperator matches owner and additional operators case-insensitively', () => {
  const cfg = { owner: 'Suckzoo', operators: ['0x1f440'] };
  assert.strictEqual(isOperator('suckzoo', cfg), true);
  assert.strictEqual(isOperator('0x1f440', cfg), true);
  assert.strictEqual(isOperator('someone', cfg), false);
});
