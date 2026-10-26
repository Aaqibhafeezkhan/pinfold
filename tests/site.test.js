const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { markdownToHtml, buildPrivacyPage, OUTPUT } = require('../scripts/build-privacy-page.js');

const SITE = path.join(__dirname, '..', 'site');
const normalize = (text) => text.replace(/\r\n?/g, '\n');
const htmlFiles = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'));
const isExternal = (url) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url.trim());

// Attribute name -> value for every start tag in a document.
function tags(html) {
  const out = [];
  const tagRe = /<([a-z][a-z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let m;
  while ((m = tagRe.exec(html))) {
    const attrs = {};
    const attrRe = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let a;
    while ((a = attrRe.exec(m[2]))) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    out.push({ name: m[1].toLowerCase(), attrs });
  }
  return out;
}

// URLs a page loads by itself (not links the visitor may follow).
function loadedUrls(html) {
  const urls = [];
  for (const { name, attrs } of tags(html)) {
    if (name === 'link') {
      const rel = (attrs.rel || '').toLowerCase().split(/\s+/);
      if (rel.includes('canonical') || rel.includes('alternate')) continue;
      if (attrs.href) urls.push(attrs.href);
    }
    for (const attr of ['src', 'poster', 'data']) if (attrs[attr]) urls.push(attrs[attr]);
    for (const attr of ['srcset', 'imagesrcset']) {
      if (attrs[attr]) attrs[attr].split(',').forEach((c) => urls.push(c.trim().split(/\s+/)[0]));
    }
  }
  return urls.filter(Boolean);
}

test('site/privacy.html is up to date with PRIVACY.md (run `npm run build:site`)', () => {
  const committed = normalize(fs.readFileSync(OUTPUT, 'utf8'));
  assert.strictEqual(committed, normalize(buildPrivacyPage()), 'site/privacy.html is stale: run `npm run build:site`');
});

test('site pages load no external scripts, styles, fonts or images', () => {
  assert.ok(htmlFiles.includes('index.html') && htmlFiles.includes('privacy.html'));
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(SITE, file), 'utf8');
    const external = loadedUrls(html).filter(isExternal);
    assert.deepStrictEqual(external, [], `${file} loads external resources`);
  }
  const css = fs.readFileSync(path.join(SITE, 'styles.css'), 'utf8');
  assert.ok(!/@import/i.test(css), 'styles.css must not @import');
  const cssUrls = [...css.matchAll(/url\(\s*["']?([^"')]+)/gi)].map((m) => m[1]);
  assert.deepStrictEqual(cssUrls.filter(isExternal), [], 'styles.css loads external resources');
});

// The only script allowed anywhere is the same-origin theme switch, loaded as a plain blocking
// <script src="/theme.js"></script> in <head> (script-src 'self' in site/_headers).
const THEME_SCRIPT = '<script src="/theme.js"></script>';

test('site pages follow the Content-Security-Policy (no inline scripts or styles)', () => {
  for (const file of htmlFiles) {
    const html = normalize(fs.readFileSync(path.join(SITE, file), 'utf8'));
    for (const { name, attrs } of tags(html)) {
      if (name === 'script') {
        assert.deepStrictEqual(attrs, { src: '/theme.js' }, `${file} has a <script> other than ${THEME_SCRIPT}`);
      }
      assert.notStrictEqual(name, 'style', `${file} contains a <style> element`);
      assert.ok(!('style' in attrs), `${file} has an inline style attribute on <${name}>`);
      assert.ok(!Object.keys(attrs).some((k) => /^on[a-z]+$/.test(k)), `${file} has an inline event handler on <${name}>`);
    }
    assert.ok(!/javascript:/i.test(html), `${file} contains a javascript: URL`);
    const scripts = html.match(/<script\b[\s\S]*?<\/script\s*>/gi) || [];
    assert.deepStrictEqual(scripts, [THEME_SCRIPT], `${file} must load exactly ${THEME_SCRIPT} and no inline script`);
    const head = html.slice(0, html.indexOf('</head>'));
    assert.ok(head.includes(THEME_SCRIPT), `${file} must load /theme.js in <head> so the theme applies before first paint`);
  }
});

test('the Content-Security-Policy allows only same-origin scripts', () => {
  const headers = fs.readFileSync(path.join(SITE, '_headers'), 'utf8');
  const csp = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m);
  assert.ok(csp, 'site/_headers must set a Content-Security-Policy');
  const directives = Object.fromEntries(
    csp[1].split(';').map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v.join(' ')])
  );
  assert.strictEqual(directives['default-src'], "'none'");
  assert.strictEqual(directives['script-src'], "'self'");
  assert.strictEqual(directives['style-src'], "'self'");
  assert.strictEqual(directives['img-src'], "'self'");
  assert.ok(!/unsafe-|https?:|\*/i.test(csp[1]), 'the policy must not allow unsafe-* keywords, hosts or wildcards');
});

test('site/theme.js only switches the theme: no cookies, network or external URLs', () => {
  const js = fs.readFileSync(path.join(SITE, 'theme.js'), 'utf8');
  assert.ok(!/document\.cookie|fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\s*\(|\beval\b|new Function/.test(js));
  assert.ok(!/https?:\/\//i.test(js), 'theme.js must not reference URLs');
  assert.ok(js.includes("'pinfold-theme'"), 'theme.js stores the choice under the pinfold-theme key');
});

test('every page has the theme button in its header, hidden until the script runs', () => {
  for (const file of htmlFiles) {
    const all = tags(fs.readFileSync(path.join(SITE, file), 'utf8'));
    const i = all.findIndex((t) => t.name === 'button' && /\btheme-toggle\b/.test(t.attrs.class || ''));
    assert.ok(i > 0, `${file} has no theme toggle button`);
    const button = all[i];
    assert.strictEqual(button.attrs.type, 'button');
    assert.ok(button.attrs['aria-label'], `${file}: the theme toggle needs an accessible name`);
    assert.ok('hidden' in all[i - 1].attrs, `${file}: the theme toggle must be hidden without JavaScript`);
  }
});

test('404.html shares the header and footer of index.html', () => {
  const region = (html, tag) => {
    const text = normalize(html);
    const start = text.indexOf(`<${tag} class="site-${tag}">`);
    const end = text.indexOf(`</${tag}>`, start);
    assert.ok(start >= 0 && end > start, `missing <${tag} class="site-${tag}">`);
    return text.slice(start, end);
  };
  const index = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const notFound = fs.readFileSync(path.join(SITE, '404.html'), 'utf8');
  for (const tag of ['header', 'footer']) assert.strictEqual(region(notFound, tag), region(index, tag), `404.html ${tag} is out of date`);
});

test('every screenshot has a light and a dark version, and the hero image is not lazy', () => {
  const all = tags(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'));
  const imgs = all.filter((t) => t.name === 'img');
  const shots = imgs.filter((t) => /^\/assets\/[a-z]+-(light|dark)\.png$/.test(t.attrs.src || ''));
  assert.strictEqual(shots.length, 8, 'expected light and dark versions of the four screenshots');
  for (const img of shots) {
    const [, theme] = img.attrs.src.match(/-(light|dark)\.png$/);
    const twin = img.attrs.src.replace(/-(light|dark)\.png$/, theme === 'light' ? '-dark.png' : '-light.png');
    assert.ok(shots.some((s) => s.attrs.src === twin), `${img.attrs.src} has no ${twin} counterpart`);
    assert.ok(img.attrs.alt && img.attrs.width && img.attrs.height, `${img.attrs.src} needs alt, width and height`);
    // The only-light / only-dark class sits on the image or on the link wrapped around it.
    const wrapper = all[all.indexOf(img) - 1];
    const classes = `${img.attrs.class || ''} ${wrapper.name === 'a' ? wrapper.attrs.class || '' : ''}`;
    assert.ok(classes.split(/\s+/).includes(`only-${theme}`), `${img.attrs.src} is not marked only-${theme}`);
  }
  const hero = shots.find((t) => t.attrs.src === '/assets/list-light.png');
  assert.ok(hero && hero.attrs.loading !== 'lazy', 'the light hero image must not be lazy-loaded');
  assert.ok(!imgs.some((t) => /\/assets\/0\d-/.test(t.attrs.src || '')), 'old screenshot file names are still referenced');
});

test('local files referenced by site pages exist', () => {
  const routes = { '/': 'index.html', '/privacy': 'privacy.html' };
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(SITE, file), 'utf8');
    const refs = [...loadedUrls(html), ...tags(html).filter((t) => t.name === 'a').map((t) => t.attrs.href || '')];
    for (const ref of refs) {
      if (!ref.startsWith('/') || ref.startsWith('//')) continue;
      const clean = ref.split(/[?#]/)[0] || '/';
      const target = routes[clean] || clean.slice(1);
      assert.ok(fs.existsSync(path.join(SITE, target)), `${file} references missing ${ref}`);
    }
  }
});

test('markdownToHtml handles the constructs PRIVACY.md uses', () => {
  const md = [
    '# Title',
    '',
    'Some **bold** text with `code`, a [link](https://example.com) and a [file](LICENSE).',
    'Second line <b> & https://github.com/Tektrix/pinfold/issues.',
    '',
    '- **Item:** one',
    '- two',
    '',
    '| Col | Notes |',
    '|---|---|',
    '| `a \\| b` | cell |',
  ].join('\n');
  assert.strictEqual(
    markdownToHtml(md),
    [
      '<h1 id="title">Title</h1>',
      '<p>Some <strong>bold</strong> text with <code>code</code>, a <a href="https://example.com">link</a> and a ' +
        '<a href="https://github.com/Tektrix/pinfold/blob/main/LICENSE">file</a>.\n' +
        'Second line &lt;b&gt; &amp; <a href="https://github.com/Tektrix/pinfold/issues">https://github.com/Tektrix/pinfold/issues</a>.</p>',
      '<ul>\n<li><strong>Item:</strong> one</li>\n<li>two</li>\n</ul>',
      '<div class="table-wrap">\n<table>\n<thead>\n<tr><th>Col</th><th>Notes</th></tr>\n</thead>\n<tbody>\n' +
        '<tr><td><code>a | b</code></td><td>cell</td></tr>\n</tbody>\n</table>\n</div>',
    ].join('\n')
  );
});

test('markdownToHtml drops unsafe link schemes', () => {
  assert.strictEqual(markdownToHtml('[x](javascript:void)'), '<p>x</p>');
  assert.strictEqual(markdownToHtml('[x](data:text/html,hi)'), '<p>x</p>');
});
