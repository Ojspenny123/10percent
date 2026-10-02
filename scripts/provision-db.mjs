import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import pg from "pg";

// Capture a host-provided URL before create-db's dotenv load can fill it from .env.
const hostUrl = isUsable(process.env.DATABASE_URL) ? process.env.DATABASE_URL : "";

const root = process.cwd();
const cacheDir = process.env.NETLIFY === "true" || existsSync("/opt/build/cache") ? "/opt/build/cache/tenpercent" : "";
const cacheFile = cacheDir ? resolve(cacheDir, "database.json") : "";
const catalogPath = resolve(root, "prisma/catalog.sql.gz");

function redact(text) {
  return String(text).replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redacted]");
}

function isUsable(url) {
  return Boolean(url) && !url.includes("placeholder:placeholder@");
}

function clientConfig(url) {
  return {
    connectionString: url.includes("sslmode=require") ? url.replace("sslmode=require", "sslmode=verify-full") : url,
    connectionTimeoutMillis: 20000,
    ssl: url.includes("sslmode=") ? { rejectUnauthorized: false } : undefined,
  };
}

async function ping(url) {
  const client = new pg.Client(clientConfig(url));
  try {
    await client.connect();
    await client.query("SELECT 1");
    return "";
  } catch (error) {
    return redact(error.message);
  } finally {
    await client.end().catch(() => {});
  }
}

async function waitUntilReady(url) {
  let last = "not ready";
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    last = await ping(url);
    if (!last) return;
    console.log(`Database is not accepting connections yet (attempt ${attempt}).`);
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error(`Database did not become ready: ${last}`);
}

function runtimeUrl(url) {
  if (url.includes("connection_limit=")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=1`;
}

function writeRuntimeEnv(url) {
  writeFileSync(resolve(root, ".env.production"), `DATABASE_URL=${JSON.stringify(url)}\n`, { mode: 0o600 });
}

function remember(url, claimUrl) {
  if (!cacheFile) return;
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify({ url, claimUrl: claimUrl || "" }), { mode: 0o600 });
}

function readCache() {
  if (!cacheFile || !existsSync(cacheFile)) return null;
  try {
    return JSON.parse(readFileSync(cacheFile, "utf8"));
  } catch {
    return null;
  }
}

async function provision() {
  const { create } = await import("create-db");
  const created = await create({ region: "us-east-1" });
  if (!created.success || !created.connectionString) {
    const message = created.success ? "no connection string" : created.message || created.error;
    throw new Error(`Could not provision Postgres: ${redact(message)}`);
  }
  const host = new URL(created.connectionString).host;
  console.log(`Provisioned a temporary Postgres database at ${host} (${created.region}).`);
  console.log(`It is deleted on ${created.deletionDate} unless it is claimed.`);
  console.log(`TENPERCENT_CLAIM_URL=${created.claimUrl}`);
  return { url: created.connectionString, claimUrl: created.claimUrl };
}

function pushSchema(url) {
  const result = spawnSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
  });
  if (result.stdout) process.stdout.write(redact(result.stdout));
  if (result.stderr) process.stderr.write(redact(result.stderr));
  if (result.status !== 0) throw new Error("prisma db push failed");
}

async function personCount(url) {
  const client = new pg.Client(clientConfig(url));
  await client.connect();
  try {
    const result = await client.query('SELECT COUNT(*)::int AS n FROM public."Person"');
    return result.rows[0].n;
  } catch (error) {
    if (error.code === "42P01") return 0;
    throw error;
  } finally {
    await client.end();
  }
}

function catalogInserts() {
  const sql = gunzipSync(readFileSync(catalogPath)).toString("utf8");
  const inserts = sql.split("\n").filter((line) => line.startsWith("INSERT INTO "));
  if (inserts.length < 2000) throw new Error(`Catalog dump looks incomplete (${inserts.length} rows).`);
  return inserts;
}

async function restoreCatalog(url) {
  const inserts = catalogInserts();
  const client = new pg.Client(clientConfig(url));
  await client.connect();
  try {
    await client.query("BEGIN");
    let done = 0;
    for (const statement of inserts) {
      await client.query(statement);
      done += 1;
      if (done % 500 === 0) console.log(`Restored ${done} of ${inserts.length} catalog rows.`);
    }
    await client.query("COMMIT");
    console.log(`Restored ${inserts.length} catalog rows.`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw new Error(`Catalog restore failed: ${redact(error.message)}`);
  } finally {
    await client.end();
  }
}

async function main() {
  let url = hostUrl;
  let claimUrl = "";

  if (!url) {
    const cached = readCache();
    if (cached?.url && !(await ping(cached.url))) {
      url = cached.url;
      claimUrl = cached.claimUrl || "";
      console.log("Reusing the database from the previous Netlify build.");
      if (claimUrl) console.log(`TENPERCENT_CLAIM_URL=${claimUrl}`);
    } else if (cached?.url) {
      console.log("Saved database is not reachable. Provisioning a new one.");
    }
  }

  if (!url) {
    const created = await provision();
    url = created.url;
    claimUrl = created.claimUrl;
  }

  console.log(`Using database host ${new URL(url).host}.`);
  await waitUntilReady(url);
  process.env.DATABASE_URL = url;
  writeRuntimeEnv(runtimeUrl(url));
  remember(url, claimUrl);
  pushSchema(url);

  const count = await personCount(url);
  if (count > 0) {
    console.log(`Catalog already has ${count} people.`);
    return;
  }
  console.log("Catalog is empty. Restoring actors, directors, and genres.");
  await restoreCatalog(url);
}

main().catch((error) => {
  console.error(redact(error.stack || error.message || error));
  process.exit(1);
});
