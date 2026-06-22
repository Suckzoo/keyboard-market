// First photo (lexicographically) per pid → thumbnail source.
function thumbPlan(filenames) {
  const byPid = new Map();
  for (const f of [...(filenames || [])].sort()) {
    const m = f.match(/^(\d+)_/);
    if (!m) continue;
    if (!byPid.has(m[1])) byPid.set(m[1], f);
  }
  return [...byPid.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([pid, source]) => ({ pid, source, dest: `${pid}.jpg` }));
}

module.exports = { thumbPlan };
