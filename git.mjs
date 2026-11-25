import { execFileSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function gitOutput(directory, ...args) {
  // The workspace sandbox supports file-backed output for child processes.
  const scratch = mkdtempSync(join(tmpdir(), 'ironwood-studio-git-'));
  const path = join(scratch, 'output');
  let fd;
  try {
    fd = openSync(path, 'wx', 0o600);
    execFileSync('git', ['--no-replace-objects', ...args], {
      cwd: directory, stdio: ['ignore', fd, 'inherit'],
    });
    return readFileSync(path, 'utf8');
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(scratch, { recursive: true, force: true });
  }
}
