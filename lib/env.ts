import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function parseEnvValue(value: string): string {
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "string") return parsed;
    } catch {
      // Keep the simpler quote strip below for hand-written env files.
    }
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

export function loadLocalEnv(): void {
  // .env.local wins. The other files only fill keys that are still unset,
  // so a host-provided DATABASE_URL is never replaced by a build file.
  for (const file of [".env", ".env.production", ".env.local"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      const value = parseEnvValue(line.slice(eq + 1).trim());
      if (file === ".env.local" || process.env[key] == null) process.env[key] = value;
    }
  }
}
