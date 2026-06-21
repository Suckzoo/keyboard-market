const fs = require('node:fs');

const REQUIRED = ['openAt', 'keyword', 'reservationHours', 'depositInfo', 'formBaseUrl'];
const REQUIRED_LABELS = ['scope', 'available', 'reserved', 'paid'];

function validateConfig(config) {
  for (const key of REQUIRED) {
    if (config[key] === undefined || config[key] === null || config[key] === '') {
      throw new Error(`config missing required key: ${key}`);
    }
  }
  if (!config.labels) throw new Error('config missing required key: labels');
  for (const key of REQUIRED_LABELS) {
    if (!config.labels[key]) throw new Error(`config missing required key: labels.${key}`);
  }
  return config;
}

function loadConfig(configPath = 'config.json') {
  const raw = fs.readFileSync(configPath, 'utf8');
  return validateConfig(JSON.parse(raw));
}

module.exports = { loadConfig, validateConfig };
