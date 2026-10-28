const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function dashboardWithTheme(theme, systemIsLight) {
  const elements = new Map();
  const body = {
    dataset: {},
    setAttribute(name, value) {
      if (name === 'data-theme') this.dataset.theme = value;
    }
  };
  const getElementById = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        listeners: {},
        addEventListener(type, handler) { this.listeners[type] = handler; },
        appendChild(child) { this.lastChild = child; },
        classList: { add() {}, remove() {}, toggle() {} }
      });
    }
    return elements.get(id);
  };
  let savedSettings = { theme, viewMode: 'list' };
  const sandbox = {
    console,
    document: {
      body,
      getElementById,
      addEventListener() {},
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, remove() {} })
    },
    window: {
      matchMedia: () => ({ matches: systemIsLight }),
      addEventListener() {}
    },
    PinfoldStorage: {
      async updateSettings(patch) {
        savedSettings = { ...savedSettings, ...patch };
        return savedSettings;
      }
    },
    SVG_ICONS: { sun: 'sun', moon: 'moon' },
    setTimeout() {},
    testSettings: savedSettings
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'dashboard.js'), 'utf8');
  vm.runInNewContext(source + '\nstate.settings = testSettings; applyTheme(state.settings.theme); bindEventListeners();', sandbox);

  return {
    body,
    get savedTheme() { return savedSettings.theme; },
    get toast() { return getElementById('toastContainer').lastChild?.textContent; },
    async toggle() { await getElementById('themeToggleBtn').listeners.click(); }
  };
}

for (const [savedTheme, systemIsLight, initiallyVisible, nextTheme] of [
  ['system', false, 'dark', 'light'],
  ['system', true, 'light', 'dark'],
  ['dark', true, 'dark', 'light'],
  ['light', false, 'light', 'dark']
]) {
  test(`toggle ${savedTheme} theme while ${initiallyVisible} is visible`, async () => {
    const dashboard = dashboardWithTheme(savedTheme, systemIsLight);
    assert.equal(dashboard.body.dataset.theme, initiallyVisible);
    await dashboard.toggle();
    assert.equal(dashboard.body.dataset.theme, nextTheme);
    assert.equal(dashboard.savedTheme, nextTheme);
    assert.equal(dashboard.toast, `Theme: ${nextTheme === 'dark' ? 'Dark' : 'Light'}`);
    await dashboard.toggle();
    assert.equal(dashboard.body.dataset.theme, initiallyVisible);
    assert.equal(dashboard.savedTheme, initiallyVisible);
  });
}
