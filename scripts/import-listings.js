#!/usr/bin/env node
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { parse } = require('csv-parse/sync');
const { Octokit } = require('@octokit/rest');
const { loadConfig } = require('./lib/config');
const { buildIssue } = require('./lib/build-issue');
const { readListing, readState, setMarker, MARKER } = require('./lib/markers');
const { imagesForPid, prepareRow } = require('./lib/listing-import');
const { isTestPurpose } = require('./lib/render-board');

const OWNER = 'Suckzoo';
const REPO = 'keyboard-market';
const LABEL_COLORS = { '매물': '5319e7', '구매 가능': '0e8a16', '예약금 대기중': 'fbca04', '입금 확인 완료': 'b60205' };
const ASSETS_DIR = 'assets/photos';
const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/master/${ASSETS_DIR}`;

function photoFilenames() {
  if (!fs.existsSync(ASSETS_DIR)) return [];
  return fs.readdirSync(ASSETS_DIR).filter((f) => /^\d+_/.test(f) && /\.jpg$/i.test(f));
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

async function existingByPid(octokit, config) {
  const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner: OWNER, repo: REPO, state: 'all', labels: config.labels.scope, per_page: 100,
  });
  const map = new Map();
  for (const i of issues) {
    if (i.pull_request || isTestPurpose(i.title)) continue;
    const id = readListing(i.body || '').id;
    if (id) map.set(String(id), { number: i.number, body: i.body || '' });
  }
  return map;
}

async function main() {
  const csvPath = process.argv[2] || 'listings.csv';
  const config = loadConfig('config.json');
  const token = execSync('gh auth token', { encoding: 'utf8' }).trim();
  const octokit = new Octokit({ auth: token });

  await ensureLabels(octokit, config);
  const rows = parse(fs.readFileSync(csvPath, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
  const existing = await existingByPid(octokit, config);
  const filenames = photoFilenames();

  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const pid = String(row[config.csvMapping.id]);
    const images = imagesForPid(pid, filenames, RAW_BASE);
    prepareRow(row, config);
    const issue = buildIssue(row, config, { images });

    const ex = existing.get(pid);
    if (ex) {
      // Upsert: refresh listing content but keep the live reservation state.
      const newBody = setMarker(issue.body, MARKER.state, readState(ex.body));
      if (newBody === ex.body) { console.log(`unchanged #${ex.number}: ${issue.title}`); continue; }
      await octokit.rest.issues.update({ owner: OWNER, repo: REPO, issue_number: ex.number, body: newBody });
      console.log(`updated #${ex.number}: ${issue.title}`);
      updated += 1;
      continue;
    }

    const res = await octokit.rest.issues.create({
      owner: OWNER, repo: REPO, title: issue.title, body: issue.body, labels: issue.labels,
    });
    console.log(`created #${res.data.number}: ${issue.title}`);
    created += 1;
  }
  console.log(`done. created ${created}, updated ${updated} issue(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
