# Remove Remote Prompt Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every currently persisted remote prompt source and its cached prompts while leaving the existing Prompt Center UI and unrelated browser data intact.

**Architecture:** Keep the existing prompt-query and source-management interfaces, but make the default source list empty and add a Zustand persistence migration that discards every pre-v3 source. Add one idempotent client-start cleanup that clears only the `prompt_cache` IndexedDB store and records success in localStorage so failed cleanup is retried.

**Tech Stack:** React 19, TypeScript, Zustand persist middleware, localForage/IndexedDB, Node test runner.

---

## File map

- Modify `web/src/services/api/prompt-source-presets.ts`: remove the seven built-in registry sources and expose an empty default list.
- Modify `web/src/stores/use-prompt-source-store.ts`: migrate pre-v3 persisted source state to an empty list while preserving later user-created sources.
- Modify `web/src/services/api/prompts.ts`: add the one-time, retryable cleanup for the isolated `prompt_cache` store.
- Modify `web/src/components/layout/client-root-init.tsx`: invoke cache cleanup once during client startup without blocking rendering.
- Create `web/tests/prompt-source-cleanup.test.mjs`: lock the migration and cleanup source contracts before implementation.
- Modify `web/package.json`: include the new source-contract test in a focused script.
- Modify `docs/content/docs/progress/pending-test.mdx` and `CHANGELOG.md`: record the user-visible cleanup and manual verification scope.

### Task 1: Lock the source-removal contract

**Files:**
- Create: `web/tests/prompt-source-cleanup.test.mjs`
- Modify: `web/package.json`

- [ ] **Step 1: Write the failing source-contract test**

Create `web/tests/prompt-source-cleanup.test.mjs`:

```js
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
    assert.match(prompts, /promptCacheStore\.clear\(\)/);
    assert.match(prompts, /localStorage\.setItem\(PROMPT_CACHE_CLEANUP_KEY,\s*["']done["']\)/);
    assert.match(clientInit, /clearLegacyPromptCache\(\)\.catch\(\(\) => undefined\)/);
});
```

Add this script to `web/package.json` without changing existing scripts:

```json
"test:prompt-cleanup": "node --test tests/prompt-source-cleanup.test.mjs"
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm run test:prompt-cleanup`

Expected: FAIL because defaults still contain remote sources and cleanup functions do not exist.

- [ ] **Step 3: Commit the failing contract**

```bash
git add web/tests/prompt-source-cleanup.test.mjs web/package.json
git commit -m "test: define prompt source cleanup contract"
```

### Task 2: Remove persisted sources and cached prompts

**Files:**
- Modify: `web/src/services/api/prompt-source-presets.ts`
- Modify: `web/src/stores/use-prompt-source-store.ts`
- Modify: `web/src/services/api/prompts.ts`
- Modify: `web/src/components/layout/client-root-init.tsx`

- [ ] **Step 1: Make the built-in prompt source list empty**

Reduce `web/src/services/api/prompt-source-presets.ts` to the existing types and factory plus this default:

```ts
import { nanoid } from "nanoid";

export type PromptSource = {
    id: string;
    name: string;
    url: string;
    homepage: string;
    enabled: boolean;
    builtIn: boolean;
};

export function createPromptSource(source?: Partial<PromptSource>): PromptSource {
    return {
        id: source?.id?.trim() || nanoid(),
        name: source?.name?.trim() || "",
        url: source?.url?.trim() || "",
        homepage: source?.homepage?.trim() || "",
        enabled: source?.enabled ?? true,
        builtIn: source?.builtIn ?? false,
    };
}

export const DEFAULT_PROMPT_SOURCES: PromptSource[] = [];
```

- [ ] **Step 2: Add the persisted-source migration**

In `web/src/stores/use-prompt-source-store.ts`, keep the existing store actions but replace the persist options with:

```ts
        {
            name: PROMPT_SOURCE_STORE_KEY,
            version: 3,
            partialize: (state) => ({ sources: state.sources, schedule: state.schedule }),
            migrate: (persisted) => ({ ...((persisted || {}) as Partial<PromptSourceStore>), sources: [] }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<PromptSourceStore>;
                const sources = Array.isArray(persistedState.sources) ? persistedState.sources.map((source) => createPromptSource(source)) : [];
                return { ...current, sources, schedule: { ...defaultSchedule, ...(persistedState.schedule || {}) } };
            },
        },
```

