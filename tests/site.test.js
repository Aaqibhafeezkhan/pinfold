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

test('site pages follow the Content-Security-Policy (no inline scripts or styles)', () => {
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(SITE, file), 'utf8');
    for (const { name, attrs } of tags(html)) {
      assert.notStrictEqual(name, 'script', `${file} contains a <script>`);
      assert.notStrictEqual(name, 'style', `${file} contains a <style> element`);
      assert.ok(!('style' in attrs), `${file} has an inline style attribute on <${name}>`);
      assert.ok(!Object.keys(attrs).some((k) => /^on[a-z]+$/.test(k)), `${file} has an inline event handler on <${name}>`);
    }
  }
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
