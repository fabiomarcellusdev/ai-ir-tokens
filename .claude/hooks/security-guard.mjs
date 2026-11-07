// security-guard.mjs: a Claude Code PreToolUse hook for Bash, PowerShell and WebFetch. Decision record:
// docs/decisions/0003-agents-and-security.md.
//
// It defends against prompt injection by making the risky actions visible: an injected instruction usually tries
// to read a secret and send it out. The hook asks the owner before:
//   1. a shell command that names a sensitive file (private notes, .env, keys, tokens);
//   2. a shell command that sends data to a host outside a short allow list (curl, wget, Invoke-WebRequest, ...);
//   3. a web fetch whose URL looks like it carries data (a long query or a long encoded segment);
//   4. publishing: git push, npm or pnpm publish, gh release, gh pr or issue creation, a new git remote.
// It refuses outright a pipe of downloaded text into a shell ("curl ... | sh", "iwr ... | iex").
//
// Limits: it reads the command text only (see package-guard.mjs). Uses Node built-ins only.

import { segments } from "./package-guard.mjs";

const SENSITIVE = [
  /(^|[\s"'=/\\])private-docs([/\\]|\s|$|["'])/i,
  /claude\.local\.md/i,
  /(^|[\s"'=/\\])\.env(\.[\w-]+)?(\s|$|["'])/i,
  /[/\\]\.ssh([/\\]|\s|$)|\bid_(rsa|ed25519|ecdsa)\b/i,
  /\.npmrc\b|\.pypirc\b|[/\\]\.aws[/\\]|[/\\]\.config[/\\]gh\b|credentials\.json\b|\.netrc\b/i,
  /\.(pem|key|p12|pfx)(\s|$|["'])/i,
  /\$env:[A-Z_]*(TOKEN|SECRET|KEY|PASSWORD)|\$\{?[A-Z_]*(TOKEN|SECRET|PASSWORD|API_KEY)\b/,
  /\bgh\s+auth\s+token\b|\bgit\s+credential\b/i,
];

const EGRESS_TOOLS = /^(curl|wget|invoke-webrequest|iwr|invoke-restmethod|irm|nc|ncat|netcat|scp|sftp|ftp|ssh|rsync|telnet)$/;

// Hosts a shell command may contact without a prompt: the package registry, the vulnerability database, GitHub.
export const ALLOWED_HOSTS = ["registry.npmjs.org", "api.npmjs.org", "osv.dev", "api.osv.dev", "github.com", "api.github.com", "codeload.github.com", "raw.githubusercontent.com"];
const hostAllowed = (h) => ALLOWED_HOSTS.some((a) => h === a || h.endsWith(`.${a}`));

const PUBLISH = [
  /^git\s+push\b/i, /^git\s+remote\s+(add|set-url)\b/i, /^(npm|pnpm|yarn)\s+publish\b/i,
  /^gh\s+(release|pr\s+(create|merge|comment)|issue\s+(create|comment)|repo\s+(create|edit|delete)|gist\s+create|api\s+.*(-X\s*(POST|PUT|PATCH|DELETE)|--method\s+(POST|PUT|PATCH|DELETE)))/i,
];

/** True when a URL looks like it carries data out: a long query, or a long run of encoded characters. */
export function suspiciousUrl(url) {
  let u;
  try { u = new URL(url); } catch { return true; }
  if (u.username || u.password) return true;
  if (u.search.length > 200) return true;
  return /[A-Za-z0-9+/_=-]{120,}/.test(decodeURIComponent(u.pathname + u.search));
}

/** Returns { decision: "deny" | "ask" | "allow", reason } for a shell command. */
export function judgeCommand(command) {
  // A shell always runs piped text. An interpreter runs it only with no script argument ("| node", "| python3 -");
  // "| node -e '...'" runs its own script and only reads the download as data.
  const pipeToShell = /\b(curl|wget|iwr|invoke-webrequest|irm|invoke-restmethod)\b[^|]*\|\s*(?:(?:sh|bash|zsh|dash|iex|invoke-expression|pwsh|powershell)\b|(?:node|python3?|py)(?:\s+-)?\s*(?:$|[;&|)]))/i;
  if (pipeToShell.test(command)) {
    return { decision: "deny", reason: "Piping downloaded text into a shell runs unreviewed code. Download, read, then decide with the owner." };
  }
  let ask = null;
  for (const seg of segments(command)) {
    const s = seg.trim().replace(/^[&@({]+\s*/, "");
    if (!s) continue;
    if (!ask && SENSITIVE.some((r) => r.test(` ${s} `))) ask = "This command names a private or secret file. The owner approves each access (decision 0003).";
    const first = (s.match(/^\S+/)?.[0] ?? "").split(/[\\/]/).pop().replace(/\.(exe|cmd)$/i, "").toLowerCase();
    if (!ask && EGRESS_TOOLS.test(first)) {
      const hosts = [...s.matchAll(/\b(?:https?|ftp):\/\/([^/\s"'?:]+)/gi)].map((m) => m[1].toLowerCase());
      if (!hosts.length || !hosts.every(hostAllowed)) ask = `This command contacts ${hosts.join(", ") || "an unnamed host"}, outside the allow list. The owner approves network access (decision 0003).`;
      else {
        const urls = [...s.matchAll(/\bhttps?:\/\/\S+/gi)].map((m) => m[0].replace(/["')]+$/, ""));
        if (urls.some(suspiciousUrl)) ask = "This URL looks like it carries data. The owner approves it (decision 0003).";
      }
    }
    if (!ask && PUBLISH.some((r) => r.test(s))) ask = "This command publishes or changes something outside this machine. The owner approves each one.";
  }
  return ask ? { decision: "ask", reason: ask } : { decision: "allow", reason: "" };
}

/** Returns { decision, reason } for a WebFetch URL. */
export function judgeFetch(url) {
  if (suspiciousUrl(url)) return { decision: "ask", reason: "This URL looks like it carries data (a long query or encoded text). The owner approves it (decision 0003)." };
  return { decision: "allow", reason: "" };
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const data = JSON.parse(input);
  const ti = data?.tool_input ?? {};
  let r = { decision: "allow" };
  if (typeof ti.command === "string") r = judgeCommand(ti.command);
  else if (typeof ti.url === "string") r = judgeFetch(ti.url);
  if (r.decision === "allow") return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: r.decision, permissionDecisionReason: `security-guard: ${r.reason}` } }));
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith(".claude/hooks/security-guard.mjs")) {
  main().catch((e) => {
    // Fail closed: if the guard cannot judge, it asks.
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: `security-guard could not judge this call (${e.message}); the owner decides.` } }));
  });
}
