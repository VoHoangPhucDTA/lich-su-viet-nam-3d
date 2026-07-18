import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import canonicalize from 'canonicalize';
import { parseStrictJson } from './strictJson.mjs';

export const HASH_ALGORITHM = 'SHA-256';
export const HASH_SCHEMA_VERSION = 1;
export const BUILD_ALGORITHM_VERSION = 1;
export const CANONICALIZATION = 'RFC8785';

export function canonicalizeJson(value, sourceName = 'JSON value') {
  const canonical = canonicalize(value);
  if (typeof canonical !== 'string') {
    throw new Error(`${sourceName}: value cannot be canonicalized as RFC 8785 JSON`);
  }
  return canonical;
}

export function sha256Utf8(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function canonicalHash(value, sourceName) {
  const canonical = canonicalizeJson(value, sourceName);
  return { canonical, sha256: sha256Utf8(canonical) };
}

export async function hashJsonFile(filePath, displayPath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const value = parseStrictJson(raw, displayPath);
  const { sha256 } = canonicalHash(value, displayPath);
  return {
    path: displayPath.replaceAll('\\', '/'),
    sha256,
    byteLength: Buffer.byteLength(raw, 'utf8'),
  };
}

export async function buildDatasetMetadata({ repoRoot, sourceDir, artifactDir, now = new Date(), buildId = randomUUID() }) {
  const sourceNames = (await fs.readdir(sourceDir))
    .filter((name) => name.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));

  if (sourceNames.length === 0) {
    throw new Error(`No exam JSON sources found in ${sourceDir}`);
  }

  const sources = [];
  for (const name of sourceNames) {
    const absolutePath = path.join(sourceDir, name);
    const relativePath = path.relative(repoRoot, absolutePath).replaceAll('\\', '/');
    sources.push(await hashJsonFile(absolutePath, relativePath));
  }

  const artifactNames = ['exams-manifest.json', 'topic-index.json', 'topic-raw-mapping.json'];
  const artifacts = {};
  for (const name of artifactNames) {
    const absolutePath = path.join(artifactDir, name);
    const result = await hashJsonFile(absolutePath, name);
    artifacts[name] = { sha256: result.sha256, byteLength: result.byteLength };
  }

  const aggregateInput = {
    hashSchemaVersion: HASH_SCHEMA_VERSION,
    buildAlgorithmVersion: BUILD_ALGORITHM_VERSION,
    sources: sources.map(({ path: sourcePath, sha256 }) => ({ path: sourcePath, sha256 })),
    artifacts: Object.fromEntries(
      artifactNames.map((name) => [name, { sha256: artifacts[name].sha256 }])
    ),
  };
  const aggregateHash = canonicalHash(aggregateInput, 'dataset aggregate input').sha256;

  return {
    buildId,
    generatedAt: now.toISOString(),
    hashAlgorithm: HASH_ALGORITHM,
    canonicalization: CANONICALIZATION,
    canonicalizationImplementation: 'canonicalize@3.0.0',
    duplicateKeyValidator: 'json-dup-key-validator@1.0.3',
    hashSchemaVersion: HASH_SCHEMA_VERSION,
    buildAlgorithmVersion: BUILD_ALGORITHM_VERSION,
    aggregateHash,
    sources,
    artifacts,
  };
}
