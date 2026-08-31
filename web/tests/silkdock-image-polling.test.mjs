import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const imageApi = readFileSync(`${webRoot}src/services/api/image.ts`, "utf8");

test("SilkDock image tasks poll at the provider minimum until media is available", () => {
    assert.match(imageApi, /IMAGE_TASK_POLL_INTERVAL_MS\s*=\s*5000/);
    assert.match(imageApi, /IMAGE_TASK_FAILURE_STATES[\s\S]*cancelled[\s\S]*failed[\s\S]*expired/);
    assert.match(imageApi, /IMAGE_TASK_SUCCESS_STATES[\s\S]*completed[\s\S]*succeeded[\s\S]*ready/);
    assert.match(imageApi, /await delay\(readImageTaskDelay\(payload\), options\?\.signal\)/);
    assert.match(imageApi, /axios\.get<ImageApiResponse>\(aiApiUrl\(config, `\/images\/generations\/\$\{encodeURIComponent\(taskId\)\}`\)/);
    assert.equal(imageApi.match(/resolveImagePayload\(requestConfig, response\.data, options\)/g)?.length, 2);
});

test("SilkDock image edits use the provider multipart field name", () => {
    assert.match(imageApi, /hostname === "silkdock\.ai" \|\| hostname\.endsWith\("\.silkdock\.ai"\)/);
    assert.match(imageApi, /isSilkDockChannel\(requestConfig\) \? "image\[\]" : "image"/);
});
