import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Operations scripts (task 0009), exercised only with temporary directories, a
// temporary bare repository as the remote, a free port and a fake server. Nothing
// here touches the real instance, its data or its backups.
vi.setConfig({ testTimeout: 90_000 });

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const NODE_DIR = dirname(process.execPath);

interface Result {
  status: number | null;
  out: string;
}

let root: string;
let appDir: string;
let dataDir: string;
let envFile: string;
let port: number;

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const value = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => {
        resolvePort(value);
      });
    });
  });
}

/** A tiny stand-in for dist/server/index.js: /api/health, SIGTERM exits. */
const FAKE_SERVER = `
import { createServer } from 'node:http';
const server = createServer((req, res) => {
  if (req.url === '/api/health' && !process.env.FAKE_NO_HEALTH) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ status: 'ok' }));
  } else {
    res.statusCode = 404;
    res.end();
  }
});
server.listen(Number(process.env.PORT), '127.0.0.1');
process.on('SIGTERM', () => process.exit(0));
console.log('fake server up, data dir', process.env.PERSONAL_OS_DATA_DIR, process.env.NODE_ENV);
`;

function writeEnvFile(lines: string[]): void {
  writeFileSync(envFile, `${lines.join('\n')}\n`);
}

function defaultEnvFile(): void {
  writeEnvFile([`PERSONAL_OS_DATA_DIR=${dataDir}`, `PORT=${String(port)}`]);
}

function baseEnv(path = `${NODE_DIR}:/usr/bin:/bin`): NodeJS.ProcessEnv {
  return {
    PATH: path,
    HOME: join(root, 'home'),
    PERSONAL_OS_INSTANCE_ENV: envFile,
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
  };
}

function run(script: string, args: string[] = [], env: NodeJS.ProcessEnv = baseEnv()): Result {
  const result = spawnSync('bash', [script, ...args], { env, encoding: 'utf8', cwd: root });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

const start = (env?: NodeJS.ProcessEnv, args: string[] = []) =>
  run(join(appDir, 'scripts/start.sh'), args, env);
const stop = (env?: NodeJS.ProcessEnv) => run(join(appDir, 'scripts/stop.sh'), [], env);
const pidFile = () => join(dataDir, 'app.pid');
const readPid = () => readFileSync(pidFile(), 'utf8').trim();
const isAlive = (pid: string) => spawnSync('kill', ['-0', pid]).status === 0;

async function health(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${String(port)}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'personal-os-scripts-'));
  mkdirSync(join(root, 'home'));
  appDir = join(root, 'app');
  dataDir = join(root, 'data');
  envFile = join(root, 'instance.env');
  port = await freePort();
  // The scripts under test, copied next to a fake build.
  cpSync(join(REPO_ROOT, 'scripts'), join(appDir, 'scripts'), { recursive: true });
  mkdirSync(join(appDir, 'dist/server'), { recursive: true });
  writeFileSync(join(appDir, 'dist/server/index.js'), FAKE_SERVER);
  writeFileSync(join(appDir, 'package.json'), '{"type":"module"}');
  defaultEnvFile();
});

afterEach(() => {
  if (existsSync(pidFile())) {
    spawnSync('kill', ['-TERM', readPid()]);
  }
  rmSync(root, { recursive: true, force: true });
});

describe('configuration', () => {
  it('fails clearly when the config file is missing', () => {
    rmSync(envFile);
    const result = start();
    expect(result.status).toBe(1);
    expect(result.out).toContain(envFile);
    expect(result.out).toContain('instance.env.example');
  });

  it('fails clearly when PERSONAL_OS_DATA_DIR is not set', () => {
    writeEnvFile([`PORT=${String(port)}`]);
    const result = start();
    expect(result.status).toBe(1);
    expect(result.out).toContain('PERSONAL_OS_DATA_DIR is not set');
  });

  it('prints the configured port with --port', () => {
    const result = start(undefined, ['--port']);
    expect(result.status).toBe(0);
    expect(result.out.trim()).toBe(String(port));
  });

  it('example config has placeholders only and documents every variable', () => {
    const example = readFileSync(join(REPO_ROOT, 'config/instance.env.example'), 'utf8');
    for (const name of ['PERSONAL_OS_DATA_DIR', 'PERSONAL_OS_BACKUP_MIRROR_DIR', 'PORT']) {
      expect(example).toMatch(new RegExp(`^${name}=`, 'm'));
    }
    expect(example).not.toMatch(/\/home\/|\/mnt\/|\.local\/share/);
  });
});

