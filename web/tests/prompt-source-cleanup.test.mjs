import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const readSource = (path) => readFileSync(`${webRoot}${path}`, "utf8");

test("prompt sources start empty and pre-v3 persisted sources are discarded", () => {
    const presets = readSource("src/services/api/prompt-source-presets.ts");
    const store = readSource("src/stores/use-prompt-source-store.ts");

    assert.match(presets, /DEFAULT_PROMPT_SOURCES:\s*PromptSource\[\]\s*=\s*\[\]/);
    assert.doesNotMatch(presets, /raw\.githubusercontent\.com/);
    assert.match(store, /version:\s*3/);
    assert.match(store, /migrate:\s*\(persisted\)[\s\S]*sources:\s*\[\]/);
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
