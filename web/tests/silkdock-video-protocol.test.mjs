import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const videoApi = readFileSync(`${webRoot}src/services/api/video.ts`, "utf8");
const configStore = readFileSync(`${webRoot}src/stores/use-config-store.ts`, "utf8");
const videoPage = readFileSync(`${webRoot}src/pages/video/index.tsx`, "utf8");

test("SilkDock is the credential-free default channel with a video-capable model", () => {
    assert.match(configStore, /SILKDOCK_BASE_URL\s*=\s*"https:\/\/silkdock\.ai\/v1"/);
    assert.match(configStore, /videoModel:\s*"default::wan-2\.6"/);
    assert.match(videoPage, /resolveModelForCapability\(effectiveConfig, effectiveConfig\.videoModel, "video"\)/);
});

test("SilkDock video multipart supports current image, video, audio, and frame fields", () => {
    assert.match(videoApi, /body\.append\("input_reference"/);
    assert.match(videoApi, /body\.append\("reference_image_urls"/);
    assert.match(videoApi, /body\.append\("reference_video_urls"/);
    assert.match(videoApi, /body\.append\("reference_audio_urls"/);
    assert.match(videoApi, /body\.append\("first_frame_url"/);
    assert.match(videoApi, /body\.append\("last_frame_url"/);
    assert.match(videoApi, /await delay\(10000, options\?\.signal\)/);
});

test("Video workbench accepts the nine references advertised by its UI", () => {
    assert.match(videoPage, /MAX_REFERENCE_IMAGES\s*=\s*9/);
    assert.doesNotMatch(videoPage, /7 - references\.length|slice\(0, 7\)/);
});
