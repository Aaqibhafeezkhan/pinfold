// Builds dist/pinfold-<version>.zip for the Chrome Web Store and Edge Add-ons.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME_DIRS = ['background', 'dashboard', 'options', 'popup', 'utils'];
const HTML_PAGES = ['dashboard/dashboard.html', 'options/options.html', 'popup/popup.html'];
const IGNORED_NAMES = new Set(['Thumbs.db', 'desktop.ini']);

// 1980-01-01 00:00:00, the earliest DOS date, so builds are reproducible
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

function fail(message) {
  console.error(`package: ${message}`);
  process.exit(1);
}

function readJson(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  } catch (err) {
    fail(`cannot read ${rel}: ${err.message}`);
  }
}

function walk(rel) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || IGNORED_NAMES.has(entry.name)) continue;
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(child));
    else if (entry.isFile()) out.push(child);
  }
  return out;
}

function manifestRefs(manifest) {
  const refs = new Set();
  const addIcons = (icons) => Object.values(icons || {}).forEach((p) => refs.add(p));
  addIcons(manifest.icons);
  if (manifest.action) {
    addIcons(manifest.action.default_icon);
    if (manifest.action.default_popup) refs.add(manifest.action.default_popup);
  }
  if (manifest.background && manifest.background.service_worker) refs.add(manifest.background.service_worker);
  if (manifest.options_page) refs.add(manifest.options_page);
  if (manifest.options_ui && manifest.options_ui.page) refs.add(manifest.options_ui.page);
  return [...refs].map((p) => p.replace(/^\.?\//, ''));
}

function htmlRefs(rel) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const refs = [];
  const re = /<(?:script[^>]*\ssrc|link[^>]*\shref)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    if (/^[a-z]+:|^\/\//i.test(m[1])) fail(`${rel} references a remote resource: ${m[1]}`);
    refs.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1].split(/[?#]/)[0])));
  }
  return refs;
}

function buildZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of files) {
    const data = fs.readFileSync(path.join(ROOT, name));
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const crc = zlib.crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, end]);
}

function main() {
  if (typeof zlib.crc32 !== 'function') fail('Node.js 22 or newer is required (zlib.crc32)');

  const manifest = readJson('manifest.json');
  const pkg = readJson('package.json');
  if (!manifest.version) fail('manifest.json has no version');
  if (manifest.version !== pkg.version) {
    fail(`version mismatch: manifest.json is ${manifest.version}, package.json is ${pkg.version}`);
  }

  const refs = manifestRefs(manifest);
  const files = new Set(['manifest.json']);
  for (const dir of RUNTIME_DIRS) walk(dir).forEach((f) => files.add(f));
  refs.filter((f) => f.startsWith('icons/') && f.endsWith('.png')).forEach((f) => files.add(f));

  const missing = [];
  for (const ref of refs) {
    if (!files.has(ref) || !fs.existsSync(path.join(ROOT, ref))) missing.push(`${ref} (manifest.json)`);
  }
  for (const page of HTML_PAGES) {
    if (!files.has(page)) {
      missing.push(page);
      continue;
    }
    for (const ref of htmlRefs(page)) {
      if (!files.has(ref)) missing.push(`${ref} (${page})`);
    }
  }
  if (missing.length) fail(`referenced files missing from the package:\n  ${missing.join('\n  ')}`);

  const sorted = [...files].sort();
  const zip = buildZip(sorted);
  const outDir = path.join(ROOT, 'dist');
  const outFile = path.join(outDir, `pinfold-${manifest.version}.zip`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, zip);

  console.log(`Packaged ${sorted.length} files, ${(zip.length / 1024).toFixed(1)} KB`);
  console.log(path.relative(process.cwd(), outFile) || outFile);
}

main();
