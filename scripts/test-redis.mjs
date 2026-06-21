// Quick Redis connectivity probe. Shows how the URL parses, then tries
// DNS -> raw TCP -> redis:// -> rediss:// (TLS).
//
//   node scripts/test-redis.mjs "redis://default:PASS@HOST:PORT"
//
// If no arg is given it reads REDIS_URL from .env.local.
import net from "node:net";
import dns from "node:dns/promises";
import fs from "node:fs";
import IORedis from "ioredis";

function fromEnvFile() {
  try {
    const txt = fs.readFileSync(".env.local", "utf8");
    const line = txt
      .split(/\r?\n/)
      .find((l) => /^\s*REDIS_URL\s*=/.test(l) && !l.trim().startsWith("#"));
    return line ? line.replace(/^\s*REDIS_URL\s*=\s*/, "").trim() : "";
  } catch {
    return "";
  }
}

const raw = process.argv[2] || fromEnvFile();
if (!raw) {
  console.log("No URL given and no active REDIS_URL in .env.local.");
  console.log('Run: node scripts/test-redis.mjs "redis://default:PASS@HOST:PORT"');
  process.exit(1);
}

console.log("\n=== Parsing the URL the way ioredis does ===");
let HOST, PORT, USER, PASS, SCHEME;
try {
  const u = new URL(raw);
  SCHEME = u.protocol.replace(":", "");
  HOST = u.hostname;
  PORT = Number(u.port || 6379);
  USER = decodeURIComponent(u.username);
  PASS = decodeURIComponent(u.password);
  console.log("  scheme  :", SCHEME, SCHEME === "rediss" ? "(TLS)" : "(plaintext)");
  console.log("  username:", JSON.stringify(USER));
  console.log("  password:", JSON.stringify(PASS));
  console.log("  host    :", JSON.stringify(HOST));
  console.log("  port    :", PORT);
  if (/[@:]/.test(PASS) || /@/.test(HOST)) {
    console.log(
      "\n  *** WARNING: password or host contains @ or : — the URL is malformed.",
    );
    console.log(
      "      A stray @ in the password means the real password has a special char",
    );
    console.log("      that must be URL-encoded, or the host was typed wrong.");
  }
} catch (e) {
  console.log("  URL could not be parsed at all:", e.message);
  process.exit(1);
}

function tcpProbe() {
  return new Promise((resolve) => {
    const s = net.connect({ host: HOST, port: PORT, timeout: 5000 });
    s.on("connect", () => {
      s.destroy();
      resolve({ ok: true });
    });
    s.on("timeout", () => {
      s.destroy();
      resolve({ ok: false, err: "timeout" });
    });
    s.on("error", (e) => resolve({ ok: false, err: e.message }));
  });
}

async function redisProbe(scheme) {
  const url = `${scheme}://${encodeURIComponent(USER)}:${encodeURIComponent(
    PASS,
  )}@${HOST}:${PORT}`;
  const client = new IORedis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 6000,
    retryStrategy: () => null,
    ...(scheme === "rediss" ? { tls: {} } : {}),
  });
  try {
    const pong = await client.ping();
    client.disconnect();
    return { ok: true, pong };
  } catch (e) {
    client.disconnect();
    return { ok: false, err: e.message };
  }
}

console.log(`\n=== 1) DNS lookup for ${HOST} ===`);
try {
  const addrs = await dns.lookup(HOST, { all: true });
  console.log("  resolved:", addrs.map((a) => a.address).join(", "));
} catch (e) {
  console.log("  DNS FAILED:", e.message, "<- the host is wrong / doesn't exist");
}

console.log(`\n=== 2) Raw TCP connect to ${HOST}:${PORT} ===`);
console.log(" ", await tcpProbe());

console.log(`\n=== 3) redis:// (no TLS) PING ===`);
console.log(" ", await redisProbe("redis"));

console.log(`\n=== 4) rediss:// (TLS) PING ===`);
console.log(" ", await redisProbe("rediss"));

console.log("\nDone.\n");
process.exit(0);
