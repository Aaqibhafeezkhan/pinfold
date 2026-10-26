// Pinfold website theme switch. The site is light by default; visitors can switch to dark.
// The choice is saved in this browser's localStorage under "pinfold-theme" (never a cookie,
// never sent anywhere). Loaded as a blocking script in <head> so the saved theme applies
// before the first paint. Without JavaScript the site stays light and the button stays hidden.
(function () {
  'use strict';

  var KEY = 'pinfold-theme';
  var COLORS = { light: '#f7f7fc', dark: '#0e0d1c' };
  var root = document.documentElement;

  function read() {
    try {
      return window.localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }

  function save(theme) {
    try {
      window.localStorage.setItem(KEY, theme);
    } catch (e) {
      // Storage blocked or full: the theme still applies to this page view.
    }
  }

  function current() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function updateButton(button) {
    var label = current() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', COLORS[theme]);
    var button = document.querySelector('.theme-toggle');
    if (button) updateButton(button);
  }

  function setUpButton() {
    var button = document.querySelector('.theme-toggle');
    if (!button) return;
    updateButton(button);
    button.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      apply(next);
      save(next);
    });
    var item = button.closest('[hidden]') || button;
    item.hidden = false;
  }

  apply(read());

  // Keep other open tabs of the site in step when the choice changes.
  window.addEventListener('storage', function (event) {
    if (event.key === KEY) apply(read());
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setUpButton);
  } else {
    setUpButton();
  }
})();
