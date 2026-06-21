#!/usr/bin/env node
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { parse } = require('csv-parse/sync');
const { Octokit } = require('@octokit/rest');
const { loadConfig } = require('./lib/config');
const { buildIssue } = require('./lib/build-issue');
const { readListing } = require('./lib/markers');
const { formatPriceWon, imagesForPid } = require('./lib/listing-import');

const OWNER = 'Suckzoo';
const REPO = 'keyboard-market';
const LABEL_COLORS = { '매물': '5319e7', '구매 가능': '0e8a16', '예약금 대기중': 'fbca04', '입금 확인 완료': 'b60205' };
const ASSETS_DIR = 'assets/photos';
const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/master/${ASSETS_DIR}`;
const PRICE_TBD = '(아래 비고 참조)';
const PRICE_TBD_NOTE = '정보 확인이 어려워 적정 가격 제시를 받습니다';

function photoFilenames() {
  if (!fs.existsSync(ASSETS_DIR)) return [];
  return fs.readdirSync(ASSETS_DIR).filter((f) => /^\d+_/.test(f) && /\.jpg$/i.test(f));
}

// Format price (만원 → 원) and fill 비고 in place for unknown-price listings.
function prepareRow(row, config) {
  const map = config.csvMapping;
  const won = formatPriceWon(row[map.price]);
  if (won) {
    row[map.price] = won;
  } else {
    row[map.price] = PRICE_TBD;
    row['비고'] = PRICE_TBD_NOTE;
  }
  return row;
}

async function ensureLabels(octokit, config) {
  const want = [config.labels.scope, config.labels.available, config.labels.reserved, config.labels.paid];
  const existing = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, { owner: OWNER, repo: REPO, per_page: 100 });
  const have = new Set(existing.map((l) => l.name));
  for (const name of want) {
    if (!have.has(name)) {
      await octokit.rest.issues.createLabel({ owner: OWNER, repo: REPO, name, color: LABEL_COLORS[name] || 'ededed' });
      console.log(`label created: ${name}`);
    }
  }
}

async function existingIds(octokit, config) {
  const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner: OWNER, repo: REPO, state: 'all', labels: config.labels.scope, per_page: 100,
  });
  const ids = new Set();
  for (const i of issues) {
    if (i.pull_request) continue;
    const id = readListing(i.body || '').id;
    if (id) ids.add(String(id));
  }
  return ids;
}

async function main() {
  const csvPath = process.argv[2] || 'listings.csv';
  const config = loadConfig('config.json');
  const token = execSync('gh auth token', { encoding: 'utf8' }).trim();
  const octokit = new Octokit({ auth: token });

  await ensureLabels(octokit, config);
  const rows = parse(fs.readFileSync(csvPath, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
  const seen = await existingIds(octokit, config);
  const filenames = photoFilenames();

  let created = 0;
  for (const row of rows) {
    const pid = row[config.csvMapping.id];
    const images = imagesForPid(pid, filenames, RAW_BASE);
    prepareRow(row, config);
    const issue = buildIssue(row, config, { images });
    const id = readListing(issue.body).id;
    if (seen.has(String(id))) { console.log(`skip (dup id ${id}): ${issue.title}`); continue; }
    const res = await octokit.rest.issues.create({
      owner: OWNER, repo: REPO, title: issue.title, body: issue.body, labels: issue.labels,
    });
    console.log(`created #${res.data.number}: ${issue.title}`);
    created += 1;
  }
  console.log(`done. created ${created} issue(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
