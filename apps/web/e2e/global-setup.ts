import { execSync } from 'child_process';
import * as fs from 'fs';
import { FIXTURE_REPO } from '../playwright.config';

export default function globalSetup() {
  // Fresh fixture repo for every run so worktrees from earlier runs
  // cannot leak into assertions
  fs.rmSync(FIXTURE_REPO, { recursive: true, force: true });
  fs.rmSync(`${FIXTURE_REPO}-e2e-branch`, { recursive: true, force: true });
  fs.mkdirSync(FIXTURE_REPO, { recursive: true });

  const run = (cmd: string) => execSync(cmd, { cwd: FIXTURE_REPO, stdio: 'pipe' });
  run('git init');
  run('git config user.email "e2e@vibetree.test"');
  run('git config user.name "VibeTree E2E"');
  fs.writeFileSync(`${FIXTURE_REPO}/README.md`, '# e2e fixture\n');
  run('git add .');
  run('git commit -m "initial commit"');
}
