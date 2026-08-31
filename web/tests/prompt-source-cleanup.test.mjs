import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const readSource = (path) => readFileSync(`${webRoot}${path}`, "utf8");

test("prompt sources contain the bundled short-drama workflow and pre-v3 persisted sources are discarded", () => {
    const presets = readSource("src/services/api/prompt-source-presets.ts");
    const store = readSource("src/stores/use-prompt-source-store.ts");
    const prompts = JSON.parse(readSource("public/prompts/short-drama-workflow.json"));

    assert.match(presets, /url:\s*["']\/prompts\/short-drama-workflow\.json\?v=10["']/);
    assert.doesNotMatch(presets, /raw\.githubusercontent\.com/);
    assert.deepEqual(prompts.map((item) => item.id), [
        "convert-script-to-ai-video",
        "script-character-asset-audit",
        "generate-keyframe-prompts",
        "generate-keyframe-prompts-strict-asset-binding",
        "first-frame-shot-reference-prompts",
        "micro-expression-video-generator",
        "optimized-video-shot-prompt-compiler",
    ]);
    assert.deepEqual(prompts.map((item) => item.coverUrl), [
        "/prompts/covers/ai-script-conversion-realistic.png",
        "/prompts/covers/script-character-asset-audit-realistic-v2.png",
        "/prompts/covers/keyframe-prompts-realistic.png",
        "/prompts/covers/keyframe-prompts-strict-asset-binding-realistic.png",
        "/prompts/covers/first-frame-shot-reference-realistic.png",
        "/prompts/covers/micro-expression-performance-realistic.png",
        "/prompts/covers/optimized-video-shot-compiler-realistic.png",
    ]);
    const microExpression = prompts.find((item) => item.id === "micro-expression-video-generator");
    const strictAssetBinding = prompts.find((item) => item.id === "generate-keyframe-prompts-strict-asset-binding");
    assert.match(strictAssetBinding.prompt, /资产至上原则/);
    assert.match(strictAssetBinding.prompt, /Spatial Invariance/);
    assert.match(strictAssetBinding.prompt, /changing facial features:1\.5/);
    assert.match(microExpression.prompt, /唯一交付物是当前VID可追溯、可计时的微表情表演层/);
    assert.doesNotMatch(microExpression.prompt, /hub_generate_video|自动切换 MiniMax-H3/);
    assert.match(store, /version:\s*4/);
    assert.match(store, /version\s*<\s*3\s*\?\s*\{\s*\.\.\.state,\s*sources:\s*\[\]\s*\}/);
    assert.match(store, /DEFAULT_PROMPT_SOURCES\.map/);
});

test("a bundled source revision refreshes before stale cached prompts are returned", () => {
    const service = readSource("src/services/api/prompts.ts");

    assert.match(service, /const signatureChanged = cached\.signature !== sourceSignature\(source\)/);
    assert.match(service, /if \(signatureChanged\) \{[\s\S]*await getOrStartRefresh\(source\)/);
});

test("full Prompt Center cards preserve the portrait cover frame", () => {
    const card = readSource("src/components/prompts/prompt-card.tsx");

    assert.match(card, /compact \? ["']aspect-square[\s\S]*: ["']aspect-\[3\/4\] w-full object-cover["']/);
});

test("client startup clears only prompt_cache and records success", () => {
    const prompts = readSource("src/services/api/prompts.ts");
    const clientInit = readSource("src/components/layout/client-root-init.tsx");

    assert.match(prompts, /storeName:\s*["']prompt_cache["']/);
    assert.match(prompts, /export function clearLegacyPromptCache/);
    assert.match(prompts, /promptCacheStore\s*\.\s*clear\(\)/);
    assert.match(prompts, /localStorage\.setItem\(PROMPT_CACHE_CLEANUP_KEY,\s*["']done["']\)/);
    assert.match(clientInit, /clearLegacyPromptCache\(\)\.catch\(\(\) => undefined\)/);
});
