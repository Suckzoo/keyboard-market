function normalizeLogin(login) {
  return String(login || '').toLowerCase();
}

function operatorLogins(configOrOwner) {
  if (typeof configOrOwner === 'string') return [configOrOwner];
  if (Array.isArray(configOrOwner)) return configOrOwner;

  const config = configOrOwner || {};
  return [config.owner, ...(config.operators || [])].filter(Boolean);
}

function isOperator(login, configOrOwner) {
  const normalized = normalizeLogin(login);
  return operatorLogins(configOrOwner).some((op) => normalizeLogin(op) === normalized);
}

module.exports = { operatorLogins, isOperator };
