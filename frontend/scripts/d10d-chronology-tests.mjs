import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(rootDir, 'src', 'utils', 'chronology.ts');
const outDir = path.join(rootDir, 'node_modules', '.tmp', 'd10d-chronology-tests');
const outPath = path.join(outDir, 'chronology.mjs');

await mkdir(outDir, { recursive: true });
const source = await readFile(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: sourcePath,
});
await writeFile(outPath, compiled.outputText, 'utf8');

const chronology = await import(pathToFileURL(outPath));

function event(overrides) {
  return {
    id: 'event',
    name: 'Event',
    description: '',
    startYear: null,
    endYear: null,
    effectiveEndYear: null,
    eventType: 'cultural',
    geoType: 'no_location',
    parentId: null,
    orderInParent: 0,
    ...overrides,
  };
}

test('normalizes API and raw chronology without null-to-zero conversion', () => {
  assert.deepEqual(
    chronology.normalizeChronology({ startYear: 1601, endYear: 1833, displayDate: '1601-1833' }),
    { startYear: 1601, endYear: 1833, effectiveEndYear: 1833, displayDate: '1601-1833' }
  );
  assert.deepEqual(
    chronology.normalizeChronology({ startYear: 1945, endYear: null }),
    { startYear: 1945, endYear: null, effectiveEndYear: 1945, displayDate: '1945' }
  );
  assert.deepEqual(
    chronology.normalizeChronology({ startYear: null, endYear: 1945, effectiveEndYear: 1945, displayDate: 'Cuối chiến tranh' }),
    { startYear: null, endYear: 1945, effectiveEndYear: 1945, displayDate: 'Cuối chiến tranh' }
  );
  assert.deepEqual(
    chronology.normalizeChronology({ startYear: null, endYear: null }),
    { startYear: null, endYear: null, effectiveEndYear: null, displayDate: chronology.UNKNOWN_DATE_LABEL }
  );
  assert.equal(chronology.normalizeChronology({ startYear: -500, endYear: -401 }).startYear, -500);
});

test('derives effective end with the accepted fallback chain', () => {
  assert.equal(chronology.deriveEffectiveEndYear({ startYear: 1601, endYear: 1833, effectiveEndYear: 1833 }), 1833);
  assert.equal(chronology.deriveEffectiveEndYear({ startYear: 1945, endYear: null }), 1945);
  assert.equal(chronology.deriveEffectiveEndYear({ startYear: null, endYear: 1945 }), 1945);
  assert.equal(chronology.deriveEffectiveEndYear({ startYear: null, endYear: null }), null);
});

test('matches FILTER F1 for year, range, and one-sided filters', () => {
  const interval = { startYear: 1601, endYear: 1833, effectiveEndYear: 1833 };
  const point = { startYear: 1945, endYear: null, effectiveEndYear: 1945 };
  const partialEndKnown = { startYear: null, endYear: 1945, effectiveEndYear: 1945 };
  const fullyNull = { startYear: null, endYear: null, effectiveEndYear: null };
  const bce = { startYear: -500, endYear: -401, effectiveEndYear: -401 };

  assert.equal(chronology.matchesNumericFilter(interval, { year: 1700 }), true);
  assert.equal(chronology.matchesNumericFilter(point, { year: 1945 }), true);
  assert.equal(chronology.matchesNumericFilter(partialEndKnown, { year: 1945 }), false);
  assert.equal(chronology.matchesNumericFilter(fullyNull, { year: 1945 }), false);
  assert.equal(chronology.matchesNumericFilter(bce, { fromYear: -450, toYear: -420 }), true);
  assert.equal(chronology.matchesNumericFilter(interval, { fromYear: 1800 }), true);
  assert.equal(chronology.matchesNumericFilter(interval, { toYear: 1500 }), false);
  assert.equal(chronology.matchesNumericFilter(interval, {}), false);
});

test('sorts dated records first and null-start records last with stable ordering', () => {
  const sorted = [
    event({ id: 'undated-b', name: 'B', startYear: null, orderInParent: 2 }),
    event({ id: 'ce', name: 'CE', startYear: 1945, effectiveEndYear: 1945 }),
    event({ id: 'bce', name: 'BCE', startYear: -500, endYear: -401, effectiveEndYear: -401 }),
    event({ id: 'undated-a', name: 'A', startYear: null, orderInParent: 1 }),
  ].sort(chronology.compareChronologyS1);

  assert.deepEqual(sorted.map((item) => item.id), ['bce', 'ce', 'undated-a', 'undated-b']);

  const hierarchySorted = [
    event({ id: 'late', name: 'Late', startYear: 100, orderInParent: 2 }),
    event({ id: 'early', name: 'Early', startYear: 200, orderInParent: 1 }),
  ].sort(chronology.compareHierarchyChronology);
  assert.deepEqual(hierarchySorted.map((item) => item.id), ['early', 'late']);
});

test('extracts timeline years only from real numeric starts', () => {
  assert.deepEqual(
    chronology.timelineYearsFromEvents([
      { startYear: null },
      { startYear: -500 },
      { startYear: 1945 },
      { startYear: 1945 },
      { startYear: undefined },
    ]),
    [-500, 1945]
  );
});

test('splits undated/contextual records into the final deterministic group', () => {
  assert.equal(chronology.UNDATED_CONTEXT_GROUP_LABEL, 'Không rõ / theo ngữ cảnh');
  const split = chronology.splitDatedAndUndated([
    event({ id: 'undated-b', name: 'B', startYear: null, orderInParent: 2 }),
    event({ id: 'dated', name: 'Dated', startYear: 938, effectiveEndYear: 938 }),
    event({ id: 'undated-a', name: 'A', startYear: null, orderInParent: 1 }),
  ]);

  assert.deepEqual(split.dated.map((item) => item.id), ['dated']);
  assert.deepEqual(split.undated.map((item) => item.id), ['undated-a', 'undated-b']);
});

test('renders display dates first and never renders year zero for null chronology', () => {
  assert.equal(chronology.formatChronologyLabel({ startYear: null, endYear: null, displayDate: 'Theo ngữ cảnh' }), 'Theo ngữ cảnh');
  assert.equal(chronology.formatChronologyLabel({ startYear: null, endYear: null }), chronology.UNKNOWN_DATE_LABEL);
  assert.equal(chronology.formatChronologyLabel({ startYear: -208, endYear: -112 }), '208 TCN – 112 TCN');
  assert.equal(chronology.formatChronologyLabel({ startYear: null, endYear: null }).includes('0'), false);
  assert.equal(chronology.formatChronologyLabel({ startYear: null, endYear: null }).includes('NaN'), false);
});
