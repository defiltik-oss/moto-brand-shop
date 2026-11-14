import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, 'node_modules/wrangler/wrangler-dist/cli.js');

const child = spawn(
  process.execPath,
  [cliPath, 'pages', 'deploy', 'dist', '--project-name=alexov-shop', '--branch=production', '--commit-dirty=true'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    },
  }
);

child.on('exit', (code) => {
  process.exit(code || 0);
});
