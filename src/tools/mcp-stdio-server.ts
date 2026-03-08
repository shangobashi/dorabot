import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from '../config.js';
import { startScheduler } from '../calendar/scheduler.js';
import { createStandardMcpServer, setBrowserConfig, setScheduler } from './index.js';

function getFlagValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main(): Promise<void> {
  const config = await loadConfig(getFlagValue('--config'));

  setBrowserConfig(config.browser || {});

  // Keep calendar tool storage available without starting a background runner
  // inside the MCP stdio child.
  const scheduler = startScheduler({ config, silent: true });
  scheduler.stop();
  setScheduler(scheduler);

  const server = createStandardMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async () => {
    await server.close().catch(() => {});
  };

  process.on('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error('[dorabot-mcp] failed to start stdio server:', err);
  process.exit(1);
});
