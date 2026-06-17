#!/usr/bin/env node
/**
 * EZI License Key Generator — Trilo Automation (PRIVATE TOOL)
 * ============================================================
 * Run this to generate a license key for a customer's device.
 *
 * Usage:
 *   node tools/generate-key.js <DeviceID>
 *
 * The customer gets their Device ID from the EZI activation screen.
 * You give them the printed key. One key per device — it won't work on any other machine.
 *
 * Example:
 *   node tools/generate-key.js a3f2b1c4d5e6f7a8b9c0d1e2f3a4b5c6
 *   → License Key: A3F2-B1C4-D5E6-F7A8
 */

'use strict';
const crypto = require('crypto');

// ── Must match electron/license.cjs exactly ──────────────────────────────────
const _S = ['T','R','L','0','E','Z','I','2','0','2','5','X','K','9','M'].join('');

function generateKey(machineId) {
  const hash = crypto
    .createHmac('sha256', _S)
    .update(machineId.toLowerCase().trim())
    .digest('hex');
  const raw = hash.slice(0, 16).toUpperCase();
  return raw.match(/.{4}/g).join('-');
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const machineId = process.argv[2];

if (!machineId) {
  console.error('\nUsage: node tools/generate-key.js <DeviceID>\n');
  console.error('  The DeviceID is shown on the EZI activation screen.\n');
  process.exit(1);
}

const key = generateKey(machineId);

console.log('\n╔══════════════════════════════════════╗');
console.log('║     EZI License Key — Trilo         ║');
console.log('╠══════════════════════════════════════╣');
console.log(`║  Device : ${machineId.slice(0, 26).padEnd(26)} ║`);
console.log(`║  Key    : ${key.padEnd(26)} ║`);
console.log('╚══════════════════════════════════════╝\n');
