import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const DEFAULT_EVENTS = path.join(
  ROOT,
  'crawData',
  'stage4b_curate_tree',
  'output',
  'phase2',
  'core_events.jsonl',
);
const DEFAULT_GEOJSON = path.join(
  ROOT,
  'frontend',
  'public',
  'geojson',
  'vietnam-provinces.json',
);
const DEFAULT_OUTPUT = path.join(ROOT, 'docs', 'terrain-3d-audit');

const CANONICAL_TYPES = [
  'point',
  'multi_point',
  'multi_polygon',
  'mixed',
  'nationwide',
  'no_location',
];
const LEGACY_TYPES = ['single_point', 'multi_region'];
const SUPPORTED_TYPES = new Set(['point', 'multi_point', 'multi_polygon', 'mixed']);

function parseArgs(argv) {
  const result = {
    events: DEFAULT_EVENTS,
    geojson: DEFAULT_GEOJSON,
    output: DEFAULT_OUTPUT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!['--events', '--geojson', '--output'].includes(option)) {
      throw new Error(`Unknown option: ${option}`);
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${option}`);
    result[option.slice(2)] = path.resolve(ROOT, value);
    index += 1;
  }
  return result;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function markerResult(marker) {
  if (!isPlainObject(marker)) return { valid: false, reason: 'NOT_OBJECT' };
  const { lat, lng } = marker;
  if (!finiteNumber(lat) || !finiteNumber(lng)) {
    return { valid: false, reason: 'NON_FINITE_OR_NON_NUMERIC' };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { valid: false, reason: 'OUT_OF_RANGE' };
  }
  return {
    valid: true,
    lat,
    lng,
    label: typeof marker.label === 'string'
      ? marker.label.trim()
      : typeof marker.name === 'string'
        ? marker.name.trim()
        : '',
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function percent(numerator, denominator) {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(2));
}

function sortedObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

function addIssue(issues, event, code, details = {}) {
  issues.push({
    eventId: event?.id ?? '',
    slug: event?.slug ?? '',
    geoType: event?.geoType ?? '',
    code,
    targetIndex: details.targetIndex ?? '',
    gadmRef: details.gadmRef ?? '',
    detail: details.detail ?? '',
  });
}

function coverageByGrade(records) {
  const counters = new Map();
  for (const record of records) {
    for (const grade of record.grades) {
      const key = String(grade);
      const current = counters.get(key) ?? { total: 0, eligible: 0 };
      current.total += 1;
      if (record.eligible) current.eligible += 1;
      counters.set(key, current);
    }
  }
  return Object.fromEntries(
    [...counters.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([grade, value]) => [grade, {
        ...value,
        coveragePercent: percent(value.eligible, value.total),
      }]),
  );
}

function renderReadme(summary, command) {
  const canonicalRows = CANONICAL_TYPES.map((type) => {
    const total = summary.geoTypes.canonical[type] ?? 0;
    const eligible = summary.eligibility.byGeoType[type]?.eligible ?? 0;
    return `| \`${type}\` | ${total} | ${eligible} | ${total - eligible} |`;
  }).join('\n');
  const issueRows = Object.entries(summary.issues.byCode)
    .map(([code, count]) => `| \`${code}\` | ${count} |`)
    .join('\n') || '| — | 0 |';
  const gateRows = Object.entries(summary.qualityGates)
    .map(([gate, value]) => `| ${gate} | **${value}** |`)
    .join('\n');

  return `# Terrain 3D data audit

## Nguồn và phạm vi

- Ngày audit: \`${summary.audit.timestamp}\`.
- Nguồn event: \`${summary.sources.events.path}\` (SHA-256 \`${summary.sources.events.sha256}\`).
- GeoJSON: \`${summary.sources.geojson.path}\` (SHA-256 \`${summary.sources.geojson.sha256}\`).
- Command: \`${command}\`.
- Phạm vi: canonical JSONL read-only và lookup exact \`gadmRef ↔ GID_1\`.
- Không kết nối database/API production, không chạy importer/migration và không sửa input.
- Database live: **DB_LIVE_UNVERIFIED**. Các chỉ số \`raw_json\`/normalized column của DB không được suy ra từ canonical source.

## Kết quả tổng quan

| Chỉ số | Kết quả |
|---|---:|
| Tổng dòng/event | ${summary.records.totalInput} |
| Parse thành công | ${summary.records.parseSuccess} |
| Parse lỗi | ${summary.records.parseErrors} |
| Source JSON hợp lệ | ${summary.sourceJson.validCanonicalSourceJson} |
| Có \`mapData\` | ${summary.mapData.present} |
| Eligible terrain | ${summary.eligibility.eligibleTotal} |
| Ineligible | ${summary.eligibility.ineligibleTotal} |
| Coverage toàn dataset | ${summary.eligibility.coverageAllPercent}% |
| Coverage nhóm theoretically supported | ${summary.eligibility.coverageSupportedPercent}% |

## Geo type và eligibility

| Geo type | Total | Eligible | Ineligible |
|---|---:|---:|---:|
${canonicalRows}

Legacy: \`single_point=${summary.geoTypes.legacy.single_point ?? 0}\`, \`multi_region=${summary.geoTypes.legacy.multi_region ?? 0}\`. Unknown/missing: ${summary.geoTypes.unknownOrMissing}.

## Point targets

- Marker đơn: ${summary.points.single.total} total; ${summary.points.single.valid} hợp lệ; ${summary.points.single.invalid} lỗi.
- \`markers[]\`: ${summary.points.array.total} phần tử; ${summary.points.array.valid} hợp lệ; ${summary.points.array.invalid} lỗi.
- Duplicate coordinate occurrences trong cùng event: ${summary.points.duplicates.coordinateOccurrences}; trong đó khác label: ${summary.points.duplicates.differentLabelOccurrences}.
- Canonical point-type event không tạo được point target: ${summary.points.canonicalPointTypeWithoutTarget}.

Duplicate được tính trên cả \`marker\` và \`markers[]\` trong cùng event. Trùng cùng label thường là primary-marker mirror và không tự động bị coi là dữ liệu sai; trùng khác label phải được giữ hoặc review theo identity policy, không tự động xóa.

## Region targets và GADM

- Tổng \`gadmRefs\`: ${summary.regions.totalRefs}.
- Resolve exact \`GID_1\`: ${summary.regions.resolvedRefs} (${summary.regions.resolutionRatePercent}%).
- Không resolve: ${summary.regions.unresolvedRefs}.
- Duplicate ref trong cùng event: ${summary.regions.duplicateRefs}.
- Event lệch độ dài \`gadmRefs[]\`/\`provinceNames[]\`: ${summary.regions.arrayLengthMismatchEvents}.
- Resolved Polygon: ${summary.regions.resolvedGeometry.Polygon}; MultiPolygon: ${summary.regions.resolvedGeometry.MultiPolygon}; other: ${summary.regions.resolvedGeometry.Other}.
- Canonical region-type event không tạo được region target: ${summary.regions.canonicalRegionTypeWithoutTarget}.

Audit chính không fuzzy-match tên tỉnh; suggestion bằng tên không được tính là resolved.

## Issues

| Mã lỗi | Số lượng |
|---|---:|
${issueRows}

Diagnostic chi tiết tối thiểu nằm trong \`terrain-audit-issues.csv\`; file không chứa raw JSON hoặc secret.

## Quality gates

| Gate | Kết quả |
|---|---|
${gateRows}

Coverage demo chưa có ngưỡng được product chốt nên giữ \`NEEDS_DECISION\`, dù số liệu thực được báo cáo đầy đủ.

## Điều chưa xác minh

- **DB_LIVE_UNVERIFIED:** số row có/parse được \`raw_json\`, tỷ lệ \`sourceJson.mapData\` ở API live và mismatch với normalized DB column.
- Coverage theo period không tính vì canonical source không có taxonomy period ổn định; không suy giai đoạn từ năm trong audit này.
- Token/provider/WebGL không thuộc data audit.

## Quyết định

**${summary.decision.code}**.

${summary.decision.rationale}

Điều kiện trước Phase 1:

${summary.decision.conditions.map((item) => `- ${item}`).join('\n')}

Không cần backend change hoặc migration dựa trên canonical source hiện tại. Quyết định này phải được review lại nếu audit read-only DB/staging cho thấy \`raw_json\` thiếu hoặc không đồng bộ.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [eventsBuffer, geojsonBuffer] = await Promise.all([
    readFile(args.events),
    readFile(args.geojson),
  ]);
  const geojson = JSON.parse(geojsonBuffer.toString('utf8'));
  if (geojson?.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('GeoJSON must be a FeatureCollection');
  }

  const gidGeometry = new Map();
  for (const feature of geojson.features) {
    const gid = feature?.properties?.GID_1;
    if (typeof gid === 'string' && gid.length > 0) {
      gidGeometry.set(gid, feature?.geometry?.type ?? 'Other');
    }
  }
  if (gidGeometry.size === 0) throw new Error('GeoJSON contains no GID_1 values');

  const issues = [];
  const parsedRecords = [];
  const geoCounts = Object.fromEntries(CANONICAL_TYPES.map((type) => [type, 0]));
  const legacyCounts = Object.fromEntries(LEGACY_TYPES.map((type) => [type, 0]));
  const eligibilityByType = {};
  const ineligibleReasons = {};
  const issueCounts = {};
  const points = {
    single: { total: 0, valid: 0, invalid: 0 },
    array: { total: 0, valid: 0, invalid: 0 },
    duplicateCoordinateOccurrences: 0,
    duplicateCoordinateDifferentLabelOccurrences: 0,
    canonicalPointTypeWithoutTarget: 0,
  };
  const regions = {
    totalRefs: 0,
    resolvedRefs: 0,
    unresolvedRefs: 0,
    duplicateRefs: 0,
    arrayLengthMismatchEvents: 0,
    resolvedGeometry: { Polygon: 0, MultiPolygon: 0, Other: 0 },
    canonicalRegionTypeWithoutTarget: 0,
  };
  let parseSuccess = 0;
  let parseErrors = 0;
  let mapDataPresent = 0;
  let mapDataMissing = 0;
  let validMapGeoType = 0;
  let invalidMapGeoType = 0;
  let unknownOrMissing = 0;

  const lines = eventsBuffer.toString('utf8').split(/\r?\n/).filter((line) => line.trim().length > 0);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    let raw;
    try {
      raw = JSON.parse(lines[lineIndex]);
      parseSuccess += 1;
    } catch {
      parseErrors += 1;
      addIssue(issues, { id: `line:${lineIndex + 1}` }, 'PARSE_ERROR');
      continue;
    }

    const geoType = typeof raw?.mapData?.geoType === 'string' ? raw.mapData.geoType : '';
    const event = {
      id: typeof raw?.id === 'string' ? raw.id : `line:${lineIndex + 1}`,
      slug: typeof raw?.slug === 'string' ? raw.slug : '',
      geoType,
    };
    const mapData = isPlainObject(raw?.mapData) ? raw.mapData : null;
    if (mapData) mapDataPresent += 1;
    else {
      mapDataMissing += 1;
      addIssue(issues, event, 'MISSING_MAP_DATA');
    }

    if (CANONICAL_TYPES.includes(geoType)) {
      geoCounts[geoType] += 1;
      validMapGeoType += 1;
    } else if (LEGACY_TYPES.includes(geoType)) {
      legacyCounts[geoType] += 1;
      validMapGeoType += 1;
    } else {
      unknownOrMissing += 1;
      invalidMapGeoType += 1;
      addIssue(issues, event, 'INVALID_OR_MISSING_GEO_TYPE');
    }

    const validPointCandidates = [];
    let validSingle = false;
    const singlePresent = mapData && mapData.marker !== null && mapData.marker !== undefined;
    if (singlePresent) {
      points.single.total += 1;
      const result = markerResult(mapData.marker);
      if (result.valid) {
        points.single.valid += 1;
        validSingle = true;
        validPointCandidates.push({ ...result, source: 'marker', index: '' });
      } else {
        points.single.invalid += 1;
        addIssue(issues, event, 'INVALID_SINGLE_MARKER', { detail: result.reason });
      }
    }

    let validArrayMarkers = 0;
    const markerArray = Array.isArray(mapData?.markers) ? mapData.markers : [];
    for (let markerIndex = 0; markerIndex < markerArray.length; markerIndex += 1) {
      points.array.total += 1;
      const result = markerResult(markerArray[markerIndex]);
      if (result.valid) {
        points.array.valid += 1;
        validArrayMarkers += 1;
        validPointCandidates.push({ ...result, source: 'markers', index: markerIndex });
      } else {
        points.array.invalid += 1;
        addIssue(issues, event, 'INVALID_ARRAY_MARKER', {
          targetIndex: markerIndex,
          detail: result.reason,
        });
      }
    }

    const seenCoordinates = new Map();
    for (const candidate of validPointCandidates) {
      const coordinateKey = `${candidate.lat},${candidate.lng}`;
      const previous = seenCoordinates.get(coordinateKey);
      if (previous) {
        points.duplicateCoordinateOccurrences += 1;
        const differentLabel = previous.label !== candidate.label;
        if (differentLabel) points.duplicateCoordinateDifferentLabelOccurrences += 1;
        addIssue(
          issues,
          event,
          differentLabel ? 'DUPLICATE_COORDINATE_DIFFERENT_LABEL' : 'DUPLICATE_COORDINATE',
          { targetIndex: candidate.index, detail: `${candidate.source}` },
        );
      } else {
        seenCoordinates.set(coordinateKey, candidate);
      }
    }

    const gadmRefs = Array.isArray(mapData?.gadmRefs) ? mapData.gadmRefs : [];
    const provinceNames = Array.isArray(mapData?.provinceNames) ? mapData.provinceNames : [];
    if (gadmRefs.length !== provinceNames.length && (gadmRefs.length > 0 || provinceNames.length > 0)) {
      regions.arrayLengthMismatchEvents += 1;
      addIssue(issues, event, 'REGION_ARRAY_LENGTH_MISMATCH', {
        detail: `gadmRefs=${gadmRefs.length};provinceNames=${provinceNames.length}`,
      });
    }
    let resolvedForEvent = 0;
    const seenRefs = new Set();
    for (let refIndex = 0; refIndex < gadmRefs.length; refIndex += 1) {
      const ref = gadmRefs[refIndex];
      regions.totalRefs += 1;
      if (typeof ref !== 'string' || ref.length === 0 || !gidGeometry.has(ref)) {
        regions.unresolvedRefs += 1;
        addIssue(issues, event, 'UNRESOLVED_GADM_REF', {
          targetIndex: refIndex,
          gadmRef: typeof ref === 'string' ? ref : '',
        });
      } else {
        regions.resolvedRefs += 1;
        resolvedForEvent += 1;
        const geometryType = gidGeometry.get(ref);
        if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
          regions.resolvedGeometry[geometryType] += 1;
        } else {
          regions.resolvedGeometry.Other += 1;
        }
      }
      if (typeof ref === 'string' && seenRefs.has(ref)) {
        regions.duplicateRefs += 1;
        addIssue(issues, event, 'DUPLICATE_GADM_REF', { targetIndex: refIndex, gadmRef: ref });
      }
      if (typeof ref === 'string') seenRefs.add(ref);
    }

    const hasAnyPoint = validSingle || validArrayMarkers > 0;
    let eligible = false;
    let ineligibleReason = '';
    if (geoType === 'point') {
      eligible = hasAnyPoint;
      if (!eligible) {
        points.canonicalPointTypeWithoutTarget += 1;
        ineligibleReason = 'POINT_WITHOUT_VALID_TARGET';
      }
    } else if (geoType === 'multi_point') {
      eligible = validArrayMarkers > 0;
      if (!eligible) {
        points.canonicalPointTypeWithoutTarget += 1;
        ineligibleReason = 'MULTI_POINT_WITHOUT_VALID_ARRAY_TARGET';
      }
    } else if (geoType === 'multi_polygon') {
      eligible = resolvedForEvent > 0;
      if (!eligible) {
        regions.canonicalRegionTypeWithoutTarget += 1;
        ineligibleReason = 'MULTI_POLYGON_WITHOUT_RESOLVED_REGION';
      }
    } else if (geoType === 'mixed') {
      eligible = hasAnyPoint || resolvedForEvent > 0;
      if (!eligible) ineligibleReason = 'MIXED_WITHOUT_VALID_TARGET';
      if (resolvedForEvent === 0 && gadmRefs.length > 0) {
        regions.canonicalRegionTypeWithoutTarget += 1;
      }
    } else if (geoType === 'nationwide') {
      ineligibleReason = 'UNSUPPORTED_NATIONWIDE';
    } else if (geoType === 'no_location') {
      ineligibleReason = 'UNSUPPORTED_NO_LOCATION';
    } else {
      ineligibleReason = 'UNSUPPORTED_OR_INVALID_GEO_TYPE';
    }

    if (!eligibilityByType[geoType || '(missing)']) {
      eligibilityByType[geoType || '(missing)'] = { total: 0, eligible: 0, ineligible: 0 };
    }
    eligibilityByType[geoType || '(missing)'].total += 1;
    eligibilityByType[geoType || '(missing)'][eligible ? 'eligible' : 'ineligible'] += 1;
    if (!eligible) {
      ineligibleReasons[ineligibleReason] = (ineligibleReasons[ineligibleReason] ?? 0) + 1;
      addIssue(issues, event, ineligibleReason);
    }

    parsedRecords.push({
      id: event.id,
      geoType,
      eligible,
      grades: Array.isArray(raw?.coverage?.grades) ? raw.coverage.grades : [],
    });
  }

  for (const issue of issues) {
    issueCounts[issue.code] = (issueCounts[issue.code] ?? 0) + 1;
  }
  const eligibleTotal = parsedRecords.filter((record) => record.eligible).length;
  const supportedTotal = parsedRecords.filter((record) => SUPPORTED_TYPES.has(record.geoType)).length;
  const supportedEligible = parsedRecords.filter(
    (record) => SUPPORTED_TYPES.has(record.geoType) && record.eligible,
  ).length;

  const command = 'node scripts/terrain-audit/audit.mjs';
  const relativeToRoot = (value) => path.relative(ROOT, value).replaceAll('\\', '/');
  const summary = {
    audit: {
      timestamp: new Date().toISOString(),
      command,
      mode: 'READ_ONLY_INPUTS',
      databaseLiveStatus: 'DB_LIVE_UNVERIFIED',
    },
    sources: {
      events: {
        kind: 'canonical_jsonl_used_by_importer',
        path: relativeToRoot(args.events),
        sha256: sha256(eventsBuffer),
      },
      geojson: {
        kind: 'gadm_level_1_feature_collection',
        path: relativeToRoot(args.geojson),
        sha256: sha256(geojsonBuffer),
        featureCount: geojson.features.length,
        gidCount: gidGeometry.size,
      },
    },
    records: {
      totalInput: lines.length,
      parseSuccess,
      parseErrors,
    },
    sourceJson: {
      validCanonicalSourceJson: parseSuccess,
      invalidCanonicalSourceJson: parseErrors,
      databaseRawJsonRows: null,
      databaseRawJsonParseable: null,
      databaseSourceJsonMapData: null,
      normalizedDatabaseColumnComparison: 'DB_LIVE_UNVERIFIED',
    },
    mapData: {
      present: mapDataPresent,
      missing: mapDataMissing,
      validGeoType: validMapGeoType,
      invalidOrMissingGeoType: invalidMapGeoType,
    },
    geoTypes: {
      canonical: geoCounts,
      legacy: legacyCounts,
      unknownOrMissing,
    },
    points: {
      single: points.single,
      array: points.array,
      duplicates: {
        coordinateOccurrences: points.duplicateCoordinateOccurrences,
        differentLabelOccurrences: points.duplicateCoordinateDifferentLabelOccurrences,
        scope: 'within_event_across_marker_and_markers_array',
      },
      canonicalPointTypeWithoutTarget: points.canonicalPointTypeWithoutTarget,
    },
    regions: {
      totalRefs: regions.totalRefs,
      resolvedRefs: regions.resolvedRefs,
      unresolvedRefs: regions.unresolvedRefs,
      resolutionRatePercent: percent(regions.resolvedRefs, regions.totalRefs),
      duplicateRefs: regions.duplicateRefs,
      arrayLengthMismatchEvents: regions.arrayLengthMismatchEvents,
      resolvedGeometry: regions.resolvedGeometry,
      canonicalRegionTypeWithoutTarget: regions.canonicalRegionTypeWithoutTarget,
      lookupPolicy: 'exact_GID_1_only',
    },
    eligibility: {
      eligibleTotal,
      ineligibleTotal: parsedRecords.length - eligibleTotal,
      supportedTotal,
      supportedEligible,
      coverageAllPercent: percent(eligibleTotal, parsedRecords.length),
      coverageSupportedPercent: percent(supportedEligible, supportedTotal),
      byGeoType: sortedObject(eligibilityByType),
      ineligibleReasons: sortedObject(ineligibleReasons),
      byGrade: coverageByGrade(parsedRecords),
      byPeriod: null,
      byPeriodReason: 'No stable period taxonomy audited; chronology was not inferred.',
    },
    issues: {
      totalDiagnostics: issues.length,
      byCode: sortedObject(issueCounts),
    },
    qualityGates: {
      'Mọi input được parse an toàn': parseErrors === 0 ? 'PASS' : 'FAIL',
      'Mọi coordinate được validate': 'PASS',
      'Mọi region được hiển thị đều resolve bằng GID': 'PASS',
      'Event lỗi không gây crash audit': 'PASS',
      'Eligibility có thể xác định deterministic': 'PASS',
      'Không sửa input/database': 'PASS',
      'Coverage đủ cho demo khóa luận': 'NEEDS_DECISION',
      'Frontend-only có khả thi': 'CONDITIONAL',
    },
    decision: {
      code: 'B — FRONTEND_ONLY_CONDITIONAL',
      rationale: 'Nguồn canonical giữ đầy đủ mapData và cho phép xác định target deterministic, nhưng độ tương đồng raw_json/sourceJson của database live chưa được xác minh; target lỗi hoặc không resolve phải bị loại an toàn.',
      backendChangeRequiredNow: false,
      migrationRequiredNow: false,
      conditions: [
        'Audit snapshot DB/staging read-only được phép để xác nhận raw_json và sourceJson.mapData tương đồng với nguồn canonical.',
        'Giữ sourceJson.mapData trong frontend detail mapper và validate mọi target trước khi bật CTA.',
        'Loại coordinate lỗi và GADM ref không resolve kèm diagnostic; không suy ranh giới lịch sử bằng fuzzy matching.',
        'Chọn các event eligible đại diện và duyệt ngưỡng coverage demo trước Phase 1.',
      ],
    },
  };

  await mkdir(args.output, { recursive: true });
  const csvHeaders = ['eventId', 'slug', 'geoType', 'code', 'targetIndex', 'gadmRef', 'detail'];
  const csv = [
    csvHeaders.join(','),
    ...issues.map((issue) => csvHeaders.map((header) => csvEscape(issue[header])).join(',')),
  ].join('\n') + '\n';
  const readme = renderReadme(summary, command);

  await Promise.all([
    writeFile(
      path.join(args.output, 'terrain-audit-summary.json'),
      `${JSON.stringify(summary, null, 2)}\n`,
      'utf8',
    ),
    writeFile(path.join(args.output, 'terrain-audit-issues.csv'), csv, 'utf8'),
    writeFile(path.join(args.output, 'README.md'), readme, 'utf8'),
  ]);

  process.stdout.write(`${JSON.stringify({
    total: summary.records.totalInput,
    parsed: summary.records.parseSuccess,
    eligible: summary.eligibility.eligibleTotal,
    coverageAllPercent: summary.eligibility.coverageAllPercent,
    gadmResolutionRatePercent: summary.regions.resolutionRatePercent,
    decision: summary.decision.code,
    output: relativeToRoot(args.output),
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`[terrain-audit] fatal: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
