#!/usr/bin/env node
/**
 * Single-process supervisor for the 4 marketplace-automation backend
 * services (amazon-server, meesho, snapdeal, flipkart). Each service's code
 * is untouched/unmerged — this just starts, log-prefixes, and auto-restarts
 * all 4 as child processes under one pm2 entry ("marketflow"), so there's
 * one thing to deploy/start/stop/monitor instead of four.
 *
 * backero-backend's proxy (src/services/marketflow.service.js) still talks
 * to each service on its own port (4000/8010/8300/8600) directly — this
 * supervisor only manages process lifecycle, it does not route requests.
 *
 * Usage: node supervisor.js   (run from this directory)
 * pm2:   pm2 start supervisor.js --name marketflow --cwd <this dir>
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = __dirname;
const isWin = process.platform === 'win32';
const venvPython = (dir) => path.join(dir, 'venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');

const SERVICES = [
  {
    name: 'amazon',
    cwd: path.join(ROOT, 'amazon-server'),
    cmd: isWin ? 'npm.cmd' : 'npm',
    args: ['start'],
    env: {},
  },
  {
    name: 'meesho',
    cwd: path.join(ROOT, 'meesho'),
    cmd: venvPython(path.join(ROOT, 'meesho')),
    args: ['run_app.py'],
    // run_app.py defaults to 8000; set PORT to match the other platforms'
    // convention (8010) and the droplet's existing nginx config.
    env: { PORT: '8010' },
  },
  {
    name: 'snapdeal',
    cwd: path.join(ROOT, 'snapdeal'),
    cmd: venvPython(path.join(ROOT, 'snapdeal')),
    args: ['run.py'],
    // Don't let run.py pop open a browser tab on a headless deploy.
    env: { SD_NO_BROWSER: '1' },
  },
  {
    name: 'flipkart',
    cwd: path.join(ROOT, 'flipkart'),
    cmd: venvPython(path.join(ROOT, 'flipkart')),
    args: ['run_api.py'],
    env: {},
  },
];

const MIN_BACKOFF_MS = 3000;
const MAX_BACKOFF_MS = 60000;

let shuttingDown = false;
const children = new Map(); // name -> { proc, backoff }

function prefixedPipe(stream, name, isErr) {
  let buf = '';
  stream.on('data', (chunk) => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      (isErr ? process.stderr : process.stdout).write(`[${name}] ${line}\n`);
    }
  });
}

function startService(svc) {
  if (shuttingDown) return;
  console.log(`[supervisor] starting ${svc.name} (${svc.cmd} ${svc.args.join(' ')}) in ${svc.cwd}`);
  const proc = spawn(svc.cmd, svc.args, {
    cwd: svc.cwd,
    env: { ...process.env, ...svc.env },
    // Windows needs a shell to resolve .cmd shims (npm.cmd); not needed/wanted on Linux.
    shell: isWin,
  });

  const state = children.get(svc.name) || { backoff: MIN_BACKOFF_MS };
  state.proc = proc;
  children.set(svc.name, state);

  prefixedPipe(proc.stdout, svc.name, false);
  prefixedPipe(proc.stderr, svc.name, true);

  proc.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[supervisor] ${svc.name} exited (code=${code}, signal=${signal}) — restarting in ${state.backoff}ms`);
    setTimeout(() => startService(svc), state.backoff);
    state.backoff = Math.min(state.backoff * 2, MAX_BACKOFF_MS);
  });

  proc.on('spawn', () => {
    // Reset backoff once a process has been up long enough to be considered healthy.
    setTimeout(() => { state.backoff = MIN_BACKOFF_MS; }, 30000);
  });

  proc.on('error', (err) => {
    console.error(`[supervisor] failed to spawn ${svc.name}: ${err.message}`);
  });
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[supervisor] received ${signal}, stopping all services...`);
  for (const [name, state] of children) {
    if (state.proc && !state.proc.killed) {
      console.log(`[supervisor] stopping ${name}`);
      state.proc.kill(isWin ? undefined : 'SIGTERM');
    }
  }
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log('[supervisor] starting marketflow services (amazon, meesho, snapdeal, flipkart)...');
for (const svc of SERVICES) startService(svc);
