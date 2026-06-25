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

test('classifyReactions: accepted-active when additional operator 👍 and no expiry', () => {
  const cfg = { owner: 'Suckzoo', operators: ['Suckzoo', '0x1f440'] };
  assert.strictEqual(n.classifyReactions([{ content: '+1', user: { login: '0x1f440' } }], cfg), 'accepted-active');
});

test('classifyReactions: done when owner 👎 or owner/bot 😕', () => {
  assert.strictEqual(n.classifyReactions([{ content: '-1', user: { login: 'Suckzoo' } }], 'Suckzoo'), 'done');
  assert.strictEqual(n.classifyReactions([
    { content: '+1', user: { login: 'Suckzoo' } },
    { content: 'confused', user: { login: 'github-actions[bot]' } },
  ], 'Suckzoo'), 'done');
  assert.strictEqual(n.classifyReactions([{ content: 'confused', user: { login: 'Suckzoo' } }], 'Suckzoo'), 'done');
});

test('classifyReactions: a stranger 😕 does not expire (owner/bot only)', () => {
  assert.strictEqual(n.classifyReactions([{ content: 'confused', user: { login: 'stranger' } }], 'Suckzoo'), 'pending');
  // a stranger 😕 must not override the owner's 👍 accept either
  assert.strictEqual(n.classifyReactions([
    { content: '+1', user: { login: 'Suckzoo' } },
    { content: 'confused', user: { login: 'stranger' } },
  ], 'Suckzoo'), 'accepted-active');
});

test('classifyReactions: a non-owner 👍 does not accept', () => {
  assert.strictEqual(n.classifyReactions([{ content: '+1', user: { login: 'someone' } }], 'Suckzoo'), 'pending');
});
