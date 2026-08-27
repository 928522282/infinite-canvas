import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("production build emits a Cloudflare Worker entrypoint", () => {
    assert.equal(existsSync(`${projectRoot}dist/server/index.js`), true);
});

test("production build packages the bound Sites project", () => {
    const hostingPath = `${projectRoot}dist/.openai/hosting.json`;
    assert.equal(existsSync(hostingPath), true);
    const hosting = JSON.parse(readFileSync(hostingPath, "utf8"));
    assert.equal(hosting.project_id, "appgprj_6a90508b824c8191bbd889f1d57c1720");
});
