import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";

export type PromptOverride = {
    sourceId: string;
    promptId: string;
    title: string;
    description: string;
    prompt: string;
    tags: string[];
    updatedAt: string;
};

type PromptEditorStore = {
    hydrated: boolean;
    revision: number;
    overrides: Record<string, PromptOverride>;
    saveOverride: (override: Omit<PromptOverride, "updatedAt">) => void;
    removeOverride: (sourceId: string, promptId: string) => void;
};

const PROMPT_EDITOR_STORE_KEY = "infinite-canvas:prompt_editor_store";

export function promptOverrideKey(sourceId: string, promptId: string) {
    return `${sourceId}:${promptId}`;
}

export const usePromptEditorStore = create<PromptEditorStore>()(
    persist(
        (set) => ({
            hydrated: false,
            revision: 0,
            overrides: {},
            saveOverride: (override) =>
                set((state) => ({
                    revision: state.revision + 1,
                    overrides: {
                        ...state.overrides,
                        [promptOverrideKey(override.sourceId, override.promptId)]: { ...override, updatedAt: new Date().toISOString() },
                    },
                })),
            removeOverride: (sourceId, promptId) =>
                set((state) => {
                    const overrides = { ...state.overrides };
                    delete overrides[promptOverrideKey(sourceId, promptId)];
                    return { overrides, revision: state.revision + 1 };
                }),
        }),
        {
            name: PROMPT_EDITOR_STORE_KEY,
            storage: createJSONStorage(() => localForageStorage),
            partialize: (state) => ({ overrides: state.overrides }),
            onRehydrateStorage: () => () => usePromptEditorStore.setState({ hydrated: true }),
        },
    ),
);
