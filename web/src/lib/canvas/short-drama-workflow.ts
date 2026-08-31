import { nanoid } from "nanoid";

import { createCanvasNode } from "@/lib/canvas/canvas-node-factory";
import type { Prompt } from "@/services/api/prompts";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasConnection, type CanvasEmbeddedSkill, type CanvasNodeData } from "@/types/canvas";

export const SHORT_DRAMA_WORKFLOW_SOURCE_ID = "short-drama-workflow";

const WORKFLOW_ID = "short-drama-skill-sequence";
const NODE_GAP = 88;
const IMAGE_PROMPT_SKILLS = new Set(["generate-keyframe-prompts-strict-asset-binding", "first-frame-shot-reference-prompts"]);
const CONCISE_IMAGE_NEGATIVE = "不改变人物身份、脸、发型与已确认服装；不增删人物；不出现明显手部错误、字幕或水印。";

export function createShortDramaWorkflow(project: CanvasProject, prompts: Prompt[], orderedPromptIds: string[]) {
    const promptsById = new Map(prompts.map((item) => [item.id, item]));
    const orderedPrompts = orderedPromptIds.map((id) => promptsById.get(id)).filter((item): item is Prompt => Boolean(item));
    if (!orderedPrompts.length) throw new Error("请先加入至少一张 Skill 卡片");

    const workflowId = `${WORKFLOW_ID}:${nanoid()}`;
    const startX = project.nodes.length ? Math.max(...project.nodes.map((node) => node.position.x + node.width)) + 120 : 80;
    const startY = project.nodes.length ? Math.min(...project.nodes.map((node) => node.position.y)) : 100;
    const input = workflowNode(CanvasNodeType.Text, startX, startY, "工作流输入", {
        content: "",
        prompt: "",
        status: "success",
        fontSize: 14,
        workflowId,
        workflowRole: "input",
        workflowStep: 0,
    });
    const skillNodes = orderedPrompts.map((prompt, index) => {
        const imageOutput = IMAGE_PROMPT_SKILLS.has(prompt.id);
        return workflowNode(CanvasNodeType.Text, startX + (index + 1) * (input.width + NODE_GAP), startY, `${index + 1}. ${prompt.title}`, {
            content: prompt.prompt,
            prompt: prompt.prompt,
            status: "success",
            fontSize: 14,
            workflowId,
            workflowRole: "skill",
            workflowStep: index + 1,
            workflowSkill: prompt.id,
            workflowOutput: imageOutput ? "image" : "text",
            workflowExecutor: "embedded",
            workflowGenerationMode: imageOutput ? "canvas-native" : undefined,
            workflowEmbeddedSkill: embeddedWorkflowSkill(prompt),
        });
    });
    const lastSkill = skillNodes.at(-1)!;
    const output = workflowNode(CanvasNodeType.Text, nextX(lastSkill), startY, "工作流最终输出索引", {
        content: "",
        prompt: "",
        status: "success",
        fontSize: 14,
        workflowId,
        workflowRole: "output",
        workflowStep: orderedPrompts.length + 1,
    });
    const nodes = [input, ...skillNodes, output];

    return {
        nodes,
        connections: connectWorkflowNodes(nodes),
        viewport: { x: 80 - input.position.x * 0.6, y: 100 - startY * 0.6, k: 0.6 },
        agentPrompt: shortDramaWorkflowAgentPrompt(orderedPrompts),
    };
}

export function embeddedWorkflowSkill(prompt: Prompt): CanvasEmbeddedSkill {
    return {
        id: prompt.id,
        sourceId: prompt.sourceId,
        title: prompt.title,
        description: prompt.description,
        instructions: prompt.prompt,
        updatedAt: prompt.updatedAt || new Date().toISOString(),
    };
}

function workflowNode(type: CanvasNodeType.Text | CanvasNodeType.Image, x: number, y: number, title: string, metadata: CanvasNodeData["metadata"]) {
    const node = createCanvasNode(type, { x: x + 170, y: y + 120 }, metadata);
    return { ...node, title };
}

function nextX(node: CanvasNodeData) {
    return node.position.x + node.width + NODE_GAP;
}

function connectWorkflowNodes(nodes: CanvasNodeData[]): CanvasConnection[] {
    return nodes.slice(1).map((node, index) => ({ id: nanoid(), fromNodeId: nodes[index].id, toNodeId: node.id }));
}

