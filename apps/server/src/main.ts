import { startTurnServer, type TurnServerHandle } from '@houston/turn';
import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = await buildApp(config);

let turn: TurnServerHandle | undefined;
if (config.turn.enabled) {
  const { secret, port, externalIp, relayPortRange, allowPrivatePeers } = config.turn;
  turn = await startTurnServer(
    {
      secret,
      realm: config.publicUrl.hostname,
      port,
      externalIp,
      relayPortRange,
      allowPrivatePeers,
    },
    (message) => {
      if (message.type === 'listening')
        app.log.info({ port: message.port }, 'TURN server listening');
      if (message.type === 'auth-failure') app.log.warn(message, 'TURN authentication failed');
      if (message.type === 'error') app.log.error(message, 'TURN server error');
    },
  );
  if (!externalIp) {
    app.log.warn(
      'HOUSTON_TURN_EXTERNAL_IP is not set; relaying only works if this host has a public IP',
    );
  }
}

await app.listen({ host: config.host, port: config.port });

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  await Promise.allSettled([app.close(), turn?.stop()]);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
