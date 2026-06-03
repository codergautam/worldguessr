#!/usr/bin/env node
/**
 * WorldGuessr Server Monitor
 *
 * Polls the player-count endpoint twice a second and fires webhook alerts for:
 *   1. Low player count   — count drops below the threshold (server likely crashed)
 *   2. Request failure     — network error, timeout, non-2xx, or malformed body
 *   3. High ping           — response took longer than the ping threshold
 *
 * Each alert type has its OWN independent cooldown (default 5 min) so one noisy
 * condition never suppresses a different one — but the same condition won't spam.
 * A cooldown only starts once the webhook is actually delivered, so a dropped
 * webhook is retried on the next poll instead of being silently lost.
 *
 * Usage:
 *   node scripts/serverMonitor.js --webhook <url> [options]
 *   node scripts/serverMonitor.js <webhook-url> [threshold]      # positional form
 *
 * Options:
 *   -w, --webhook <url>     Webhook URL to POST alerts to            (required)
 *   -t, --threshold <n>     Alert when player count is below this    (default 500)
 *       --ping <ms>         Alert when a poll takes longer than this (default 1500)
 *       --interval <ms>     Poll interval                            (default 500)
 *       --cooldown <min>    Per-alert cooldown in minutes            (default 5)
 *       --timeout <ms>      Per-request timeout                      (default 10000)
 *       --url <endpoint>    Endpoint to poll
 *                           (default https://server.worldguessr.com/playercnt)
 *       --format <fmt>      Webhook body: discord | slack | both     (default auto)
 *       --label <name>      Optional monitor name shown in alerts
 *   -h, --help              Show this help
 *
 * Examples:
 *   node scripts/serverMonitor.js -w https://discord.com/api/webhooks/xxx/yyy
 *   node scripts/serverMonitor.js -w https://hooks.slack.com/... -t 300 --ping 2000
 *
 * Press Ctrl+C to stop.
 */

// ---- ANSI colors -----------------------------------------------------------
const c = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

// ---- argument parsing ------------------------------------------------------
function parseArgs(argv) {
  const opts = {
    webhook: null,
    threshold: 500,
    ping: 1500,
    interval: 500,
    cooldownMin: 5,
    timeout: 10000,
    url: 'https://server.worldguessr.com/playercnt',
    format: 'auto',
    label: null,
    windowMin: 5,
    statsSec: 30,
    help: false,
  };
  const positional = [];

  const needNum = (name, val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) {
      console.error(`${c.red}Invalid number for ${name}: ${val}${c.reset}`);
      process.exit(1);
    }
    return n;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-h': case '--help': opts.help = true; break;
      case '-w': case '--webhook': opts.webhook = argv[++i]; break;
      case '-t': case '--threshold': opts.threshold = needNum('--threshold', argv[++i]); break;
      case '--ping': opts.ping = needNum('--ping', argv[++i]); break;
      case '--interval': opts.interval = needNum('--interval', argv[++i]); break;
      case '--cooldown': opts.cooldownMin = needNum('--cooldown', argv[++i]); break;
      case '--timeout': opts.timeout = needNum('--timeout', argv[++i]); break;
      case '--url': opts.url = argv[++i]; break;
      case '--format': opts.format = argv[++i]; break;
      case '--label': opts.label = argv[++i]; break;
      case '--window': opts.windowMin = needNum('--window', argv[++i]); break;
      case '--stats': opts.statsSec = needNum('--stats', argv[++i]); break;
      default:
        if (a.startsWith('-')) {
          console.error(`${c.red}Unknown option: ${a}${c.reset}`);
          process.exit(1);
        }
        positional.push(a);
    }
  }

  // Positional fallback: <webhook> [threshold]
  if (!opts.webhook && positional[0]) opts.webhook = positional[0];
  if (positional[1] !== undefined) opts.threshold = needNum('threshold', positional[1]);

  return opts;
}