function shortDramaWorkflowAgentPrompt(prompts: Prompt[]) {
    const conversionStep = prompts.findIndex((prompt) => prompt.id === "convert-script-to-ai-video");
    const steps = prompts.map((prompt, index) => {
        const followup = IMAGE_PROMPT_SKILLS.has(prompt.id)
            ? ` 对每条通过门禁的分支，先创建该 VID 的完整提示词节点，再按帧编号逐张创建画布原生生图配置并生成真实图片节点；不得调用本机或外部生图 Skill，不得把多个 VID 或多个关键帧合成一次生图。每张提示词用正向描述明确绑定 character_id、canonical_name、asset_id 与实际参考节点；负面提示词保持精简，默认只写“${CONCISE_IMAGE_NEGATIVE}”，仅在当前画面存在明确额外风险时补充一项。`
            : " 为每条分支保留完整独立文本输出，再进入下一步。";
        const input = conversionStep >= 0 && index > conversionStep ? "对每个仍活跃的 VID 分支分别调用，以上一分支节点的完整结果、原始 VID 和所属 SCENE 上下文作为输入" : "以上一步的完整结果作为输入";
        const audit = prompt.id === "script-character-asset-audit" ? " 先建立一份全剧共享的人物身份与资产映射，再为每个 VID 输出独立审核节点；共享映射只能作为参考，不能代替逐 VID 结果。" : "";
        const exportContract = prompt.id === "optimized-video-shot-prompt-compiler" ? " 每个成功 VID 的优化视频提示词必须保存在独立文本节点，并写入 workflowArtifactType=video-prompt、workflowSourceVidId、workflowSceneId、workflowBranchStatus=success；节点正文只放该 VID 可直接执行的完整视频提示词，不得使用“同上”或依赖其他 VID 正文。" : "";
        return `${index + 1}. 读取第 ${index + 1} 个 Skill 节点 metadata.workflowEmbeddedSkill.instructions 的完整内容作为本步唯一权威规则（${prompt.id}，“${prompt.title}”），${input}。不得从本机 Skill 目录或 $skill-name 调用同名 Skill。${audit}${followup}${exportContract}`;
    });
    return [
        "执行当前画布中刚创建的内嵌 Skill 工作流。先读取画布状态，再严格按节点从左到右的连接顺序执行，不得跳步、并行、合并或自行改序。",
        "工作流节点中的 metadata.workflowEmbeddedSkill 是随画布保存的完整 Skill 快照，也是执行时的唯一权威来源；不要读取、安装、同步或调用本机 .codex/skills、.agents/skills 或同名 $skill-name。",
        "先读取“工作流输入”节点和用户本轮提供的文件或文件路径；两处都没有输入时，停止执行并提示我先提供，不得虚构输入。",
        "如果输入包含文件或文件路径，必须先完整读取文件，并把未经剧情改写的全部原始内容连同文件名、工作表或页码、Excel 行号或单元格等来源完整写入“工作流输入”节点；不得只写文件路径、摘要、抽样内容或处理后的脚本。",
        "读取期间在“工作流输入”节点顶部持续更新原文提取进度；提取完成后保留完整原文并标记已完成。后续步骤不得覆盖、删减或改写该原始输入节点。",
                  "只有“工作流输入”节点已经包含可追溯的完整原始内容时才允许执行第一步；内容为空、仍只有文件路径或读取不完整时必须停止并报告阻断项。",
                  "跨工作表关联场景时，不能只用 S01、S02 等场景代码作为唯一键；必须同时核对场景代码、场景名称、时间段和来源工作表/行。相同代码对应不同名称或时间时标记 scene-association-conflict 并阻断受影响 VID，禁止把一张表的场景设定静默覆盖另一张表的镜头场景。",
        ...(prompts.some((prompt) => prompt.id === "convert-script-to-ai-video")
            ? [
                  "执行 convert-script-to-ai-video 后，不得把全部 SCENE 和 VID 正文堆在“AI脚本转化”节点。该节点只保留提取与转化进度、SCENE/VID 总数和顺序索引。",
                  "为每个 SCENE-xxx 创建一个独立画布分组；为该场景的每个 VID-xxx 创建一个独立文本节点，并通过 groupId 放入对应 SCENE 分组。VID 节点必须包含该段完整、自足的标题、来源、场景、人物、道具、全部镜头、声音、逐字台词和结束状态，不得使用“同上”或只放摘要。",
                  "每个 SCENE 分组写入 workflowRole=scene、workflowSceneId；每个原始 VID 节点写入 workflowRole=vid、workflowSceneId、workflowSourceVidId=自身 VID 编号和 workflowBranchStatus=success。",
                  "SCENE 分组按原剧本顺序排列，组内 VID 按编号排列；分组尺寸必须容纳全部分支节点且不能重叠。将 AI 脚本转化索引节点连接到每个 SCENE 分组。",
                  "从 AI 脚本转化后的第一个 Skill 开始，禁止把所有 VID 合并后交给单个结果节点。必须以每个 VID 节点为分支起点逐一执行后续所有 Skill，并为每个 Skill、每个 VID 创建独立输出节点。",
                  "每个分支输出节点必须与它实际读取的上一分支节点直接连线，并写入 workflowRole=step-output、workflowSkill、workflowStep、workflowSceneId、workflowSourceNodeId、workflowSourceVidId 和 workflowBranchStatus；不得只靠标题或正文猜测来源。",
                  "同一 VID 的节点按 Skill 顺序从左到右排成一条链，同一 SCENE 的不同 VID 分行排列。每个 Skill 执行完成后，把它的主节点从 workflowRole=skill 改为 workflowRole=index；该索引节点只保留该步总进度、成功/BLOCK/失败数量和逐 VID 节点索引，并由每个 VID 的该步输出节点直接连接，不得堆放所有分支正文。",
                  "某个 VID 出现缺失输入、审核 BLOCK 或执行失败时，只把该 VID 的 workflowBranchStatus 标记为 blocked 或 error，并创建可追溯的阻断节点；不得阻止其他仍满足条件的 VID 分支继续执行。",
              ]
            : []),
        ...steps,
        "每一步都必须遵守对应 Skill 的职责、输入要求和完成边界，并把中间文本与图片结果保留在画布上，供下一步和人工审查使用。",
        ...(prompts.some((prompt) => IMAGE_PROMPT_SKILLS.has(prompt.id))
            ? [
                  "图片必须按 SCENE、VID、帧编号严格串行生成：第一张使用逐人物审核 PASS 的原始人物资产白名单及必要的场景/道具资产；从第二张开始，referenceNodeIds 必须同时包含同一组权威原始资产和紧邻的上一张已确认图片节点。上一张图只锁定其中重叠人物的脸、发型、体型、已确认服装配饰及连续状态，不能覆盖原始资产或新增剧情；上一张没有当前人物时，改用该人物最近一张已确认图，仍不存在时只用其权威原始资产，禁止把无关人物图硬作为身份参考。",
                  "为最终落盘建立标准化产物元数据：权威人物资产图片节点写入 workflowArtifactType=character-asset、workflowAssetId；权威场景资产图片节点写入 workflowArtifactType=scene-asset、workflowAssetId。每张关键参考图的完整生图提示词必须保存在独立文本节点，并写入 workflowArtifactType=keyframe-prompt、workflowFrameId、workflowFrameOrder、workflowSourceVidId、workflowSceneId；对应真实图片节点写入 workflowArtifactType=keyframe-image 和相同的帧、VID、SCENE 字段。",
                  "一张图片只有在生成成功且跨帧人物一致性校验 PASS 后才算已确认。为每张结果写入 workflowFrameId、workflowFrameOrder、workflowPreviousConfirmedNodeId、workflowIdentityReferenceNodeIds、workflowAuthoritativeAssetNodeIds、workflowFrameStatus、workflowConsistencyStatus 和 workflowConsistencyReportNodeId；第一张的 workflowPreviousConfirmedNodeId 留空。下一张不得在上一张确认前开始，也不得跳过可用的紧邻确认图。",
                  "每张图片生成后，创建一个画布原生 text 生成配置作为独立一致性校验节点，把当前结果图、该帧权威人物资产和上一张身份参考图都通过 referenceNodeIds 直接接入。校验提示词必须要求首行只输出 PASS 或 BLOCK，随后按 character_id 简要列出人物集合、脸、发型、体型、服装变体和关键配饰差异；不得用生图提示词自述代替对真实结果图的多模态检查。无法读取图片或无法确认时一律 BLOCK。PASS 时把图片标记为 confirmed 并继续；不一致、人物增删、无法辨认或参考冲突时标记 blocked，记录最小差异并停止该 VID 后续帧，不能静默接受或让漂移继续传递。",
                  `所有关键帧仍须保留完整、自足的正向画面描述，不能只写“沿用上一张”。负面提示词默认保持为“${CONCISE_IMAGE_NEGATIVE}”，不要堆叠与当前画面无关的通用负面词。`,
              ]
            : []),
        ...(prompts.some((prompt) => prompt.id === "first-frame-shot-reference-prompts") ? ["KF-REF 是指定 Shot 与时间点的重要镜头参考图，不是尾帧；不得将它重新解释为尾帧。"] : []),
        "最终产物必须满足内置“导出视频工作流”协议：每个成功 VID 可独立解析到本幕人物资产、场景资产、关键参考图、逐图生图提示词和优化视频提示词；不得把这些依赖只写在汇总节点或聊天消息里。",
        "全部选定步骤完成后，“工作流最终输出索引”节点只写总进度和逐 VID 最终节点索引；每个 VID 的完整最终结果保留在它自己的末端节点，并由末端节点连接到该索引。不得把所有最终正文重新合并，不执行未编排的 Skill。",
    ].join("\n");
}
