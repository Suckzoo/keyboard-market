#!/usr/bin/env node
// Local one-shot: keycaps.zip → resized assets/photos/{pid}_{n}.jpg (가로 1600px, 크롭 없음).
// macOS 전용(sips/unzip 의존).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parse } = require('csv-parse/sync');
const { loadConfig } = require('./lib/config');
const { planKeycapPhotos } = require('./lib/keycap-photos');

const ZIP = 'keycaps.zip';
const OUT = 'assets/photos';
const WIDTH = 1600;

function main() {
  const config = loadConfig('config.json');
  const rows = parse(fs.readFileSync('keyboards.csv', 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
  const plan = planKeycapPhotos(rows, config);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keycaps-'));
  execFileSync('unzip', ['-j', '-o', ZIP, '-d', tmp], { stdio: 'ignore' }); // -j: 깨진 한글 폴더명 평탄화
  fs.mkdirSync(OUT, { recursive: true });

  let written = 0;
  const missing = [];
  for (const { source, dest } of plan) {
    const src = path.join(tmp, source);
    if (!fs.existsSync(src)) { missing.push(`${source} → ${dest}`); continue; }
    execFileSync('sips', ['-s', 'format', 'jpeg', '--resampleWidth', String(WIDTH), src, '--out', path.join(OUT, dest)], { stdio: 'ignore' });
    written += 1;
  }
  console.log(`keycap photos written: ${written}/${plan.length}`);
  if (missing.length) console.warn(`missing sources:\n  ${missing.join('\n  ')}`);
}

main();
