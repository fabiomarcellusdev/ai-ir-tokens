// Tests for package-guard.mjs. Run from the repository root: node --test ".claude/hooks/*.test.mjs"
// Uses node:test (built in), so it needs no install.
import { test } from "node:test";
import assert from "node:assert/strict";
import { judge } from "./package-guard.mjs";

const cases = {
  deny: [
    "npm install",
    "npm i lodash",
    "npm ci --ignore-scripts",
    "npm -g install pnpm",
    "npm.cmd install",
    '"C:\\Program Files\\nodejs\\npm.cmd" ci',
    "cd bench/token-count && npm ci --ignore-scripts",
    "npm --version; npm install",
    "npx only-allow pnpm",
    "yarn add react",
    "bun add react",
    "bunx something",
    "& npm install",
    "FOO=1 npm install",
    'py -3.13 "C:\\x\\wrapper.py" run --label x -- npm ci',
    "npm exec -- some-tool",
    "echo $(npx evil)",
    'echo "$(npx evil)"',
    "echo `npm install`",
    "NPM INSTALL",
    "x=$(npm install)",
    'bash -c "cd x && npm ci"',
    "sh -c 'npx foo'",
    'cmd /c "npm install"',
    'powershell -Command "npm install"',
    'py -3.13 lock.py run --kind build --label x -- bash -c "npm ci"',
  ],
  ask: [
    "pnpm install",
    "pnpm i",
    "pnpm add -E zod",
    "pnpm --dir bench/token-count install --frozen-lockfile --ignore-scripts",
    "pnpm import",
    "pnpm dlx create-thing",
    "pnpx create-thing",
    "corepack enable pnpm",
    "pnpm self-update",
    "winget install pnpm.pnpm",
    "pip install requests",
    "py -m pip install requests",
    "Install-Module PSReadLine",
    'py -3.13 "C:\\x\\wrapper.py" run --label x -- pnpm install --frozen-lockfile',
    "git status && pnpm add zod",
    "pnpm -C bench/token-count i",
    "pnpm -F core add zod",
    "pnpm -w add zod",
    'bash -c "cd bench/token-count && corepack pnpm install --ignore-scripts"',
    'py -3.13 lock.py run --kind build --label x --wait 1800 -- bash -c "corepack pnpm --version"',
    "pwsh -Command 'pnpm add zod'",
  ],
  allow: [
    "npm --version",
    "npm view pnpm dist-tags --json",
    "npm audit --json",
    "pnpm --version",
    "pnpm run count",
    "pnpm audit",
    "pnpm list --depth 0",
    "node count.mjs",
    "node --test .claude/hooks/",
    'grep -n "npm install" README.md',
    'git commit -m "Use pnpm, not npm install"',
    "git status",
    'rg "npx|yarn" docs',
    "echo 'npm install; npx x'",
    "node a.js 2>&1 | tail -5",
    'bash -c "node count.mjs && git status"',
    "bash script.sh",
    "echo pnpm install is described in CLAUDE.md",
    "",
  ],
};

for (const [want, commands] of Object.entries(cases)) {
  for (const c of commands) {
    test(`${want}: ${JSON.stringify(c)}`, () => {
      assert.equal(judge(c).decision, want);
    });
  }
}

test("every deny and ask carries a reason that says what to do", () => {
  for (const c of [...cases.deny, ...cases.ask]) assert.match(judge(c).reason, /pnpm|owner approves/);
});
