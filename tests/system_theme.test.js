const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function pageWithTheme(page, theme, initialLight) {
  const src = fs.readFileSync(path.join(__dirname, '..', page, page + '.js'), 'utf8');
  const callbacks = [];
  const media = {
    matches: initialLight,
    addEventListener(type, callback) {
      if (type === 'change') callbacks.push(callback);
    }
  };
  const icon = { innerHTML: '' };
  const body = {
    dataset: {},
    setAttribute(name, value) {
      if (name === 'data-theme') this.dataset.theme = value;
    }
  };
  const sandbox = {
    console,
    document: {
      body,
      addEventListener() {},
      getElementById: () => icon
    },
    window: { matchMedia: () => media },
    SVG_ICONS: { sun: 'sun', moon: 'moon' }
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  if (page === 'dashboard') {
    vm.runInContext('state.settings = { theme: ' + JSON.stringify(theme) + ' };', sandbox);
  } else {
    vm.runInContext('currentSettings = { theme: ' + JSON.stringify(theme) + ' };', sandbox);
  }
  vm.runInContext('applyTheme(' + JSON.stringify(theme) + '); watchSystemTheme();', sandbox);
  return {
    body,
    icon,
    listenerCount: () => callbacks.length,
    changeSystem(toLight) {
      media.matches = toLight;
      callbacks.forEach(callback => callback({ matches: toLight }));
    },
    setTheme(newTheme) {
      if (page === 'dashboard') {
        vm.runInContext('state.settings.theme = ' + JSON.stringify(newTheme), sandbox);
      } else {
        vm.runInContext('currentSettings.theme = ' + JSON.stringify(newTheme), sandbox);
      }
      vm.runInContext('applyTheme(' + JSON.stringify(newTheme) + ')', sandbox);
    }
  };
}

for (const page of ['dashboard', 'options']) {
  test(page + ' follows system theme switches without a reload', () => {
    const fixture = pageWithTheme(page, 'system', false);
    assert.equal(fixture.listenerCount(), 1);
    assert.equal(fixture.body.dataset.theme, 'dark');
    fixture.changeSystem(true);
    assert.equal(fixture.body.dataset.theme, 'light');
    fixture.changeSystem(false);
    assert.equal(fixture.body.dataset.theme, 'dark');
    if (page === 'dashboard') assert.equal(fixture.icon.innerHTML, 'moon');
  });

  test(page + ' ignores OS changes when an explicit theme is chosen', () => {
    const fixture = pageWithTheme(page, 'light', true);
    assert.equal(fixture.body.dataset.theme, 'light');
    fixture.changeSystem(false);
    assert.equal(fixture.body.dataset.theme, 'light');
    fixture.setTheme('dark');
    fixture.changeSystem(true);
    assert.equal(fixture.body.dataset.theme, 'dark');
    fixture.setTheme('system');
    fixture.changeSystem(false);
    assert.equal(fixture.body.dataset.theme, 'dark');
  });
}
