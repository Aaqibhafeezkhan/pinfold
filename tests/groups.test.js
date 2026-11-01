const test = require('node:test');
const assert = require('node:assert/strict');
const { getGroupDisplayName, compareGroups } = require('../utils/groups.js');

function group(title, tabs = [], createdAt = 0) {
  return { title, tabs, createdAt };
}

test('named groups use their own display name', () => {
  assert.equal(getGroupDisplayName(group('Research', [{ title: 'Other' }])), 'Research');
});

test('untitled single-tab groups sort by the visible tab title or URL', () => {
  assert.equal(getGroupDisplayName(group('', [{ title: 'Zebra', url: 'https://z.example' }])), 'Zebra');
  assert.equal(getGroupDisplayName(group('', [{ title: '', url: 'https://a.example' }])), 'https://a.example');
});

test('empty and untitled multi-tab groups get a stable fallback', () => {
  assert.equal(getGroupDisplayName(group('', [])), 'Untitled Group');
  assert.equal(getGroupDisplayName(group('', [{ title: 'A' }, { title: 'B' }])), 'Untitled Group');
});

test('group-name sort includes single tabs and ignores case', () => {
  const groups = [
    group('', [{ title: 'zebra' }]),
    group('Beta'),
    group('', [{ title: 'alpha' }]),
    group('gamma')
  ];
  groups.sort((a, b) => compareGroups(a, b, 'title'));
  assert.deepEqual(groups.map(getGroupDisplayName), ['alpha', 'Beta', 'gamma', 'zebra']);
  assert.equal(compareGroups(group('ALPHA'), group('', [{ title: 'alpha' }]), 'title'), 0);
});

test('date and tab-count sorting preserve their existing ordering', () => {
  const older = group('Older', [{ title: 'A' }], 10);
  const newer = group('Newer', [{ title: 'B' }, { title: 'C' }], 20);
  assert.ok(compareGroups(older, newer, 'oldest') < 0);
  assert.ok(compareGroups(older, newer, 'newest') > 0);
  assert.ok(compareGroups(older, newer, 'most_tabs') > 0);
  assert.ok(compareGroups(older, newer, 'unrecognized') > 0);
});
