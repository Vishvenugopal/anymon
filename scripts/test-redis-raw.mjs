// Focused AUTH probe. Tries each auth form on its own fresh connection and
// waits up to 8s for the server's literal reply.
//   node scripts/test-redis-raw.mjs                 (uses the password below)
//   node scripts/test-redis-raw.mjs "NEW_PASSWORD"  (test a freshly-copied one)
import net from "node:net";

const HOST = "lighthearted-writing-sea-93517.db.redis.io";
const PORT = 14044;
const USER = "default";
const PASS = process.argv[2] || "tiM9IJdItYBksR1EPBWlmd5yELAxNMCe";

const masked = PASS.length <= 8 ? PASS : `${PASS.slice(0, 4)}…${PASS.slice(-4)}`;
console.log(`Testing host=${HOST}:${PORT}  user=${USER}`);
console.log(`password: ${masked}  (length ${PASS.length})`);

function bulk(...args) {
  let s = `*${args.length}\r\n`;
  for (const a of args) s += `$${Buffer.byteLength(a)}\r\n${a}\r\n`;
  return s;
}

function attempt(label, payload) {
  return new Promise((resolve) => {
    const s = net.connect({ host: HOST, port: PORT, timeout: 9000 });
    let buf = Buffer.alloc(0);
    let done = false;
    const finish = (why) => {
      if (done) return;
      done = true;
      const reply = buf.toString("utf8");
      console.log(`\n[${label}] ${why}`);
      console.log(`[${label}] reply: ${JSON.stringify(reply) || "(empty)"}`);
      if (reply.startsWith("+OK") || reply.includes("+PONG"))
        console.log(`[${label}] ==> SUCCESS, this password/form WORKS`);
      else if (reply.includes("WRONGPASS"))
        console.log(`[${label}] ==> wrong password`);
      try { s.destroy(); } catch {}
      resolve();
    };
    s.on("connect", () => s.write(payload));
    s.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      if (buf.toString().includes("\r\n")) setTimeout(() => finish("got reply"), 300);
    });
    s.on("timeout", () => finish("TIMEOUT (no reply in 9s -> throttled or dropped)"));
    s.on("error", (e) => finish(`socket ${e.code || e.message}`));
    s.on("close", () => finish("closed"));
  });
}

// Form A: ACL style (Redis 6+):  AUTH <user> <pass>  then PING
await attempt("AUTH user+pass", bulk("AUTH", USER, PASS) + bulk("PING"));
await new Promise((r) => setTimeout(r, 1500)); // small gap in case of throttling

// Form B: legacy:  AUTH <pass>  then PING
await attempt("AUTH pass-only", bulk("AUTH", PASS) + bulk("PING"));

console.log("\nDone.");
process.exit(0);
