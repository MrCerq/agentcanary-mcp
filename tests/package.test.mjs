import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

async function readJson(name) {
  return JSON.parse(await readFile(path.join(repoRoot, name), 'utf8'));
}

test('package declares direct runtime deps and a tight npm file allowlist', async () => {
  const pkg = await readJson('package.json');

  assert.equal(pkg.dependencies?.zod?.startsWith('^'), true);
  assert.equal(pkg.dependencies?.['@modelcontextprotocol/sdk']?.startsWith('^'), true);
  assert.deepEqual(pkg.files, [
    'index.js',
    'README.md',
    'server.json',
    'smithery.yaml',
  ]);
  assert.equal(pkg.scripts?.test, 'node --test tests/*.test.mjs');
});

test('server starts without AC_API_KEY so public tools can register', async () => {
  const child = spawn(process.execPath, ['index.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AC_API_KEY: '',
      AC_API_BASE: 'https://api.agentcanary.ai/api',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });

  await new Promise(resolve => setTimeout(resolve, 750));
  assert.equal(child.exitCode, null, stderr);

  child.kill('SIGTERM');
  await new Promise(resolve => child.once('close', resolve));
});
