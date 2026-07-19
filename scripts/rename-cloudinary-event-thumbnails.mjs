import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_FOLDER = 'historical_events_thumbnail1';
const EVENTS_PATH = path.join(repoRoot, 'crawData/stage4b_curate_tree/output/phase2/core_events.jsonl');

function parseArgs(argv) {
  const args = { apply: false, limit: Number.POSITIVE_INFINITY };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--apply') args.apply = true;
    else if (argv[index] === '--dry-run') args.apply = false;
    else if (argv[index] === '--limit') args.limit = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (args.limit !== Number.POSITIVE_INFINITY && (!Number.isInteger(args.limit) || args.limit <= 0)) {
    throw new Error('--limit must be a positive integer.');
  }
  return args;
}

async function loadEnvFile(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function loadCloudinaryEnv() {
  await loadEnvFile(path.join(repoRoot, 'backend/.env'));
  await loadEnvFile(path.join(repoRoot, '.env'));
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = process.env;
  if (!cloudName || !apiKey || !apiSecret) throw new Error('Cloudinary env is incomplete.');
  return { cloudName, apiKey, apiSecret };
}

function signature(params, secret) {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return crypto.createHash('sha1').update(payload + secret).digest('hex');
}

function authHeader({ apiKey, apiSecret }) {
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
}

async function readEventIds() {
  const text = await fs.readFile(EVENTS_PATH, 'utf8');
  return new Set(text.trim().split(/\r?\n/).map((line) => JSON.parse(line).id));
}

async function listFolderAssets(cloudinary) {
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/resources/search`, {
    method: 'POST',
    headers: { Authorization: authHeader(cloudinary), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expression: `asset_folder:${ASSET_FOLDER}`, max_results: 500 }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || `Cloudinary search failed with HTTP ${response.status}`);
  if (body.next_cursor) throw new Error('Expected all thumbnail assets in one page; pagination is required.');
  return body.resources;
}

function buildRenamePlan(resources, eventIds) {
  const suffixPattern = /_([A-Za-z0-9]{6,})$/;
  const seenIds = new Set();
  const plan = [];
  let alreadyRenamed = 0;
  for (const resource of resources) {
    if (resource.public_id.startsWith(`${ASSET_FOLDER}/`)) {
      const eventId = resource.public_id.slice(ASSET_FOLDER.length + 1);
      if (!eventIds.has(eventId)) throw new Error(`No event matches renamed Cloudinary public ID: ${resource.public_id}`);
      if (seenIds.has(eventId)) throw new Error(`Multiple Cloudinary assets map to event: ${eventId}`);
      seenIds.add(eventId);
      alreadyRenamed += 1;
      continue;
    }
    const match = resource.public_id.match(suffixPattern);
    if (!match) throw new Error(`Unexpected public ID without generated suffix: ${resource.public_id}`);
    const eventId = resource.public_id.slice(0, -match[0].length);
    if (!eventIds.has(eventId)) throw new Error(`No event matches Cloudinary public ID: ${resource.public_id}`);
    if (seenIds.has(eventId)) throw new Error(`Multiple Cloudinary assets map to event: ${eventId}`);
    seenIds.add(eventId);
    plan.push({ fromPublicId: resource.public_id, toPublicId: `${ASSET_FOLDER}/${eventId}` });
  }
  if (resources.length !== eventIds.size || seenIds.size !== eventIds.size) {
    throw new Error(`Coverage mismatch: ${resources.length} assets and ${seenIds.size} mapped IDs for ${eventIds.size} event IDs.`);
  }
  return { plan, alreadyRenamed };
}

async function renameAsset(cloudinary, entry) {
  const params = {
    from_public_id: entry.fromPublicId,
    to_public_id: entry.toPublicId,
    overwrite: 'false',
    invalidate: 'true',
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  const form = new URLSearchParams({ ...params, api_key: cloudinary.apiKey, signature: signature(params, cloudinary.apiSecret) });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${entry.fromPublicId}: ${body.error?.message || `HTTP ${response.status}`}`);
}

async function main() {
  const { apply, limit } = parseArgs(process.argv.slice(2));
  const cloudinary = await loadCloudinaryEnv();
  const [eventIds, resources] = await Promise.all([readEventIds(), listFolderAssets(cloudinary)]);
  const { plan, alreadyRenamed } = buildRenamePlan(resources, eventIds);
  const batch = plan.slice(0, limit);

  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', eventCount: eventIds.size, assetCount: resources.length, alreadyRenamed, remaining: plan.length, batchSize: batch.length }, null, 2));
    return;
  }

  for (const entry of batch) await renameAsset(cloudinary, entry);
  console.log(JSON.stringify({ mode: 'apply', renamed: batch.length, alreadyRenamed, remainingAfterBatch: plan.length - batch.length, targetFolder: ASSET_FOLDER }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
