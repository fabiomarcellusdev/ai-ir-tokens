// package-guard.mjs: a Claude Code PreToolUse hook for the Bash and PowerShell tools.
// It refuses package managers other than pnpm, and makes every command that installs or
// fetches a package wait for the owner's approval. Decision record: docs/decisions/0002.
//
// Limits (docs/follow-ups.md): it reads the command text only. It splits the command at
// ; & | and new lines. It also checks the text after " -- " (a wrapper such as "lock run -- <command>"), and the
// command inside "bash -c", "sh -c", "cmd /c" and "powershell -Command".
// A command hidden in a script file, an alias or a quoted string is not seen. Claude Code's
// own permission prompt is the second line of defence.
//
// Uses Node built-ins only. Exported so that package-guard.test.mjs can test it.

const DENY = [
  [/^(npx|yarn|yarnpkg|bun|bunx|cnpm)$/, () => true, "This project uses pnpm only. Use the pnpm command instead."],
  [
    /^npm$/,
    (sub) => /^(install|i|in|ins|inst|insta|instal|isnt|isnta|isntal|isntall|add|ci|clean-install|install-ci-test|cit|install-test|it|update|up|upgrade|udpate|exec|x|link|ln|rebuild|rb|dedupe|ddp|init|create|innit)$/.test(sub),
    "This project uses pnpm only. npm may only run read-only commands (view, audit, --version).",
  ],
];

const ASK = [
  [
    /^pnpm$/,
    (sub) => /^(add|install|i|import|update|up|upgrade|dlx|create|fetch|rebuild|rb|dedupe|self-update|setup|env|patch|patch-commit|link|ln)$/.test(sub),
    "This pnpm command can install or fetch packages. The owner approves each install (AGENTS.md, \"Packages\").",
  ],
  [/^(pnpx|corepack)$/, () => true, "This command can download a package or a package manager. The owner approves each install."],
  [/^(winget|choco|scoop)$/, (sub) => /^(install|upgrade|update)$/.test(sub), "This command installs software. The owner approves each install."],
  [/^(pip|pip3|uv)$/, (sub) => /^(install|add|sync)$/.test(sub), "This command installs a Python package. The owner approves each install."],
  [/^(install-module|install-package|install-script|update-module)$/, () => true, "This PowerShell command installs a module. The owner approves each install."],
];

/** The words of one command segment, with wrappers, quotes, paths and extensions removed. */
function words(segment) {
  let s = segment.trim().replace(/^[&@({]+\s*/, "");
  s = s.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, ""); // FOO=1 cmd
  s = s.replace(/^(?:sudo|env|time|nice|command|exec|start)\s+/i, "");
  const raw = s.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return raw.map((w, i) => {
    let t = w.replace(/^["']|["']$/g, "").replace(/[)}]+$/, "");
    if (i === 0) t = t.split(/[\\/]/).pop().replace(/\.(cmd|exe|ps1|bat|js|mjs|cjs)$/i, "").toLowerCase();
    return t; // options keep their case: pnpm's -F (filter) is not -f (force)
  });
}

// Options that take a value in the next word ("pnpm --dir x install", "npm --prefix x ci").
const VALUE_OPTIONS = new Set(["-C", "--dir", "--filter", "-F", "--prefix", "--workspace", "--registry", "--loglevel", "--reporter", "--config", "--userconfig", "--cache", "--store-dir"]);

/** The first word that is not an option, after the program name: "npm -g install x" gives "install". */
function subcommand(ws) {
  for (let i = 1; i < ws.length; i++) {
    const w = ws[i];
    if (VALUE_OPTIONS.has(w)) i++; // skip the option's value
    else if (!w.startsWith("-")) return w.toLowerCase();
  }
  return "";
}

/** Python's "py -m pip install" and "python -m pip install". */
function pythonPip(ws) {
  if (!/^(py|python|python3)$/.test(ws[0] ?? "")) return null;
  const m = ws.indexOf("-m");
  if (m >= 0 && ws[m + 1] === "pip" && /^(install|download)$/.test(ws[m + 2] ?? "")) {
    return "This command installs a Python package. The owner approves each install.";
  }
  return null;
}

/** Splits a command line at ; & | new lines, $( and backticks, but not inside quotes. */
function splitOutsideQuotes(command) {
  const parts = [];
  let cur = "", quote = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    // Bash runs $( ) and backticks inside double quotes, so those still split there.
    const substitution = c === "`" || (c === "$" && command[i + 1] === "(");
    if (quote === '"' && substitution) { parts.push(cur); cur = ""; continue; }
    if (quote) { cur += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    const redirect = c === "&" && (/[<>0-9]$/.test(cur) || command[i + 1] === ">");
    if (!redirect && (c === ";" || c === "&" || c === "|" || c === "\n" || c === "`" || (c === "$" && command[i + 1] === "("))) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  return parts;
}

export function segments(command) {
  const parts = splitOutsideQuotes(command);
  const out = [];
  for (const p of parts) {
    out.push(p);
    const at = p.lastIndexOf(" -- ");
    if (at >= 0) out.push(p.slice(at + 4));
  }
  return out.filter((p) => p.trim());
}

/** The command string inside "bash -c '...'", "sh -c", "cmd /c" or "powershell -Command", else null. */
function innerCommand(ws) {
  if (!/^(bash|sh|zsh|dash|cmd|powershell|pwsh)$/.test(ws[0] ?? "")) return null;
  const at = ws.findIndex((w, i) => i > 0 && /^(-c|\/c|\/k|-command|-commandwithargs)$/i.test(w));
  return at > 0 && at + 1 < ws.length ? ws.slice(at + 1).join(" ") : null;
}

/** Returns { decision: "deny" | "ask" | "allow", reason } for one command line. */
export function judge(command, depth = 0) {
  let ask = null;
  for (const seg of segments(command)) {
    const ws = words(seg);
    if (!ws.length) continue;
    const inner = depth < 4 ? innerCommand(ws) : null;
    if (inner) {
      const r = judge(inner, depth + 1);
      if (r.decision === "deny") return r;
      if (r.decision === "ask") ask ??= r.reason;
    }
    const sub = subcommand(ws);
    for (const [prog, test, reason] of DENY) if (prog.test(ws[0]) && test(sub)) return { decision: "deny", reason };
    for (const [prog, test, reason] of ASK) if (!ask && prog.test(ws[0]) && test(sub)) ask = reason;
    ask ??= pythonPip(ws);
  }
  return ask ? { decision: "ask", reason: ask } : { decision: "allow", reason: "" };
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const command = JSON.parse(input)?.tool_input?.command;
  if (typeof command !== "string") return;
  const { decision, reason } = judge(command);
  if (decision === "allow") return; // no output: Claude Code's normal permission flow decides
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: `package-guard: ${reason}` },
    }),
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  main().catch((e) => {
    process.stderr.write(`package-guard failed: ${e.message}\n`);
    process.exit(1);
  });
}