function printHelp() {
  // Re-print the usage block from the header comment.
  console.log(`
WorldGuessr Server Monitor — alerts on low player count, failures, and high ping.

Usage:
  node scripts/serverMonitor.js --webhook <url> [options]
  node scripts/serverMonitor.js <webhook-url> [threshold]

Options:
  -w, --webhook <url>   Webhook URL to POST alerts to            (required)
  -t, --threshold <n>   Alert when player count is below this    (default 500)
      --ping <ms>       Alert when a poll takes longer than this (default 1500)
      --interval <ms>   Poll interval                            (default 500)
      --cooldown <min>  Per-alert cooldown in minutes            (default 5)
      --timeout <ms>    Per-request timeout                      (default 10000)
      --url <endpoint>  Endpoint to poll
      --format <fmt>    Webhook body: discord | slack | both     (default auto)
      --label <name>    Optional monitor name shown in alerts
      --window <min>    Rolling window for percentile stats      (default 5)
      --stats <sec>     Print p50/p90/p95/p99 stats every N sec  (default 30, 0=off)
  -h, --help            Show this help
`);
}

// ---- webhook delivery ------------------------------------------------------
function buildBody(format, url, message) {
  let fmt = format;
  if (fmt === 'auto') {
    if (/discord(app)?\.com/i.test(url)) fmt = 'discord';
    else if (/slack\.com/i.test(url)) fmt = 'slack';
    else fmt = 'both';
  }
  if (fmt === 'discord') return { content: message };
  if (fmt === 'slack') return { text: message };
  return { content: message, text: message }; // 'both' — works with most webhooks
}

/**
 * POST the alert. Returns true only on a 2xx response so the caller knows
 * whether to start the cooldown (failed sends are retried next poll).
 */
