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
const { reservationFooter } = require('./lib/messages');
const { decideUpsert } = require('./lib/decide-upsert');

const OWNER = 'Suckzoo';
const REPO = 'keyboard-market';
const LABEL_COLORS = { '매물': '5319e7', '구매 가능': '0e8a16', '예약금 대기중': 'fbca04', '입금 확인 완료': 'b60205' };
const ASSETS_DIR = 'assets/photos';
const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/master/${ASSETS_DIR}`;
const THUMB_DIR = 'assets/thumbs';
const THUMB_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/master/${THUMB_DIR}`;

function thumbForPid(pid) {
  return fs.existsSync(`${THUMB_DIR}/${pid}.jpg`) ? `${THUMB_BASE}/${pid}.jpg` : null;
}

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
    if (id) map.set(String(id), { number: i.number, body: i.body || '', title: i.title || '' });
  }
  return map;
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const csvPath = args.find((a) => !a.startsWith('--')) || 'keyboards.csv';
  const config = loadConfig('config.json');
  const token = execSync('gh auth token', { encoding: 'utf8' }).trim();
  const octokit = new Octokit({ auth: token });

  if (!dry) await ensureLabels(octokit, config);
  const rows = parse(fs.readFileSync(csvPath, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
  const existing = await existingByPid(octokit, config);
  const filenames = photoFilenames();
  const footer = reservationFooter(config);

  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const pid = String(row[config.csvMapping.id]);
    const images = imagesForPid(pid, filenames, RAW_BASE);
    prepareRow(row, config);
    const issue = buildIssue(row, config, { images, footer, thumb: thumbForPid(pid) });

    const ex = existing.get(pid);
    // Upsert: refresh listing content but keep the live reservation state.
    const newBody = ex ? setMarker(issue.body, MARKER.state, readState(ex.body)) : issue.body;
    const plan = decideUpsert({ existing: ex, title: issue.title, newBody });

    if (plan.action === 'unchanged') { console.log(`unchanged #${ex.number}: ${issue.title}`); continue; }

    if (plan.action === 'update') {
      const titleNote = plan.fields.title ? ` (제목: "${ex.title}" → "${plan.fields.title}")` : '';
      if (dry) { console.log(`[dry-run] update #${ex.number}: ${issue.title}${titleNote}`); updated += 1; continue; }
      await octokit.rest.issues.update({ owner: OWNER, repo: REPO, issue_number: ex.number, ...plan.fields });
      console.log(`updated #${ex.number}: ${issue.title}${titleNote}`);
      updated += 1;
      continue;
    }

    // create
    if (dry) { console.log(`[dry-run] create: ${issue.title}`); created += 1; continue; }
    const res = await octokit.rest.issues.create({
      owner: OWNER, repo: REPO, title: issue.title, body: issue.body, labels: issue.labels,
    });
    console.log(`created #${res.data.number}: ${issue.title}`);
    created += 1;
  }
  console.log(`${dry ? '[dry-run] ' : ''}done. created ${created}, updated ${updated} issue(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
