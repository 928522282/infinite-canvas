import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const promptsPage = readFileSync(`${webRoot}src/pages/prompts/index.tsx`, "utf8");
const promptService = readFileSync(`${webRoot}src/services/api/prompts.ts`, "utf8");
const promptEditorStore = readFileSync(`${webRoot}src/stores/use-prompt-editor-store.ts`, "utf8");
const promptWorkflowStore = readFileSync(`${webRoot}src/stores/use-prompt-workflow-store.ts`, "utf8");
const promptSkillService = readFileSync(`${webRoot}src/services/api/prompt-skills.ts`, "utf8");
const promptEditDialog = readFileSync(`${webRoot}src/pages/prompts/components/prompt-edit-dialog.tsx`, "utf8");
const agentSkillsView = readFileSync(`${webRoot}src/components/agent/agent-skills-view.tsx`, "utf8");
const shortDramaWorkflow = readFileSync(`${webRoot}src/lib/canvas/short-drama-workflow.ts`, "utf8");
const promptSourceRuntime = readFileSync(`${webRoot}src/services/api/prompt-source-runtime.ts`, "utf8");

test("the Prompt Center can insert an editable prompt copy into a selected canvas", () => {
    assert.match(promptsPage, /useCanvasStore\(\(state\) => state\.projects\)/);
    assert.match(promptsPage, /aria-label=\{t\("prompts\.targetCanvas"\)\}/);
    assert.match(promptsPage, /createCanvasNode\(CanvasNodeType\.Text,[\s\S]*content:\s*item\.prompt,[\s\S]*prompt:\s*item\.prompt/);
    assert.match(promptsPage, /updateProject\(project\.id,\s*\{\s*nodes:\s*\[\.\.\.project\.nodes,\s*node\]/);
    assert.match(promptsPage, /navigate\(`\/canvas\/\$\{project\.id\}`\)/);
});

test("prompt edits are persisted locally and applied without replacing the source", () => {
    assert.match(promptsPage, /setEditingPrompt\(item\)/);
    assert.match(promptsPage, /savePromptOverride\(\{\s*sourceId:\s*editingPrompt\.sourceId,\s*promptId:\s*editingPrompt\.id/);
    assert.match(promptEditorStore, /createJSONStorage\(\(\) => localForageStorage\)/);
    assert.match(promptEditorStore, /removeOverride:[\s\S]*delete overrides\[promptOverrideKey/);
    assert.match(promptService, /function applyPromptOverrides/);
    assert.match(promptService, /return applyPromptOverrides\(settled\.flat\(\)\)/);
});

test("Prompt Center updates embedded canvas Skills without requiring an Agent connection", () => {
    assert.match(promptsPage, /savePromptOverride[\s\S]*updateEmbeddedSkill\(embeddedWorkflowSkill\(updated\)\)/);
    assert.match(promptsPage, /fetchOriginalSourcePrompts[\s\S]*removePromptOverride[\s\S]*updateEmbeddedSkill\(embeddedWorkflowSkill\(original\)\)/);
    assert.doesNotMatch(promptEditDialog, /disabled=\{!agentConnected/);
    assert.match(promptEditDialog, /embeddedSkillNotice/);
    assert.match(promptsPage, /if \(!agentConnected\) return/);
    assert.match(promptsPage, /localSkillSyncFailed/);
    assert.match(promptSkillService, /fetchCodexSkill\(endpoint, token, values\.id\)/);
    assert.match(promptSkillService, /createCodexSkill\(endpoint, token/);
    assert.match(promptSkillService, /fetchCodexSkills\(endpoint, token, true\)/);
    assert.match(promptSkillService, /importCodexSkill\(endpoint, token, external\)/);
    assert.match(promptSkillService, /expectedRevision:\s*detail\.revision/);
    assert.match(agentSkillsView, /promptCenterManaged/);
    assert.match(agentSkillsView, /skill\.managed && !promptCenterManaged/);
});

test("Prompt Center persists and inserts a user-arranged Skill workflow", () => {
    assert.match(promptsPage, /fetchSourcePrompts\(SHORT_DRAMA_WORKFLOW_SOURCE_ID\)/);
    assert.match(promptsPage, /createShortDramaWorkflow\(project, prompts, orderedPromptIds\)/);
    assert.match(promptsPage, /movePrompt\(id, -1\)/);
    assert.match(promptsPage, /movePrompt\(id, 1\)/);
    assert.match(promptWorkflowStore, /createJSONStorage\(\(\) => localForageStorage\)/);
    assert.match(promptWorkflowStore, /orderedPromptIds:\s*DEFAULT_PROMPT_WORKFLOW_IDS/);
    assert.match(promptWorkflowStore, /"convert-script-to-ai-video",\s*"script-character-asset-audit",\s*"generate-keyframe-prompts-strict-asset-binding"/);
    assert.match(promptWorkflowStore, /LEGACY_KEYFRAME_SKILL_ID[\s\S]*STRICT_KEYFRAME_SKILL_ID/);
    assert.match(promptWorkflowStore, /"first-frame-shot-reference-prompts",\s*"micro-expression-video-generator",\s*"optimized-video-shot-prompt-compiler"/);
    assert.match(promptWorkflowStore, /removePrompt:[\s\S]*filter/);
    assert.match(shortDramaWorkflow, /orderedPromptIds\.map/);
    assert.match(shortDramaWorkflow, /workflowSkill:\s*prompt\.id/);
    assert.match(shortDramaWorkflow, /workflowEmbeddedSkill:\s*embeddedWorkflowSkill\(prompt\)/);
    assert.match(shortDramaWorkflow, /workflowExecutor:\s*"embedded"/);
    assert.match(shortDramaWorkflow, /workflowGenerationMode:\s*imageOutput \? "canvas-native"/);
    assert.match(shortDramaWorkflow, /IMAGE_PROMPT_SKILLS/);
    assert.match(shortDramaWorkflow, /不得从本机 Skill 目录或 \$skill-name 调用同名 Skill/);
    assert.match(shortDramaWorkflow, /画布原生生图功能/);
    assert.match(shortDramaWorkflow, /strictly|严格按节点从左到右/);
    assert.match(shortDramaWorkflow, /用户本轮提供的文件或文件路径/);
    assert.match(shortDramaWorkflow, /未经剧情改写的全部原始内容/);
    assert.match(shortDramaWorkflow, /不得只写文件路径、摘要、抽样内容或处理后的脚本/);
    assert.match(shortDramaWorkflow, /持续更新原文提取进度/);
    assert.match(shortDramaWorkflow, /后续步骤不得覆盖、删减或改写该原始输入节点/);
    assert.match(shortDramaWorkflow, /仍只有文件路径或读取不完整时必须停止/);
    assert.match(shortDramaWorkflow, /不得把全部 SCENE 和 VID 正文堆在“AI脚本转化”节点/);
    assert.match(shortDramaWorkflow, /为每个 SCENE-xxx 创建一个独立画布分组/);
    assert.match(shortDramaWorkflow, /为该场景的每个 VID-xxx 创建一个独立文本节点/);
    assert.match(shortDramaWorkflow, /通过 groupId 放入对应 SCENE 分组/);
    assert.match(shortDramaWorkflow, /将 AI 脚本转化索引节点连接到每个 SCENE 分组/);
    assert.match(shortDramaWorkflow, /禁止把所有 VID 合并后交给单个结果节点/);
    assert.match(shortDramaWorkflow, /以每个 VID 节点为分支起点逐一执行后续所有 Skill/);
    assert.match(shortDramaWorkflow, /workflowSourceNodeId、workflowSourceVidId/);
    assert.match(shortDramaWorkflow, /把它的主节点从 workflowRole=skill 改为 workflowRole=index/);
    assert.match(shortDramaWorkflow, /每个 VID 的该步输出节点直接连接/);
    assert.match(shortDramaWorkflow, /只把该 VID 的 workflowBranchStatus 标记为 blocked 或 error/);
    assert.match(shortDramaWorkflow, /共享映射只能作为参考，不能代替逐 VID 结果/);
    assert.match(shortDramaWorkflow, /不得把多个 VID 合成一次生图/);
    assert.match(shortDramaWorkflow, /“工作流最终输出索引”节点只写总进度和逐 VID 最终节点索引/);
    assert.match(shortDramaWorkflow, /workflowNode\(CanvasNodeType\.Text,[\s\S]*"工作流最终输出索引"/);
    assert.match(shortDramaWorkflow, /不得将它重新解释为尾帧/);
});

test("workflow metadata keeps per-VID branch lineage", () => {
    const canvasTypes = readFileSync(`${webRoot}src/types/canvas.ts`, "utf8");
    assert.match(canvasTypes, /workflowRole\?:\s*"input"\s*\|\s*"skill"\s*\|\s*"index"\s*\|\s*"scene"\s*\|\s*"vid"\s*\|\s*"step-output"/);
    assert.match(canvasTypes, /workflowSourceNodeId\?:\s*string/);
    assert.match(canvasTypes, /workflowSourceVidId\?:\s*string/);
    assert.match(canvasTypes, /workflowBranchStatus\?:\s*"pending"\s*\|\s*"running"\s*\|\s*"success"\s*\|\s*"blocked"\s*\|\s*"error"/);
    assert.match(canvasTypes, /workflowEmbeddedSkill\?:\s*CanvasEmbeddedSkill/);
});

test("long bundled Skills load their complete Markdown body", () => {
    const source = JSON.parse(readFileSync(`${webRoot}public/prompts/short-drama-workflow.json`, "utf8"));
    const skill = source.find((item) => item.id === "sd25-pe");
    const markdown = readFileSync(`${webRoot}public/prompts/skills/sd25-pe/SKILL.md`, "utf8");
    assert.equal(skill.promptUrl, "/prompts/skills/sd25-pe/SKILL.md");
    assert.ok(markdown.length > 60_000);
    assert.match(markdown, /name: sd25-pe/);
    assert.match(markdown, /# Seedance 2\.5 Prompt Optimizer/);
    assert.match(markdown, /## 最终自检/);
    assert.match(promptSourceRuntime, /async function promptBody/);
    assert.match(promptSourceRuntime, /response\.text\(\)/);
});
