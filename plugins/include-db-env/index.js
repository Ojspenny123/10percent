const { access, copyFile, mkdir } = require("node:fs/promises");
const { join } = require("node:path");

const handlerDir = join(process.cwd(), ".netlify/functions-internal/___netlify-server-handler");

module.exports = {
  async onPostBuild() {
    const source = join(process.cwd(), ".env.production");
    try {
      await access(source);
    } catch {
      throw new Error(".env.production was not written, so the office has no database URL.");
    }
    await mkdir(handlerDir, { recursive: true });
    await copyFile(source, join(handlerDir, ".env.production"));
    await copyFile(source, join(handlerDir, "database.env"));
    console.log("Bundled the database URL into the Next.js server function.");
  },
};
