// Builds site/privacy.html from PRIVACY.md, using the header and footer of site/index.html.
// Zero dependencies. Run with `npm run build:site` and commit the result: the website is
// served as plain static files, with no build step on the host.
//
// The Markdown converter is deliberately small. It handles what PRIVACY.md uses: headings,
// paragraphs, bullet and numbered lists, tables, links (and bare URLs), inline code, bold and
// italics, plus fenced code, block quotes and horizontal rules for good measure.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'PRIVACY.md');
const INDEX = path.join(ROOT, 'site', 'index.html');
const OUTPUT = path.join(ROOT, 'site', 'privacy.html');
const REPO_BLOB = 'https://github.com/Tektrix/pinfold/blob/main/';

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Relative links in the repository's Markdown point at files on GitHub.
function resolveHref(href) {
  if (/^(https?:|mailto:)/i.test(href) || href.startsWith('#') || href.startsWith('/')) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null; // any other scheme is dropped
  return REPO_BLOB + href.replace(/^\.\//, '');
}

function inline(text) {
  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;

  let out = text.replace(/`([^`]+)`/g, (_, code) => keep(`<code>${escapeHtml(code)}</code>`));

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const url = resolveHref(href);
    const body = emphasis(escapeHtml(label));
    return keep(url ? `<a href="${escapeHtml(url)}">${body}</a>` : body);
  });

  out = out.replace(/\bhttps?:\/\/[^\s<>()]*[^\s<>().,;:!?'"]/g, (url) =>
    keep(`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`)
  );

  out = emphasis(escapeHtml(out));

  // Restore stashed fragments (a link label can itself contain a stashed code span).
  while (/\u0000\d+\u0000/.test(out)) {
    out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);
  }
  return out;
}

function emphasis(html) {
  return html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?![*\w])/g, '$1<em>$2</em>');
}

function slugify(text, used) {
  const base =
    text
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-z]+;/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'section';
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  used.add(slug);
  return slug;
}

const RE = {
  fence: /^\s*(```|~~~)/,
  heading: /^(#{1,6})\s+(.*?)\s*#*\s*$/,
  hr: /^\s*([-*_])(\s*\1){2,}\s*$/,
  bullet: /^\s*[-*+]\s+(.*)$/,
  ordered: /^\s*\d+[.)]\s+(.*)$/,
  quote: /^\s*>\s?(.*)$/,
  tableRow: /^\s*\|/,
  tableSep: /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/,
};

function splitRow(line) {
  const cells = line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/);
  return cells.map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function startsBlock(line, next) {
  return (
    RE.fence.test(line) ||
    RE.heading.test(line) ||
    RE.hr.test(line) ||
    RE.bullet.test(line) ||
    RE.ordered.test(line) ||
    RE.quote.test(line) ||
    (RE.tableRow.test(line) && next !== undefined && RE.tableSep.test(next))
  );
}

