const { test } = require('node:test');
const assert = require('node:assert');
const n = require('../scripts/lib/negotiation');

test('parseNegotiationAmount reads the won amount', () => {
  assert.strictEqual(n.parseNegotiationAmount('#네고희망 10000', '#네고희망'), 10000);
  assert.strictEqual(n.parseNegotiationAmount('#네고희망 120,000원 가능할까요', '#네고희망'), 120000);
  assert.strictEqual(n.parseNegotiationAmount('가격 #네고희망  50000', '#네고희망'), 50000);
});

test('parseNegotiationAmount returns null for missing/invalid amount', () => {
  assert.strictEqual(n.parseNegotiationAmount('#네고희망 깎아주세요', '#네고희망'), null);
  assert.strictEqual(n.parseNegotiationAmount('#네고희망 0', '#네고희망'), null);
  assert.strictEqual(n.parseNegotiationAmount('관심 없어요', '#네고희망'), null);
});

test('classifyReactions: pending when no relevant reaction', () => {
  assert.strictEqual(n.classifyReactions([], 'Suckzoo'), 'pending');
  assert.strictEqual(n.classifyReactions([{ content: 'heart', user: { login: 'Suckzoo' } }], 'Suckzoo'), 'pending');
});

test('classifyReactions: accepted-active when owner 👍 and no expiry', () => {
  assert.strictEqual(n.classifyReactions([{ content: '+1', user: { login: 'Suckzoo' } }], 'Suckzoo'), 'accepted-active');
});

test('classifyReactions: done when owner 👎 or any 😕', () => {
  assert.strictEqual(n.classifyReactions([{ content: '-1', user: { login: 'Suckzoo' } }], 'Suckzoo'), 'done');
  assert.strictEqual(n.classifyReactions([
    { content: '+1', user: { login: 'Suckzoo' } },
    { content: 'confused', user: { login: 'github-actions[bot]' } },
  ], 'Suckzoo'), 'done');
});

test('classifyReactions: a non-owner 👍 does not accept', () => {
  assert.strictEqual(n.classifyReactions([{ content: '+1', user: { login: 'someone' } }], 'Suckzoo'), 'pending');
});
