import { startLocalWellTransSettingsServer } from './welltrans.local-settings.js';

const server = startLocalWellTransSettingsServer();

server.on('listening', () => {
  const address = server.address();
  process.stdout.write(`Secure local WellTrans settings service listening on 127.0.0.1:${address?.port || 43127}.\n`);
});

const close = signal => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
  process.stdout.write(`Secure local WellTrans settings service stopping (${signal}).\n`);
};

process.on('SIGINT', () => close('SIGINT'));
process.on('SIGTERM', () => close('SIGTERM'));
