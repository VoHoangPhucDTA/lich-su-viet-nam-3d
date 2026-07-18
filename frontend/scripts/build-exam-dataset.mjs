import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDatasetMetadata } from './lib/examDatasetBuild.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const sourceDir = path.join(repoRoot, 'data/exams');
const artifactDir = path.resolve(scriptDir, '../public/data/exams');
const outputFile = path.join(artifactDir, 'exam-dataset-build.json');

async function main() {
  const metadata = await buildDatasetMetadata({ repoRoot, sourceDir, artifactDir });
  await fs.writeFile(outputFile, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  console.log(`Dataset build: ${metadata.sources.length} sources, SHA-256 ${metadata.aggregateHash}`);
  console.log(`Metadata: ${path.relative(process.cwd(), outputFile)}`);
}

main().catch((error) => {
  console.error('Dataset metadata build failed:', error.message);
  process.exitCode = 1;
});
