import { loadLocalEnv } from "../lib/env";

loadLocalEnv();

async function main() {
  const { seedUntilDone } = await import("../lib/seed/run");
  await seedUntilDone((message) => console.log(message));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
