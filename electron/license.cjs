'use strict';
/**
 * EZI License Module — Trilo Automation
 * Hardware-bound license: one key per device, issued by Trilo.
 *
 * Key generation algorithm (KEEP SECRET):
 *   key = HMAC-SHA256(SECRET, machineId)[0..15].toUpperCase() formatted as XXXX-XXXX-XXXX-XXXX
 *
 * Storage: <userData>/ezi.lic  (JSON with a tamper-detection token)
 */

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

// ── Secret salt ── (embedded; obfuscated by vite-plugin-javascript-obfuscator at build time)
const _S = ['T','R','L','0','E','Z','I','2','0','2','5','X','K','9','M'].join('');

// ── Machine ID ──────────────────────────────────────────────────────────────
let _cachedMachineId = null;

function getMachineId() {
  if (_cachedMachineId) return _cachedMachineId;
  try {
    const { machineIdSync } = require('node-machine-id');
    _cachedMachineId = machineIdSync(true); // raw hardware UUID
  } catch {
    // Fallback if node-machine-id unavailable (shouldn't happen in production)
    const os = require('os');
    _cachedMachineId = crypto
      .createHash('sha256')
      .update(os.hostname() + os.platform() + os.arch() + os.cpus()[0]?.model)
      .digest('hex');
  }
  return _cachedMachineId;
}

// ── Key generation ───────────────────────────────────────────────────────────
/**
 * Generate the expected license key for a given machineId.
 * Called both here (to validate) and in tools/generate-key.js (to issue keys).
 */
function generateKey(machineId) {
  const hash = crypto
    .createHmac('sha256', _S)
    .update(machineId.toLowerCase().trim())
    .digest('hex');
  const raw = hash.slice(0, 16).toUpperCase();
  return raw.match(/.{4}/g).join('-'); // XXXX-XXXX-XXXX-XXXX
}

// ── License file ─────────────────────────────────────────────────────────────
function getLicensePath(userDataPath) {
  return path.join(userDataPath, 'ezi.lic');
}

/** Returns true if the device has a valid stored license. */
function isLicensed(userDataPath) {
  try {
    const p = getLicensePath(userDataPath);
    if (!fs.existsSync(p)) return false;

    const stored = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!stored || !stored.token) return false;

    const machineId = getMachineId();
    const key       = generateKey(machineId);
    const expected  = crypto
      .createHmac('sha256', _S)
      .update(key + machineId)
      .digest('hex');

    return stored.token === expected;
  } catch {
    return false;
  }
}

/**
 * Validate the key the user typed and, if correct, write the license file.
 * Returns { success: true } or { success: false, error: string }.
 */
function activateLicense(userDataPath, enteredKey) {
  if (!enteredKey || typeof enteredKey !== 'string') {
    return { success: false, error: 'Please enter a license key.' };
  }

  const machineId    = getMachineId();
  const expectedKey  = generateKey(machineId);

  // Normalize both sides: uppercase, strip dashes/spaces
  const normalize = (k) => k.toUpperCase().replace(/[-\s]/g, '');

  if (normalize(enteredKey) !== normalize(expectedKey)) {
    return { success: false, error: 'Invalid license key for this device.' };
  }

  // Write tamper-detection token
  const token = crypto
    .createHmac('sha256', _S)
    .update(expectedKey + machineId)
    .digest('hex');

  const licData = {
    token,
    activatedAt: new Date().toISOString(),
    product: 'EZI-1.0',
  };

  fs.mkdirSync(path.dirname(getLicensePath(userDataPath)), { recursive: true });
  fs.writeFileSync(getLicensePath(userDataPath), JSON.stringify(licData, null, 2));

  return { success: true };
}

module.exports = { getMachineId, generateKey, isLicensed, activateLicense };