describe('node lookup', () => {
  function sandboxBin(): string {
    // Only the tools the scripts need, and deliberately no node.
    const bin = join(root, 'sandbox-bin');
    mkdirSync(bin);
    for (const tool of ['bash', 'env', 'dirname', 'mkdir', 'sleep', 'kill', 'cat']) {
      symlinkSync(`/usr/bin/${tool}`, join(bin, tool));
    }
    for (const tool of ['mv', 'ls', 'rm', 'setsid', 'git', 'tail', 'stat', 'tr', 'grep']) {
      symlinkSync(`/usr/bin/${tool}`, join(bin, tool));
    }
    return bin;
  }

  it('fails clearly when node and fnm are both missing', () => {
    const result = start(baseEnv(sandboxBin()));
    expect(result.status).toBe(1);
    expect(result.out).toContain('fnm is not installed');
  });

  it('initialises fnm when node is not on PATH', async () => {
    const bin = sandboxBin();
    const fnmNode = join(root, 'fnm-node');
    mkdirSync(fnmNode);
    symlinkSync(process.execPath, join(fnmNode, 'node'));
    const fnm = join(bin, 'fnm');
    writeFileSync(
      fnm,
      `#!/usr/bin/env bash\n[ "$1" = env ] && echo 'export PATH="${fnmNode}:$PATH"'\nexit 0\n`,
    );
    chmodSync(fnm, 0o755);
    const result = start(baseEnv(bin));
    expect(result.out).toContain('up on');
    expect(result.status).toBe(0);
    expect(await health()).toBe(true);
  });
});

describe('start.sh', () => {
  it('starts when stopped: detached, PID file, log, health', async () => {
    const result = start();
    expect(result.out).toContain(`up on http://localhost:${String(port)}`);
    expect(result.status).toBe(0);
    expect(await health()).toBe(true);
    expect(isAlive(readPid())).toBe(true);
    const log = readFileSync(join(dataDir, 'logs/app.log'), 'utf8');
    expect(log).toContain('fake server up');
    expect(log).toContain('production');
    expect(log).toContain(dataDir);
  });

  it('succeeds without a second process when already running', () => {
    expect(start().status).toBe(0);
    const pid = readPid();
    const again = start();
    expect(again.status).toBe(0);
    expect(again.out).toContain('already running');
    expect(readPid()).toBe(pid);
  });

  it('fails after the timeout when /api/health never answers, pointing to the log', () => {
    const result = start({ ...baseEnv(), FAKE_NO_HEALTH: '1', PERSONAL_OS_START_TIMEOUT: '2' });
    expect(result.status).toBe(1);
    expect(result.out).toContain('did not answer');
    expect(result.out).toContain(join(dataDir, 'logs/app.log'));
  });

  it('replaces a stale PID file', async () => {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(pidFile(), '999999\n');
    const result = start();
    expect(result.out).toContain('stale PID');
    expect(result.status).toBe(0);
    expect(readPid()).not.toBe('999999');
    expect(await health()).toBe(true);
  });

  it('does not trust a PID file naming a live process that is not the app', () => {
    mkdirSync(dataDir, { recursive: true });
    const sleeper = spawnSync('bash', ['-c', 'sleep 30 >/dev/null 2>&1 & echo $!'], {
      encoding: 'utf8',
    });
    const other = sleeper.stdout.trim();
    writeFileSync(pidFile(), `${other}\n`);
    const result = start();
    spawnSync('kill', [other]);
    expect(result.status).toBe(0);
    expect(readPid()).not.toBe(other);
  });

  it('fails when there is no build', () => {
    rmSync(join(appDir, 'dist'), { recursive: true });
    const result = start();
    expect(result.status).toBe(1);
    expect(result.out).toContain('no build found');
  });

  it('rotates a log larger than 5 MB and keeps 3 old files', () => {
    const logs = join(dataDir, 'logs');
    mkdirSync(logs, { recursive: true });
    writeFileSync(join(logs, 'app.log'), Buffer.alloc(5 * 1024 * 1024 + 1, 'a'));
    writeFileSync(join(logs, 'app.log.1'), 'one');
    writeFileSync(join(logs, 'app.log.2'), 'two');
    writeFileSync(join(logs, 'app.log.3'), 'three');
    expect(start().status).toBe(0);
    expect(readdirSync(logs).sort()).toEqual(['app.log', 'app.log.1', 'app.log.2', 'app.log.3']);
    expect(readFileSync(join(logs, 'app.log.1')).length).toBe(5 * 1024 * 1024 + 1);
    expect(readFileSync(join(logs, 'app.log.2'), 'utf8')).toBe('one');
    expect(readFileSync(join(logs, 'app.log.3'), 'utf8')).toBe('two');
    expect(readFileSync(join(logs, 'app.log'), 'utf8')).toContain('fake server up');
  });

  it('does not rotate a small log', () => {
    const logs = join(dataDir, 'logs');
    mkdirSync(logs, { recursive: true });
    writeFileSync(join(logs, 'app.log'), 'earlier run\n');
    expect(start().status).toBe(0);
    expect(existsSync(join(logs, 'app.log.1'))).toBe(false);
    expect(readFileSync(join(logs, 'app.log'), 'utf8')).toContain('earlier run');
  });
});

