#!/usr/bin/env node
// Local: assets/photos/{pid}_*.jpg 의 pid별 첫 사진 → assets/thumbs/{pid}.jpg (가로 400px). macOS 전용.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { thumbPlan } = require('./lib/thumbs');

const SRC = 'assets/photos';
const OUT = 'assets/thumbs';
const WIDTH = 400;

function main() {
  const files = fs.readdirSync(SRC).filter((f) => /^\d+_.*\.jpg$/i.test(f));
  const plan = thumbPlan(files);
  fs.mkdirSync(OUT, { recursive: true });
  for (const { source, dest } of plan) {
    execFileSync('sips', ['-s', 'format', 'jpeg', '--resampleWidth', String(WIDTH), path.join(SRC, source), '--out', path.join(OUT, dest)], { stdio: 'ignore' });
  }
  console.log(`thumbnails written: ${plan.length}`);
}

main();
