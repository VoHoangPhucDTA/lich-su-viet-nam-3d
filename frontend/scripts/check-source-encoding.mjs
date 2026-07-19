import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const roots = ['src'];
const standaloneFiles = ['index.html'];
const sourceExtensions = new Set(['.ts', '.tsx', '.css', '.html']);
const invalidFiles = [];

// Match mojibake sequences instead of individual Vietnamese characters.
// For example, "Âu Lạc" is valid while "Â·" and "Ã¡" are not.
const mojibakePatterns = [
  /\uFFFD/u,
  /Ã[\u0080-\u00BF]/u,
  /Â[\u0080-\u00BF]/u,
  /Ä[\u0080-\u00BF]/u,
  /á[º»][\u0080-\u00BF]?/u,
  /â(?:€|„|™|œ|“|”|–|—|†|‡|€¦|ˆ)/u,
  /ðŸ/u,
];

function containsMojibake(content) {
  return mojibakePatterns.some(pattern => pattern.test(content));
}

function scan(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      scan(path);
    } else if (sourceExtensions.has(extname(path)) && containsMojibake(readFileSync(path, 'utf8'))) {
      invalidFiles.push(path);
    }
  }
}

for (const root of roots) scan(root);
for (const file of standaloneFiles) {
  if (containsMojibake(readFileSync(file, 'utf8'))) invalidFiles.push(file);
}

if (invalidFiles.length) {
  console.error(`Mojibake signature found in:\n${invalidFiles.join('\n')}`);
  process.exit(1);
}
