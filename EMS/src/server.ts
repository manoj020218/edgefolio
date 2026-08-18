import { createApp } from './app';
import { connectDatabase } from './config/db';
import { env } from './config/env';

async function start() {
  await connectDatabase();
  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`EMS backend listening on ${env.PORT}`);
  });
}

start().catch((error) => {
  console.error('Failed to start EMS backend', error);
  process.exit(1);
});