async function sendWebhook(opts, message) {
  const body = buildBody(opts.format, opts.webhook, message);
  try {
    const res = await fetch(opts.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeout),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error(`${c.red}  ↳ webhook returned ${res.status} ${res.statusText}${c.reset} ${c.dim}${txt.slice(0, 200)}${c.reset}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`${c.red}  ↳ webhook send failed: ${err.message}${c.reset}`);
    return false;
  }
}

// ---- one poll of the endpoint ----------------------------------------------
/**
 * Polls the endpoint once.
 * Returns { ok, count, ms, error } — ok=false means the request itself failed.
 */
async function pollOnce(opts) {
  const start = Date.now();
  try {
    const res = await fetch(opts.url, {
      headers: { 'Accept': 'text/plain' },
      signal: AbortSignal.timeout(opts.timeout),
    });
    const text = await res.text();
    const ms = Date.now() - start;

    if (!res.ok) {
      return { ok: false, ms, error: `HTTP ${res.status} ${res.statusText}` };
    }
    const count = parseInt(text.trim(), 10);
    if (!Number.isFinite(count)) {
      return { ok: false, ms, error: `malformed body: ${JSON.stringify(text.slice(0, 60))}` };
    }
    return { ok: true, count, ms };
  } catch (err) {
    const ms = Date.now() - start;
    // AbortSignal.timeout aborts with a TimeoutError
    const reason = err.name === 'TimeoutError' ? `timed out after ${opts.timeout}ms` : err.message;
    return { ok: false, ms, error: reason };
  }
}

// ---- main loop -------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) { printHelp(); process.exit(0); }
  if (!opts.webhook) {
    console.error(`${c.red}Error: a webhook URL is required.${c.reset} Run with --help for usage.`);
    process.exit(1);
  }
  try { new URL(opts.webhook); } catch {
    console.error(`${c.red}Error: invalid webhook URL: ${opts.webhook}${c.reset}`);
    process.exit(1);
  }
  // A request must be allowed to outlast a "high ping" so the slow response is
  // still observed rather than turned into a timeout/failure.
  if (opts.timeout <= opts.ping) {
    opts.timeout = opts.ping + 5000;
    console.error(`${c.yellow}Note: --timeout raised to ${opts.timeout}ms (must exceed --ping ${opts.ping}ms).${c.reset}`);
  }

  const cooldownMs = opts.cooldownMin * 60 * 1000;
  const tag = opts.label ? `[${opts.label}] ` : '';

  // Independent cooldown clocks — last successful send per alert type.
  const lastSent = { lowPlayers: 0, requestFailed: 0, highPing: 0 };

  const now = () => Date.now();
  const stamp = () => new Date().toISOString().replace('T', ' ').replace('Z', '');

  // --- live status line: refreshes every poll so you can see it's alive ---
  const isTTY = process.stdout.isTTY;
  const HEARTBEAT_MS = 5000; // for non-TTY (piped) output, print at most this often
  const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
  let liveActive = false;
  let lastHeartbeat = 0;

  /** Overwrite the current line in place (TTY) or print throttled (piped). */
  function live(text) {
    if (isTTY) {
      process.stdout.write('\r\x1b[2K' + text);
      liveActive = true;
    } else if (now() - lastHeartbeat >= HEARTBEAT_MS) {
      lastHeartbeat = now();
      console.log(stripAnsi(text));
    }
  }

  /** Print a permanent line without clobbering the live status line. */
  function logLine(text) {
    if (isTTY && liveActive) { process.stdout.write('\r\x1b[2K'); liveActive = false; }
    console.log(text);
  }

  // --- rolling percentile (p-value) stats over a recent window ---
  const windowMs = opts.windowMin * 60 * 1000;
  const maxSamples = Math.max(1, Math.ceil(windowMs / opts.interval));
  const samples = []; // ring of { ok, ms, count }, trimmed to the window
  let lastStats = now();

  /** Nearest-rank percentile of an already-sorted ascending array. */
  const pct = (sorted, p) =>
    sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] : null;

  /** One-line summary of ping/player distribution over the window. */
  function statsSummary() {
    const ok = samples.filter((s) => s.ok);
    const fails = samples.length - ok.length;
    if (!ok.length) {
      return `${c.cyan}📊 ${opts.windowMin}m window · n=${samples.length} · ${c.red}${fails} fails${c.cyan} · no successful polls yet${c.reset}`;
    }
    const pings = ok.map((s) => s.ms).sort((a, b) => a - b);
    const plrs = ok.map((s) => s.count).sort((a, b) => a - b);
    return `${c.cyan}📊 ${opts.windowMin}m n=${samples.length}` +
      (fails ? ` ${c.red}fails=${fails}${c.cyan}` : '') +
      `  ping ${c.bold}p50=${pct(pings, 50)} p90=${pct(pings, 90)} p95=${pct(pings, 95)} p99=${pct(pings, 99)} max=${pings[pings.length - 1]}ms${c.reset}${c.cyan}` +
      `  players ${c.bold}p50=${pct(plrs, 50)} p05=${pct(plrs, 5)} min=${plrs[0]}${c.reset}${c.cyan} max=${plrs[plrs.length - 1]}${c.reset}`;
  }

  /**
   * Evaluate one alert condition. Respects the per-type cooldown and only arms
   * the cooldown on a successful send. Returns a short status for the live line.
   */
  async function alert(type, message) {
    const since = now() - lastSent[type];
    if (since < cooldownMs) {
      return { state: 'cooldown', left: Math.ceil((cooldownMs - since) / 1000) };
    }
    logLine(`${c.bold}${c.red}${stamp()} ${tag}ALERT ${type}:${c.reset} ${message}`);
    const sent = await sendWebhook(opts, `${tag}${message}`);
    if (sent) {
      lastSent[type] = now();
      logLine(`${c.green}  ↳ webhook delivered; ${type} muted for ${opts.cooldownMin} min${c.reset}`);
    } else {
      logLine(`${c.yellow}  ↳ delivery failed; will retry next poll${c.reset}`);
    }
    return { state: 'sent' };
  }

  console.log(`${c.cyan}${c.bold}WorldGuessr Server Monitor${c.reset}`);
  console.log(`${c.dim}  endpoint : ${opts.url}`);
  console.log(`  webhook  : ${opts.webhook.replace(/\/[^/]+$/, '/****')}`);
  console.log(`  interval : ${opts.interval}ms   threshold: <${opts.threshold} players`);
  console.log(`  high ping: >${opts.ping}ms   timeout: ${opts.timeout}ms   cooldown: ${opts.cooldownMin} min`);
  console.log(`  stats    : p50/p90/p95/p99 over ${opts.windowMin}m, every ${opts.statsSec}s${c.reset}`);
  console.log(`${c.dim}  Press Ctrl+C to stop.${c.reset}\n`);

  let stopping = false;
  let pollCount = 0;

  const shutdown = (sig) => {
    if (stopping) return;
    stopping = true;
    if (samples.length) logLine(statsSummary());
    logLine(`${c.cyan}Received ${sig}, stopping monitor.${c.reset}`);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Self-scheduling loop: keeps ~interval cadence but never overlaps requests.
  while (!stopping) {
    const cycleStart = now();
    const r = await pollOnce(opts);
    pollCount++;
    samples.push({ ok: r.ok, ms: r.ms, count: r.ok ? r.count : null });
    if (samples.length > maxSamples) samples.shift();

    const flags = []; // short tokens appended to the live line

    if (!r.ok) {
      const e = await alert('requestFailed', `🚨 Server check FAILED for ${opts.url} — ${r.error} (after ${r.ms}ms).`);
      flags.push(e.state === 'cooldown' ? `${c.red}FAIL⏳${e.left}s${c.reset}` : `${c.red}FAIL!${c.reset}`);
    } else {
      // Healthy request: independently evaluate ping and player count.
      if (r.ms > opts.ping) {
        const e = await alert('highPing', `⚠️ Slow response from ${opts.url} — ${r.ms}ms (threshold ${opts.ping}ms). Player count: ${r.count}.`);
        flags.push(e.state === 'cooldown' ? `${c.yellow}PING⏳${e.left}s${c.reset}` : `${c.yellow}PING!${c.reset}`);
      }
      if (r.count < opts.threshold) {
        const e = await alert('lowPlayers', `🚨 Server may have crashed — player count is ${r.count}, below threshold ${opts.threshold}.`);
        flags.push(e.state === 'cooldown' ? `${c.red}LOW⏳${e.left}s${c.reset}` : `${c.red}LOW!${c.reset}`);
      }
    }

    // Realtime status line — refreshes on EVERY poll (~2x/sec) so it's clearly alive.
    const spin = SPIN[pollCount % SPIN.length];
    const t = new Date().toISOString().slice(11, 19);
    const body = r.ok
      ? `${c.dim}players=${c.reset}${c.bold}${r.count}${c.reset} ${c.dim}ping=${r.ms}ms${c.reset}`
      : `${c.red}${r.error}${c.reset}`;
    const tail = flags.length ? '  ' + flags.join(' ') : `  ${c.green}✓ ok${c.reset}`;
    live(`${c.cyan}${spin}${c.reset} ${c.dim}#${pollCount} ${t}${c.reset}  ${body}${tail}`);

    // Periodic rolling percentile stats line (permanent, above the live line).
    if (opts.statsSec > 0 && now() - lastStats >= opts.statsSec * 1000) {
      lastStats = now();
      logLine(statsSummary());
    }

    // Sleep the remainder of the interval (accounting for request time).
    const elapsed = now() - cycleStart;
    const wait = Math.max(0, opts.interval - elapsed);
    if (wait > 0) await new Promise((res) => setTimeout(res, wait));
  }
}

main().catch((err) => {
  console.error(`${c.red}Fatal: ${err.stack || err.message}${c.reset}`);
  process.exit(1);
});
