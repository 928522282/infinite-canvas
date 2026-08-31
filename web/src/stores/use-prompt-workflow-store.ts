import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";

export const DEFAULT_PROMPT_WORKFLOW_IDS = [
    "convert-script-to-ai-video",
    "script-character-asset-audit",
    "generate-keyframe-prompts",
    "first-frame-shot-reference-prompts",
    "micro-expression-video-generator",
    "optimized-video-shot-prompt-compiler",
];

type PromptWorkflowStore = {
    orderedPromptIds: string[];
    addPrompt: (id: string) => void;
    removePrompt: (id: string) => void;
    movePrompt: (id: string, direction: -1 | 1) => void;
    reset: () => void;
};

export const usePromptWorkflowStore = create<PromptWorkflowStore>()(
    persist(
        (set) => ({
            orderedPromptIds: DEFAULT_PROMPT_WORKFLOW_IDS,
            addPrompt: (id) => set((state) => ({ orderedPromptIds: state.orderedPromptIds.includes(id) ? state.orderedPromptIds : [...state.orderedPromptIds, id] })),
            removePrompt: (id) => set((state) => ({ orderedPromptIds: state.orderedPromptIds.filter((item) => item !== id) })),
            movePrompt: (id, direction) =>
                set((state) => {
                    const index = state.orderedPromptIds.indexOf(id);
                    const target = index + direction;
                    if (index < 0 || target < 0 || target >= state.orderedPromptIds.length) return state;
                    const orderedPromptIds = [...state.orderedPromptIds];
                    [orderedPromptIds[index], orderedPromptIds[target]] = [orderedPromptIds[target], orderedPromptIds[index]];
                    return { orderedPromptIds };
                }),
            reset: () => set({ orderedPromptIds: DEFAULT_PROMPT_WORKFLOW_IDS }),
        }),
        {
            name: "infinite-canvas:prompt_workflow_store",
            storage: createJSONStorage(() => localForageStorage),
            partialize: (state) => ({ orderedPromptIds: state.orderedPromptIds }),
        },
    ),
);