describe('stop.sh', () => {
  it('succeeds when the app was not running', () => {
    const result = stop();
    expect(result.status).toBe(0);
    expect(result.out).toContain('not running');
  });

  it('fails when nothing is in the PID file but the port still answers', () => {
    expect(start().status).toBe(0);
    const orphan = readPid();
    rmSync(pidFile());
    const result = stop();
    spawnSync('kill', ['-TERM', orphan]);
    expect(result.status).toBe(1);
    expect(result.out).toContain('still answers');
  });

  it('stops a running app and removes the PID file', async () => {
    expect(start().status).toBe(0);
    const pid = readPid();
    const result = stop();
    expect(result.status).toBe(0);
    expect(result.out).toContain('stopped');
    expect(isAlive(pid)).toBe(false);
    expect(existsSync(pidFile())).toBe(false);
    expect(await health()).toBe(false);
  });

  it('handles a stale PID file', () => {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(pidFile(), '999999\n');
    const result = stop();
    expect(result.status).toBe(0);
    expect(result.out).toContain('stale PID');
    expect(existsSync(pidFile())).toBe(false);
  });
});

describe('deploy-local.sh', () => {
  const deploy = join(REPO_ROOT, 'scripts/deploy-local.sh');
  let remote: string;
  let work: string;
  let target: string;

  const git = (cwd: string, ...args: string[]) => {
    const result = spawnSync(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args],
      { cwd, encoding: 'utf8' },
    );
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  };

  function commitVersion(version: string): void {
    writeFileSync(join(work, 'version.txt'), `${version}\n`);
    git(work, 'add', '.');
    git(work, 'commit', '-q', '-m', `version ${version}`);
    git(work, 'push', '-q', 'origin', 'main');
  }

  const runDeploy = () =>
    run(deploy, [], {
      ...baseEnv(),
      PERSONAL_OS_APP_DIR: target,
      PERSONAL_OS_REPO_URL: remote,
    });

  beforeEach(() => {
    remote = join(root, 'remote.git');
    work = join(root, 'work');
    target = join(root, 'instance');
    mkdirSync(work);
    git(root, 'init', '-q', '--bare', '-b', 'main', remote);
    git(work, 'init', '-q', '-b', 'main');
    git(work, 'remote', 'add', 'origin', remote);
    writeFileSync(
      join(work, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        version: '1.0.0',
        scripts: { build: 'mkdir -p dist && cp version.txt dist/built-version.txt' },
      }),
    );
    writeFileSync(
      join(work, 'package-lock.json'),
      JSON.stringify({
        name: 'fixture',
        version: '1.0.0',
        lockfileVersion: 3,
        requires: true,
        packages: { '': { name: 'fixture', version: '1.0.0' } },
      }),
    );
    writeFileSync(join(work, '.gitignore'), 'node_modules/\ndist/\n');
    commitVersion('one');
  });

  it('first run clones main, installs and builds', () => {
    const result = runDeploy();
    expect(result.out).toContain('done at');
    expect(result.status).toBe(0);
    expect(readFileSync(join(target, 'dist/built-version.txt'), 'utf8').trim()).toBe('one');
  });

  it('later runs fast-forward to origin/main and rebuild', () => {
    expect(runDeploy().status).toBe(0);
    commitVersion('two');
    const result = runDeploy();
    expect(result.status).toBe(0);
    expect(readFileSync(join(target, 'version.txt'), 'utf8').trim()).toBe('two');
    expect(readFileSync(join(target, 'dist/built-version.txt'), 'utf8').trim()).toBe('two');
  });

  it('refuses when the instance directory has local changes', () => {
    expect(runDeploy().status).toBe(0);
    commitVersion('two');
    writeFileSync(join(target, 'version.txt'), 'edited by hand\n');
    const result = runDeploy();
    expect(result.status).toBe(1);
    expect(result.out).toContain('local changes');
    expect(readFileSync(join(target, 'version.txt'), 'utf8')).toBe('edited by hand\n');
  });

  it('refuses while the app is running', () => {
    expect(runDeploy().status).toBe(0);
    expect(start().status).toBe(0);
    commitVersion('two');
    const result = runDeploy();
    expect(result.status).toBe(1);
    expect(result.out).toContain('app is running');
    expect(readFileSync(join(target, 'version.txt'), 'utf8').trim()).toBe('one');
  });

  it('refuses a directory that is not a git checkout', () => {
    mkdirSync(target);
    writeFileSync(join(target, 'something'), 'x');
    const result = runDeploy();
    expect(result.status).toBe(1);
    expect(result.out).toContain('not a git checkout');
  });

  it('says which step failed', () => {
    writeFileSync(
      join(work, 'package.json'),
      JSON.stringify({ name: 'fixture', version: '1.0.0', scripts: { build: 'exit 3' } }),
    );
    git(work, 'add', '.');
    git(work, 'commit', '-q', '-m', 'broken build');
    git(work, 'push', '-q', 'origin', 'main');
    const result = runDeploy();
    expect(result.status).toBe(1);
    expect(result.out).toContain('step failed: npm run build');
  });

  it('a failed update restores the previous commit and build', () => {
    expect(runDeploy().status).toBe(0);
    writeFileSync(
      join(work, 'package.json'),
      JSON.stringify({ name: 'fixture', version: '1.0.0', scripts: { build: 'exit 3' } }),
    );
    git(work, 'add', '.');
    git(work, 'commit', '-q', '-m', 'broken build');
    git(work, 'push', '-q', 'origin', 'main');
    const before = git(target, 'rev-parse', 'HEAD');
    const result = runDeploy();
    expect(result.status).toBe(1);
    expect(result.out).toContain('restored the previous code and build');
    expect(git(target, 'rev-parse', 'HEAD')).toBe(before);
    expect(readFileSync(join(target, 'dist/built-version.txt'), 'utf8').trim()).toBe('one');
    expect(existsSync(join(target, 'dist.previous'))).toBe(false);
  });
});

