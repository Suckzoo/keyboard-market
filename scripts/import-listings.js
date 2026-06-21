#!/usr/bin/env node
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { parse } = require('csv-parse/sync');
const { Octokit } = require('@octokit/rest');
const { loadConfig } = require('./lib/config');
const { buildIssue } = require('./lib/build-issue');
const { readListing } = require('./lib/markers');

const OWNER = 'Suckzoo';
const REPO = 'keyboard-market';
const LABEL_COLORS = { '매물': '5319e7', '구매 가능': '0e8a16', '예약금 대기중': 'fbca04', '입금 확인 완료': 'b60205' };

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

  let created = 0;
  for (const row of rows) {
    const issue = buildIssue(row, config);
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
