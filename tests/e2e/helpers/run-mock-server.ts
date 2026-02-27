import { createMockOpenCodeServer } from './mock-opencode-server.js';

const mock = createMockOpenCodeServer(13337);
const server = await mock.start();
console.error('Mock OpenCode server listening on http://127.0.0.1:13337');

process.on('SIGINT', async () => {
  await mock.stop(server);
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await mock.stop(server);
  process.exit(0);
});
