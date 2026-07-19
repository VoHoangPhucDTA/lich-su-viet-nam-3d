import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildDatasetMetadata,
  canonicalHash,
  canonicalizeJson,
} from '../lib/examDatasetBuild.mjs';
import { parseStrictJson } from '../lib/strictJson.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureFile = path.resolve(scriptDir, '../../../data/exam-build-fixtures/rfc8785-vectors.json');

test('shared RFC 8785 vectors produce expected bytes and hashes', async () => {
  const fixture = JSON.parse(await fs.readFile(fixtureFile, 'utf8'));
  for (const vector of fixture.vectors) {
    const parsed = parseStrictJson(vector.input, vector.name);
    assert.equal(canonicalizeJson(parsed, vector.name), vector.expectedCanonical, vector.name);
    assert.equal(canonicalHash(parsed, vector.name).sha256, vector.expectedSha256, vector.name);
  }
});

test('strict parser rejects duplicate properties before JSON.parse', async () => {
  const fixture = JSON.parse(await fs.readFile(fixtureFile, 'utf8'));
  for (const vector of fixture.invalid) {
    assert.throws(() => parseStrictJson(vector.input, vector.name), /duplicate|duplicated/i);
  }
});

test('aggregate hash is deterministic and excludes audit metadata', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'exam-dataset-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, 'data/exams');
  const artifactDir = path.join(root, 'frontend/public/data/exams');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'b.json'), '{"z":1,"a":2}', 'utf8');
  await fs.writeFile(path.join(sourceDir, 'a.json'), '{"examId":"a"}', 'utf8');
  for (const name of ['exams-manifest.json', 'topic-index.json', 'topic-raw-mapping.json']) {
    await fs.writeFile(path.join(artifactDir, name), '{}', 'utf8');
  }

  const first = await buildDatasetMetadata({
    repoRoot: root,
    sourceDir,
    artifactDir,
    now: new Date('2026-01-01T00:00:00Z'),
    buildId: 'build-one',
  });
  const second = await buildDatasetMetadata({
    repoRoot: root,
    sourceDir,
    artifactDir,
    now: new Date('2027-01-01T00:00:00Z'),
    buildId: 'build-two',
  });

  assert.equal(first.aggregateHash, second.aggregateHash);
  assert.notEqual(first.buildId, second.buildId);
  assert.notEqual(first.generatedAt, second.generatedAt);
  assert.deepEqual(first.sources.map((source) => source.path), ['data/exams/a.json', 'data/exams/b.json']);

  await fs.writeFile(path.join(sourceDir, 'a.json'), '{"examId":"changed"}', 'utf8');
  const changedSource = await buildDatasetMetadata({ repoRoot: root, sourceDir, artifactDir });
  assert.notEqual(changedSource.aggregateHash, first.aggregateHash);

  await fs.writeFile(path.join(sourceDir, 'a.json'), '{"examId":"a"}', 'utf8');
  await fs.writeFile(path.join(artifactDir, 'topic-index.json'), '{"tampered":true}', 'utf8');
  const changedArtifact = await buildDatasetMetadata({ repoRoot: root, sourceDir, artifactDir });
  assert.notEqual(changedArtifact.aggregateHash, first.aggregateHash);
});