function blocks(lines, used) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    if (RE.fence.test(line)) {
      const marker = line.trim().slice(0, 3);
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) code.push(lines[i++]);
      i++;
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(RE.heading);
    if (heading) {
      const level = heading[1].length;
      const html = inline(heading[2]);
      out.push(`<h${level} id="${slugify(html, used)}">${html}</h${level}>`);
      i++;
      continue;
    }

    if (RE.hr.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    if (RE.tableRow.test(line) && i + 1 < lines.length && RE.tableSep.test(lines[i + 1])) {
      const head = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && RE.tableRow.test(lines[i])) rows.push(splitRow(lines[i++]));
      const cell = (tag, text) => `<${tag}>${inline(text)}</${tag}>`;
      out.push(
        [
          '<div class="table-wrap">',
          '<table>',
          '<thead>',
          `<tr>${head.map((c) => cell('th', c)).join('')}</tr>`,
          '</thead>',
          '<tbody>',
          ...rows.map((r) => `<tr>${head.map((_, n) => cell('td', r[n] || '')).join('')}</tr>`),
          '</tbody>',
          '</table>',
          '</div>',
        ].join('\n')
      );
      continue;
    }

    if (RE.bullet.test(line) || RE.ordered.test(line)) {
      const ordered = !RE.bullet.test(line);
      const itemRe = ordered ? RE.ordered : RE.bullet;
      const items = [];
      while (i < lines.length) {
        const current = lines[i];
        const item = current.match(itemRe);
        if (item) {
          items.push([item[1]]);
          i++;
        } else if (current.trim() && /^\s+/.test(current) && items.length) {
          items[items.length - 1].push(current.trim()); // continuation line
          i++;
        } else if (!current.trim() && i + 1 < lines.length && itemRe.test(lines[i + 1])) {
          i++; // blank line between items of the same list
        } else {
          break;
        }
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(
        [`<${tag}>`, ...items.map((parts) => `<li>${inline(parts.join(' '))}</li>`), `</${tag}>`].join('\n')
      );
      continue;
    }

    if (RE.quote.test(line)) {
      const quoted = [];
      while (i < lines.length && RE.quote.test(lines[i])) quoted.push(lines[i++].match(RE.quote)[1]);
      out.push(['<blockquote>', ...blocks(quoted, used), '</blockquote>'].join('\n'));
      continue;
    }

    const para = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) {
      para.push(lines[i++].trim());
    }
    out.push(`<p>${inline(para.join('\n'))}</p>`);
  }
  return out;
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  return blocks(lines, new Set()).join('\n');
}

function extractRegion(html, name) {
  const re = new RegExp(`<!-- ${name}:start[^>]*-->\\n([\\s\\S]*?)\\n[ \\t]*<!-- ${name}:end -->`);
  const match = html.replace(/\r\n?/g, '\n').match(re);
  if (!match) throw new Error(`site/index.html is missing the <!-- ${name}:start --> / <!-- ${name}:end --> markers`);
  return match[1];
}

function indent(html, spaces) {
  const pad = ' '.repeat(spaces);
  return html
    .split('\n')
    .map((line) => (line ? pad + line : line))
    .join('\n');
}

function renderPrivacyPage({ markdown, indexHtml }) {
  const header = extractRegion(indexHtml, 'site-header');
  const footer = extractRegion(indexHtml, 'site-footer');
  const body = markdownToHtml(markdown);
  const description =
    "Pinfold's privacy policy: what data the extension accesses, where it is stored, and how to delete it. Everything stays on your device.";

  return `<!doctype html>
<!-- Generated from PRIVACY.md by scripts/build-privacy-page.js. Do not edit by hand: run \`npm run build:site\`. -->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Privacy policy · Pinfold</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="https://pinfold.page/privacy">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#f7f7fc">
  <link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
  <link rel="icon" href="/assets/icon32.png" sizes="32x32" type="image/png">
  <link rel="apple-touch-icon" href="/assets/icon128.png">
  <link rel="stylesheet" href="/styles.css">
  <script src="/theme.js"></script>

  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Pinfold">
  <meta property="og:title" content="Pinfold privacy policy">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="https://pinfold.page/privacy">
  <meta property="og:image" content="https://pinfold.page/assets/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Pinfold logo with the tagline: a private, local-first tab manager.">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Pinfold privacy policy">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="https://pinfold.page/assets/og-image.png">
  <meta name="twitter:image:alt" content="Pinfold logo with the tagline: a private, local-first tab manager.">
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>

${header}

  <main id="main" class="doc">
    <div class="container">
      <article class="prose">
${indent(body, 8)}
        <p><a class="back-link" href="/">&larr; Back to the Pinfold home page</a></p>
      </article>
    </div>
  </main>

${footer}
</body>
</html>
`;
}

function buildPrivacyPage() {
  return renderPrivacyPage({
    markdown: fs.readFileSync(SOURCE, 'utf8'),
    indexHtml: fs.readFileSync(INDEX, 'utf8'),
  });
}

if (require.main === module) {
  fs.writeFileSync(OUTPUT, buildPrivacyPage());
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
}

module.exports = { markdownToHtml, renderPrivacyPage, buildPrivacyPage, OUTPUT };
