// Decide whether an imported listing should create, update, or skip its issue.
// Labels are intentionally never touched here — live reservation state lives in labels.
function decideUpsert({ existing, title, newBody }) {
  if (!existing) return { action: 'create' };
  const fields = {};
  if (title !== existing.title) fields.title = title;
  if (newBody !== existing.body) fields.body = newBody;
  if (Object.keys(fields).length === 0) return { action: 'unchanged' };
  return { action: 'update', fields };
}

module.exports = { decideUpsert };
