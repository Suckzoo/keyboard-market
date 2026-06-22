// Map keycap rows (pid >= 100) to resized photo destinations.
// `사진 링크` cells may list multiple newline-separated source filenames; dedupe within a cell.
function planKeycapPhotos(rows, config) {
  const map = config.csvMapping || {};
  const idKey = map.id || 'pid';
  const linkKey = map.photoLinks || '사진 링크';
  const plan = [];
  for (const row of rows || []) {
    const pid = String(row[idKey] || '').trim();
    if (!/^\d+$/.test(pid) || Number(pid) < 100) continue;
    const seen = new Set();
    const files = String(row[linkKey] || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((f) => (seen.has(f) ? false : seen.add(f)));
    files.forEach((source, idx) => plan.push({ pid, source, dest: `${pid}_${idx + 1}.jpg` }));
  }
  return plan;
}

module.exports = { planKeycapPhotos };
