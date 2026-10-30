// Expand libuv worker threadpool from default 4 to 32 to prevent DNS/crypto thread starvation
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '32';

import dns from 'node:dns';
// Prioritize IPv4 resolution to prevent EAI_AGAIN lookup timeouts on cloud hosting
dns.setDefaultResultOrder('ipv4first');

import { Bootstrap } from './core/bootstrap/Bootstrap.js';

Bootstrap.start().catch((error) => {
  console.error('Fatal bootstrap error:', error);
  process.exit(1);
});
