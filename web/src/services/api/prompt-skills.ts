import { AgentApiError, createCodexSkill, fetchCodexSkill, fetchCodexSkills, importCodexSkill, updateCodexSkill, type AgentSkillDetail, type AgentSkillInterface } from "./canvas-agent";

type PromptSkillValues = {
    id: string;
    title: string;
    description: string;
    prompt: string;
};

export async function syncPromptSkill(endpoint: string, token: string, values: PromptSkillValues) {
    let detail: AgentSkillDetail | undefined;
    try {
        detail = (await fetchCodexSkill(endpoint, token, values.id)).data;
    } catch (error) {
        if (!(error instanceof AgentApiError) || error.status !== 404) throw error;
    }

    if (!detail) {
        const external = (await fetchCodexSkills(endpoint, token, true)).data
            ?.filter((skill) => skill.name === values.id && !skill.managed && skill.enabled)
            .sort((left, right) => (left.scope === "user" ? -1 : 0) - (right.scope === "user" ? -1 : 0))[0];
        if (external) detail = (await importCodexSkill(endpoint, token, external)).data;
    }

    const skillInterface: AgentSkillInterface = { ...(detail?.interface || {}), displayName: values.title };
    const input = { description: values.description, instructions: values.prompt, interface: skillInterface };
    if (!detail) return createCodexSkill(endpoint, token, { name: values.id, ...input });
    if (detail.description === input.description && detail.instructions === input.instructions && detail.interface?.displayName === input.interface.displayName) {
        return { ok: true, data: detail };
    }
    return updateCodexSkill(endpoint, token, values.id, { ...input, expectedRevision: detail.revision });
}
