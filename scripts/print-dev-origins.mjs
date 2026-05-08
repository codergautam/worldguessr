#!/usr/bin/env node
/**
 * Print LAN IPs and a ready-to-paste NEXT_PUBLIC_DEV_ORIGINS line.
 */

import os from 'os';

const ifaces = os.networkInterfaces();
const ips = [];
for (const name of Object.keys(ifaces)) {
  for (const iface of ifaces[name] ?? []) {
    if (iface.family !== 'IPv4' || iface.internal) continue;
    ips.push({ name, address: iface.address });
  }
}

if (ips.length === 0) {
  console.log('No LAN IPv4 interfaces found.');
  process.exit(0);
}

const port = process.env.PORT || '3000';

console.log('LAN dev URLs:');
for (const { name, address } of ips) {
  console.log(`  http://${address}:${port}    (${name})`);
}

const envValue = ips.map((i) => i.address).join(',');
console.log('\nPaste this before `pnpm dev` (or add to .env.development.local):');
console.log(`  NEXT_PUBLIC_DEV_ORIGINS=${envValue}`);
console.log('\nThen in the app on first launch, enter one of the URLs above.');
