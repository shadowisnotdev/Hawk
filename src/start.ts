Object.assign(process.env, { NODE_ENV: 'production' });
await import('./index.js');
export {};
