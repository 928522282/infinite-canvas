import assert from "node:assert/strict";
import test from "node:test";

import { connectorLaunchOptions, connectorSiteUrl } from "./connector.js";

test("connector launcher defaults to the recent canvas and supports deployment overrides", () => {
    assert.deepEqual(connectorLaunchOptions(["--open"], { INFINITE_CANVAS_SITE_URL: "https://team.example/" }), {
        open: true,
        siteUrl: "https://team.example/",
        mode: "recent",
    });
    assert.deepEqual(connectorLaunchOptions(["--site", "https://canvas.example", "--mode=new"], {}), {
        open: false,
        siteUrl: "https://canvas.example",
        mode: "new",
    });
});

test("connector URL keeps local credentials in the fragment", () => {
    const value = connectorSiteUrl("https://team.example/prompts", { url: "http://127.0.0.1:17371", token: "secret" }, "recent");
    const url = new URL(value);
    assert.equal(url.origin, "https://team.example");
    assert.equal(url.pathname, "/canvas");
    assert.equal(url.searchParams.get("mode"), "recent");
    assert.equal(url.searchParams.has("agentToken"), false);
    assert.deepEqual(Object.fromEntries(new URLSearchParams(url.hash.slice(1))), { agentUrl: "http://127.0.0.1:17371", agentToken: "secret" });
});

test("connector rejects non-local HTTP sites", () => {
    assert.throws(() => connectorSiteUrl("http://team.example", { url: "http://127.0.0.1:17371", token: "secret" }, "recent"), /HTTPS/);
});
