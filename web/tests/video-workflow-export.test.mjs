import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const webRoot = new URL("../", import.meta.url);
const readSource = (file) => readFileSync(new URL(file, webRoot), "utf8");

const exporter = readSource("src/lib/canvas/video-workflow-export.ts");
const canvasTypes = readSource("src/types/canvas.ts");
const workflow = readSource("src/lib/canvas/short-drama-workflow.ts");
const topBar = readSource("src/components/canvas/canvas-top-bar.tsx");

test("video workflow export is self-contained per VID", () => {
    assert.match(exporter, /const directory = vidId/);
    assert.match(exporter, /`\$\{directory\}\/assets\/\$\{type === "character" \? "characters" : "scenes"\}/);
    assert.match(exporter, /`\$\{directory\}\/keyframes\/\$\{safeFileName\(frameId\)\}/);
    assert.match(exporter, /`\$\{directory\}\/keyframe-prompts\/\$\{safeFileName\(frameId\)\}\.txt`/);
    assert.match(exporter, /const videoPromptPath = `\$\{directory\}\/video-prompt\.txt`/);
    assert.match(exporter, /const manifestPath = `\$\{directory\}\/manifest\.json`/);
    assert.match(exporter, /name: "workflow-index\.json"/);
});

test("video workflow export refuses incomplete production jobs", () => {
    assert.match(exporter, /missingKeyframes/);
    assert.match(exporter, /missingKeyframePrompt/);
    assert.match(exporter, /missingCharacterAssets/);
    assert.match(exporter, /missingSceneAssets/);
    assert.match(exporter, /missingVideoPrompt/);
});

test("workflow artifacts have stable export metadata", () => {
    assert.match(canvasTypes, /workflowArtifactType\?:\s*"character-asset"\s*\|\s*"scene-asset"\s*\|\s*"keyframe-image"\s*\|\s*"keyframe-prompt"\s*\|\s*"video-prompt"/);
    assert.match(workflow, /workflowArtifactType=character-asset/);
    assert.match(workflow, /workflowArtifactType=scene-asset/);
    assert.match(workflow, /workflowArtifactType=keyframe-prompt/);
    assert.match(workflow, /workflowArtifactType=keyframe-image/);
    assert.match(workflow, /workflowArtifactType=video-prompt/);
});

test("canvas menu keeps project backup and adds video workflow export", () => {
    assert.match(topBar, /onExportProject/);
    assert.match(topBar, /onExportVideoWorkflow/);
    assert.match(topBar, /export-video-workflow/);
});

test("a complete synthetic VID produces the required portable files", async () => {
    globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
    const server = await createServer({
        configFile: false,
        root: fileURLToPath(webRoot),
        appType: "custom",
        logLevel: "silent",
        plugins: [{
            name: "workflow-export-test-browser-stubs",
            enforce: "pre",
            resolveId(id) { return id === "virtual:workflow-file-saver" ? "\0workflow-file-saver" : null; },
            load(id) { return id === "\0workflow-file-saver" ? "export const saveAs = () => {};" : null; },
        }],
        resolve: { alias: [
            { find: "file-saver", replacement: "virtual:workflow-file-saver" },
            { find: "@", replacement: fileURLToPath(new URL("src", webRoot)) },
        ] },
        server: { middlewareMode: true },
    });
    try {
        const { buildVideoWorkflowExport } = await server.ssrLoadModule("/src/lib/canvas/video-workflow-export.ts");
        const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
        const base = { position: { x: 0, y: 0 }, width: 100, height: 100 };
        const nodes = [
            { ...base, id: "character", type: "image", title: "夏野", metadata: { content: image, workflowArtifactType: "character-asset", workflowAssetId: "ASSET_001" } },
            { ...base, id: "scene", type: "image", title: "307宿舍", metadata: { content: image, workflowArtifactType: "scene-asset", workflowAssetId: "SCENE_ASSET_008", assetId: "legacy-scene-id" } },
            { ...base, id: "frame-prompt", type: "text", title: "VID-001 KF-A 关键帧提示词", metadata: { content: "关键帧提示词", workflowArtifactType: "keyframe-prompt", workflowSourceVidId: "VID-001", workflowSceneId: "SCENE-001", workflowFrameId: "KF-A" } },
            { ...base, id: "frame", type: "image", title: "VID-001 KF-A", metadata: { content: image, workflowArtifactType: "keyframe-image", workflowSourceVidId: "VID-001", workflowSceneId: "SCENE-001", workflowFrameId: "KF-A", workflowFrameStatus: "confirmed", workflowAuthoritativeAssetNodeIds: ["character", "scene"] } },
            { ...base, id: "video-prompt", type: "text", title: "VID-001 优化视频提示词", metadata: { content: "优化视频提示词", workflowArtifactType: "video-prompt", workflowSourceVidId: "VID-001", workflowSceneId: "SCENE-001", workflowBranchStatus: "success" } },
        ];
        const result = await buildVideoWorkflowExport({ id: "project", title: "test", createdAt: "", updatedAt: "", nodes, connections: [], chatSessions: [], activeChatId: null, backgroundMode: "lines", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 } });
        const names = result.files.map((file) => file.name).sort();
        assert.equal(result.index.jobs[0].manifest, "VID-001/manifest.json");
        assert.deepEqual(names, [
            "VID-001/assets/characters/ASSET_001_夏野.png",
            "VID-001/assets/scenes/SCENE_ASSET_008_307宿舍.png",
            "VID-001/keyframe-prompts/KF-A.txt",
            "VID-001/keyframes/KF-A.png",
            "VID-001/manifest.json",
            "VID-001/video-prompt.txt",
            "workflow-index.json",
        ]);
    } finally {
        await server.close();
    }
});
