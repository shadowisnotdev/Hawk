Object.assign(process.env, { NODE_ENV: 'development' });
await import('./index.js');
export {};