describe('Windows shortcuts', () => {
  for (const name of ['personal-os-start.cmd', 'personal-os-stop.cmd']) {
    it(`${name} calls WSL through a login shell, keeps the window open on errors, uses CRLF`, () => {
      const text = readFileSync(join(REPO_ROOT, 'scripts/windows', name), 'utf8');
      expect(text).toContain('wsl.exe -- bash -lc');
      expect(text).toContain('-d <name>');
      expect(text).toContain('pause');
      expect(text).toMatch(/\r\n/);
      expect(text).not.toMatch(/[^\r]\n/);
    });
  }

  it('the start shortcut opens the browser on the configured port', () => {
    const text = readFileSync(join(REPO_ROOT, 'scripts/windows/personal-os-start.cmd'), 'utf8');
    expect(text).toContain('start "" "http://localhost:%PORT%"');
  });
});

// The autostart scripts only run on Windows, so these tests check their structure and the rules
// they must keep (task 0014). The real run is the manual test in the PR.
describe('Windows autostart scripts', () => {
  const read = (name: string) => readFileSync(join(REPO_ROOT, 'scripts/windows', name), 'utf8');
  const install = read('install-autostart.ps1');
  const uninstall = read('uninstall-autostart.ps1');
  const taskName = (text: string) => /\$TaskName = '([^']+)'/.exec(text)?.[1];

  it('both use the same task name', () => {
    expect(taskName(install)).toBe('PersonalOS-Autostart');
    expect(taskName(uninstall)).toBe(taskName(install));
  });

  it('install registers a task for the current user, at logon, without administrator rights', () => {
    expect(install).toContain('Register-ScheduledTask');
    expect(install).toContain('New-ScheduledTaskTrigger -AtLogOn -User $user');
    expect(install).toContain('-LogonType Interactive -RunLevel Limited');
    expect(install).not.toMatch(/RunLevel\s+Highest/i);
    expect(install).not.toMatch(/-Verb\s+RunAs/i);
    expect(install).not.toMatch(/requires\s+-RunAsAdministrator/i);
  });

  it('install runs the existing start script through a hidden wsl.exe, leaving $HOME to bash', () => {
    expect(install).toContain('-WindowStyle Hidden');
    expect(install).toContain('wsl.exe');
    expect(install).toContain("-- bash -lc '");
    expect(install).toContain('/scripts/start.sh');
    // The default is single-quoted, so PowerShell never expands $HOME (Windows' own HOME).
    expect(install).toContain("$AppDir = '$HOME/apps/personal-os'");
    // The same instance directory as the shortcuts.
    const shortcut = readFileSync(join(REPO_ROOT, 'scripts/windows/personal-os-start.cmd'), 'utf8');
    expect(shortcut).toContain('set "APP_DIR=$HOME/apps/personal-os"');
  });

  it('install is idempotent: it replaces a task of the same name and reports how many exist', () => {
    expect(install).toMatch(/Register-ScheduledTask[\s\S]*-Force/);
    expect(install).toContain('Get-ScheduledTask -TaskName $TaskName');
    expect(install).toContain('already existed');
    expect(install).toContain('.Count');
  });

  it('install checks -Distribution before it reaches the task command line', () => {
    expect(install).toContain("$Distribution -notmatch '^[\\w.-]+$'");
    expect(install).toContain('throw');
  });

  it('install and the README warn about the brief console flash at logon', () => {
    expect(install).toContain('flash a console window');
    const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
    expect(readme).toContain('console window may');
  });

  it('uninstall removes the task without asking, and is safe when there is none', () => {
    expect(uninstall).toContain('Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false');
    expect(uninstall).toContain('-ErrorAction SilentlyContinue');
    expect(uninstall).toContain('nothing to remove');
  });

  it('both print what they did and fail with a message and exit code 1', () => {
    for (const text of [install, uninstall]) {
      expect(text).toContain('Write-Host');
      expect(text).toContain('exit 1');
      expect(text).toContain("$ErrorActionPreference = 'Stop'");
    }
  });

  it('are plain ASCII: PowerShell 5.1 reads a file without a BOM as ANSI', () => {
    for (const text of [install, uninstall]) {
      expect(text.split('').every((char) => char.charCodeAt(0) < 128)).toBe(true);
    }
  });

  it('git converts them to CRLF, like the .cmd files', () => {
    const attributes = readFileSync(join(REPO_ROOT, '.gitattributes'), 'utf8');
    expect(attributes).toContain('*.ps1 text eol=crlf');
  });
});
