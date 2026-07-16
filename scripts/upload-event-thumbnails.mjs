import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_SOURCE_DIR = path.join(repoRoot, 'thumbnails_event');
const DEFAULT_EVENTS_PATH = path.join(
  repoRoot,
  'crawData/stage4b_curate_tree/output/phase2/core_events.jsonl',
);
const DEFAULT_MANIFEST_PATH = path.join(
  repoRoot,
  'crawData/stage4b_curate_tree/output/phase2/event_thumbnail_upload_manifest.json',
);
const DEFAULT_CLOUDINARY_FOLDER = 'event-thumbnails';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

function parseArgs(argv) {
  const args = {
    sourceDir: DEFAULT_SOURCE_DIR,
    eventsPath: DEFAULT_EVENTS_PATH,
    manifestPath: DEFAULT_MANIFEST_PATH,
    cloudinaryFolder: DEFAULT_CLOUDINARY_FOLDER,
    dryRun: false,
    upload: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--source-dir') args.sourceDir = path.resolve(argv[++i]);
    else if (arg === '--events-path') args.eventsPath = path.resolve(argv[++i]);
    else if (arg === '--manifest') args.manifestPath = path.resolve(argv[++i]);
    else if (arg === '--cloudinary-folder') args.cloudinaryFolder = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--upload') args.upload = true;
    else if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.dryRun && !args.upload) args.dryRun = true;
  if (args.dryRun && args.upload) {
    throw new Error('Use either --dry-run or --upload, not both.');
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/upload-event-thumbnails.mjs --dry-run
  node scripts/upload-event-thumbnails.mjs --upload

Options:
  --source-dir <path>          Defaults to thumbnails_event
  --events-path <path>         Defaults to crawData/stage4b_curate_tree/output/phase2/core_events.jsonl
  --manifest <path>            Defaults to crawData/stage4b_curate_tree/output/phase2/event_thumbnail_upload_manifest.json
  --cloudinary-folder <name>   Defaults to event-thumbnails

Env:
  CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
  Values are read from process env, backend/.env, then .env.
`);
}

async function loadEnvFile(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function loadCloudinaryEnv() {
  await loadEnvFile(path.join(repoRoot, 'backend/.env'));
  await loadEnvFile(path.join(repoRoot, '.env'));

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary env is incomplete. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    );
  }
  return { cloudName, apiKey, apiSecret };
}

function slugify(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

async function readJsonlEvents(eventsPath) {
  const text = await fs.readFile(eventsPath, 'utf8');
  const trailingNewline = /\r?\n$/.test(text);
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();

  const events = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    events.push({ lineIndex: index, rawLine: line, event: JSON.parse(line) });
  }
  return { lines, events, trailingNewline, newline };
}

function addIndex(index, key, eventRef, reason) {
  if (!key) return;
  const normalized = slugify(key);
  if (!normalized) return;
  if (!index.has(normalized)) index.set(normalized, []);
  const entries = index.get(normalized);
  if (!entries.some((entry) => entry.event.event.id === eventRef.event.id && entry.reason === reason)) {
    entries.push({ event: eventRef, reason });
  }
}

function buildEventIndex(events) {
  const index = new Map();
  for (const eventRef of events) {
    const event = eventRef.event;
    addIndex(index, event.id, eventRef, 'id');
    addIndex(index, event.slug, eventRef, 'slug');
    addIndex(index, event.titles?.primary, eventRef, 'title_slug');
    addIndex(index, event.titles?.short, eventRef, 'short_title_slug');
    for (const alternative of event.titles?.alternatives ?? []) {
      addIndex(index, alternative, eventRef, 'alternative_slug');
    }
  }
  return index;
}

async function loadExistingTitleImageMappings() {
  const mappingPath = path.join(repoRoot, 'frontend/src/data/eventTitleImages.ts');
  const byBasename = new Map();
  try {
    const text = await fs.readFile(mappingPath, 'utf8');
    const regex = /['"]([^'"]+)['"]\s*:\s*['"]\/event-titles\/([^'"]+)['"]/g;
    for (const match of text.matchAll(regex)) {
      const eventKey = match[1];
      const imageStem = path.basename(match[2], path.extname(match[2]));
      if (!byBasename.has(imageStem)) byBasename.set(imageStem, new Set());
      byBasename.get(imageStem).add(eventKey);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return byBasename;
}

async function listImageFiles(sourceDir) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(sourceDir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

async function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  const data = await fs.readFile(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function jpgDimensions(buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return {};
}

function pngDimensions(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function webpDimensions(buffer) {
  const type = buffer.toString('ascii', 12, 16);
  if (type === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (type === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (type === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return {};
}

async function imageDimensions(filePath) {
  const buffer = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.jpg' || ext === '.jpeg') return jpgDimensions(buffer);
    if (ext === '.png') return pngDimensions(buffer);
    if (ext === '.webp') return webpDimensions(buffer);
  } catch {
    return {};
  }
  return {};
}

function resolveByIndex(key, index) {
  const entries = index.get(slugify(key)) ?? [];
  const uniqueEventIds = new Set(entries.map((entry) => entry.event.event.id));
  if (uniqueEventIds.size === 1) return { status: 'matched', entry: entries[0], candidates: entries };
  if (uniqueEventIds.size > 1) return { status: 'ambiguous', candidates: entries };
  return { status: 'unmatched', candidates: [] };
}

function resolveImage(filePath, eventIndex, mappingByBasename) {
  const sourceFilename = path.basename(filePath);
  const stem = path.basename(sourceFilename, path.extname(sourceFilename));

  const direct = resolveByIndex(stem, eventIndex);
  if (direct.status !== 'unmatched') return { ...direct, sourceFilename, stem };

  const mappedKeys = [...(mappingByBasename.get(stem) ?? [])];
  const mappedCandidates = mappedKeys.flatMap((key) => resolveByIndex(key, eventIndex).candidates);
  const mappedUniqueIds = new Set(mappedCandidates.map((entry) => entry.event.event.id));
  if (mappedUniqueIds.size === 1) {
    return {
      status: 'matched',
      sourceFilename,
      stem,
      entry: mappedCandidates[0],
      candidates: mappedCandidates,
      mappingSource: 'eventTitleImages',
    };
  }
  if (mappedUniqueIds.size > 1) {
    return { status: 'ambiguous', sourceFilename, stem, candidates: mappedCandidates, mappingSource: 'eventTitleImages' };
  }

  return { status: 'unmatched', sourceFilename, stem, candidates: [] };
}

function cloudinaryPublicId(folder, eventKey) {
  return `${folder.replace(/^\/+|\/+$/g, '')}/${slugify(eventKey)}`;
}

function signCloudinaryParams(params, apiSecret) {
  const toSign = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');
}

async function uploadToCloudinary({ filePath, publicId, cloudinary }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    public_id: publicId,
    overwrite: 'true',
    unique_filename: 'false',
    use_filename: 'false',
    timestamp,
  };
  const signature = signCloudinaryParams(params, cloudinary.apiSecret);
  const form = new FormData();
  form.set('file', new Blob([await fs.readFile(filePath)]), path.basename(filePath));
  form.set('api_key', cloudinary.apiKey);
  form.set('timestamp', String(timestamp));
  form.set('signature', signature);
  form.set('public_id', publicId);
  form.set('overwrite', 'true');
  form.set('unique_filename', 'false');
  form.set('use_filename', 'false');

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error?.message || `Cloudinary upload failed with HTTP ${response.status}`);
  }
  return body;
}

async function readPreviousManifest(manifestPath) {
  try {
    const parsed = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const rows = Array.isArray(parsed.items) ? parsed.items : [];
    const byFilename = new Map();
    for (const row of rows) byFilename.set(row.source_filename, row);
    return byFilename;
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }
}

function updateEventThumbnail(eventRef, secureUrl) {
  const event = eventRef.event;
  if (!event.media || typeof event.media !== 'object') event.media = {};
  event.media.thumbnail = secureUrl;
  if (!Array.isArray(event.media.items)) event.media.items = [];
}

async function writeJsonl(eventsPath, lines, events, newline, trailingNewline) {
  for (const eventRef of events) {
    lines[eventRef.lineIndex] = JSON.stringify(eventRef.event);
  }
  await fs.writeFile(eventsPath, `${lines.join(newline)}${trailingNewline ? newline : ''}`, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { lines, events, trailingNewline, newline } = await readJsonlEvents(args.eventsPath);
  const eventIndex = buildEventIndex(events);
  const mappingByBasename = await loadExistingTitleImageMappings();
  const files = await listImageFiles(args.sourceDir);
  const previousManifest = await readPreviousManifest(args.manifestPath);
  const cloudinary = args.upload ? await loadCloudinaryEnv() : null;

  const items = [];
  let changedEvents = 0;
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let unmatched = 0;
  let ambiguous = 0;
  let dryRunMatched = 0;

  for (const filePath of files) {
    const sourceFilename = path.basename(filePath);
    const hash = await sha256(filePath);
    const dimensions = await imageDimensions(filePath);
    const resolution = resolveImage(filePath, eventIndex, mappingByBasename);
    const baseRow = {
      source_filename: sourceFilename,
      source_path: path.relative(repoRoot, filePath).replaceAll('\\', '/'),
      source_sha256: hash,
      width: dimensions.width ?? null,
      height: dimensions.height ?? null,
      resolved_event_key: null,
      resolved_event_id: null,
      resolved_event_slug: null,
      match_reason: null,
      cloudinary_public_id: null,
      secure_url: null,
      status: null,
      error: null,
    };

    if (resolution.status === 'unmatched') {
      unmatched += 1;
      items.push({ ...baseRow, status: 'unmatched', error: 'No unique event id/slug/title/mapping match.' });
      continue;
    }

    if (resolution.status === 'ambiguous') {
      ambiguous += 1;
      items.push({
        ...baseRow,
        status: 'ambiguous',
        error: `Ambiguous candidates: ${resolution.candidates.map((entry) => entry.event.event.id).join(', ')}`,
      });
      continue;
    }

    const eventRef = resolution.entry.event;
    const event = eventRef.event;
    const eventKey = event.slug || event.id;
    const publicId = cloudinaryPublicId(args.cloudinaryFolder, eventKey);
    const row = {
      ...baseRow,
      resolved_event_key: eventKey,
      resolved_event_id: event.id,
      resolved_event_slug: event.slug ?? null,
      match_reason: resolution.mappingSource ?? resolution.entry.reason,
      cloudinary_public_id: publicId,
    };

    if (args.dryRun) {
      dryRunMatched += 1;
      items.push({ ...row, status: 'dry_run' });
      continue;
    }

    const previous = previousManifest.get(sourceFilename);
    if (
      previous?.status === 'uploaded' &&
      previous.source_sha256 === hash &&
      previous.cloudinary_public_id === publicId &&
      previous.secure_url
    ) {
      skipped += 1;
      updateEventThumbnail(eventRef, previous.secure_url);
      changedEvents += 1;
      items.push({ ...row, secure_url: previous.secure_url, status: 'skipped_existing_manifest' });
      continue;
    }

    try {
      const result = await uploadToCloudinary({ filePath, publicId, cloudinary });
      const secureUrl = result.secure_url;
      uploaded += 1;
      updateEventThumbnail(eventRef, secureUrl);
      changedEvents += 1;
      items.push({
        ...row,
        secure_url: secureUrl,
        width: result.width ?? row.width,
        height: result.height ?? row.height,
        status: 'uploaded',
      });
    } catch (error) {
      failed += 1;
      items.push({ ...row, status: 'failed', error: error.message });
    }
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    dry_run: args.dryRun,
    source_dir: path.relative(repoRoot, args.sourceDir).replaceAll('\\', '/'),
    events_path: path.relative(repoRoot, args.eventsPath).replaceAll('\\', '/'),
    cloudinary_folder: args.cloudinaryFolder,
    summary: {
      total_files: files.length,
      uploaded,
      skipped,
      failed,
      unmatched,
      ambiguous,
      dry_run_matched: dryRunMatched,
      changed_events: args.dryRun ? 0 : changedEvents,
    },
    items,
  };

  await fs.mkdir(path.dirname(args.manifestPath), { recursive: true });
  await fs.writeFile(args.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  if (!args.dryRun && changedEvents > 0) {
    await writeJsonl(args.eventsPath, lines, events, newline, trailingNewline);
  }

  console.log(JSON.stringify(manifest.summary, null, 2));
  console.log(`Manifest: ${path.relative(repoRoot, args.manifestPath)}`);
  if (failed > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