This discards all pre-v3 sources once. Sources manually created after the migration continue to persist.

- [ ] **Step 3: Add idempotent prompt-cache cleanup**

In `web/src/services/api/prompts.ts`, next to the `promptCacheStore` declaration add:

```ts
const PROMPT_CACHE_CLEANUP_KEY = "infinite-canvas:prompt_cache_cleanup_v1";
let promptCacheCleanup: Promise<void> | undefined;

export function clearLegacyPromptCache() {
    if (window.localStorage.getItem(PROMPT_CACHE_CLEANUP_KEY) === "done") return Promise.resolve();
    if (!promptCacheCleanup) {
        promptCacheCleanup = promptCacheStore
            .clear()
            .then(() => window.localStorage.setItem(PROMPT_CACHE_CLEANUP_KEY, "done"))
            .finally(() => {
                promptCacheCleanup = undefined;
            });
    }
    return promptCacheCleanup;
}
```

The success marker is written only after the isolated store is cleared. A rejection leaves the marker absent so the next startup retries.

- [ ] **Step 4: Trigger cleanup during client initialization**

Update the prompt service import in `web/src/components/layout/client-root-init.tsx` and add an effect before the URL-parameter effect:

```ts
import { clearLegacyPromptCache } from "@/services/api/prompts";

useEffect(() => {
    void clearLegacyPromptCache().catch(() => undefined);
}, []);
```

Do not show a global error or block rendering if IndexedDB cleanup fails.

- [ ] **Step 5: Run the focused contract test**

Run: `npm run test:prompt-cleanup`

Expected: PASS, 2 tests passed.

- [ ] **Step 6: Commit the cleanup implementation**

```bash
git add web/src/services/api/prompt-source-presets.ts web/src/stores/use-prompt-source-store.ts web/src/services/api/prompts.ts web/src/components/layout/client-root-init.tsx
git commit -m "feat: clear remote prompt sources"
```

### Task 3: Record the user-visible change

**Files:**
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the manual verification item**

Add this bullet under the introductory list in `docs/content/docs/progress/pending-test.mdx`:

```md
- Prompt source cleanup: a new browser should show no default prompt sources and 0 prompts; upgrading an existing browser should discard every previously configured remote source and clear only the `prompt_cache` IndexedDB store while preserving canvases, assets, generation history, and AI configuration.
```

- [ ] **Step 2: Add the Unreleased changelog entry**

Add this entry under `## Unreleased` in `CHANGELOG.md`:

```md
+ [调整] 提示词中心移除全部默认及已保存的远程来源，并在升级时清理旧提示词缓存，为后续本地提示词管理做准备。
```

- [ ] **Step 3: Confirm TODO needs no change**

Read `docs/content/docs/progress/todo.mdx`. Do not edit it because this cleanup was not represented as an existing TODO item and the local management page remains a separately scoped future change.

- [ ] **Step 4: Commit the documentation update**

```bash
git add docs/content/docs/progress/pending-test.mdx CHANGELOG.md
git commit -m "docs: record prompt source cleanup"
```

### Task 4: Final source review

**Files:**
- Review only: all files changed in Tasks 1–3

- [ ] **Step 1: Inspect the final diff**

Run: `git diff HEAD~3 -- web/src web/tests web/package.json docs/content/docs/progress/pending-test.mdx CHANGELOG.md`

Expected: only prompt-source defaults, pre-v3 migration, isolated cache cleanup, its source-contract test, and required documentation changed.

- [ ] **Step 2: Confirm remote presets are gone**

Run: `rg -n "banana-prompt-quicker|awesome-gpt-image|youmind-|raw.githubusercontent.com/yukkcat/image-prompts" web/src`

Expected: no matches.

- [ ] **Step 3: Leave build and manual browser verification to the user**

Do not run the project build, typecheck, or browser QA. The repository instruction explicitly assigns those checks to the user. Report the focused contract-test result and the exact manual checks recorded in `pending-test.mdx`.
