import { saveAs } from "file-saver";

import i18n from "@/i18n";
import { createZip } from "@/lib/zip";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

type ExportEntry = { name: string; data: BlobPart };
type WorkflowAssetType = "character" | "scene";

type WorkflowAssetManifest = {
    assetId: string;
    type: WorkflowAssetType;
    title: string;
    canvasNodeId: string;
    file: string;
    bytes: number;
    sha256: string;
};

type WorkflowFrameManifest = {
    frameId: string;
    canvasNodeId: string;
    image: string;
    imageSha256: string;
    prompt: string;
    promptSha256: string;
};

export type VideoWorkflowExportIndex = {
    schema: "infinite-canvas/video-workflow-export@1";
    projectId: string;
    exportedAt: string;
    jobs: { vidId: string; sceneId: string; directory: string; manifest: string }[];
};

export async function exportVideoWorkflow(project: CanvasProject, fileName = project.title) {
    const { files, index } = await buildVideoWorkflowExport(project);
    const zip = await createZip(files);
    saveAs(zip, `${safeFileName(fileName)}-${i18n.t("canvas.videoWorkflowExport.fileSuffix")}.zip`);
    return index;
}

export async function buildVideoWorkflowExport(project: CanvasProject) {
    const videoPromptNodes = project.nodes.filter(isVideoPromptNode);
    if (!videoPromptNodes.length) throw new Error(i18n.t("canvas.videoWorkflowExport.noVideoPrompts"));

    const files: ExportEntry[] = [];
    const jobs: VideoWorkflowExportIndex["jobs"] = [];
    const errors: string[] = [];

    for (const videoPromptNode of [...videoPromptNodes].sort(compareVidNodes)) {
        const vidId = nodeVidId(videoPromptNode);
        if (!vidId || jobs.some((job) => job.vidId === vidId)) continue;
        try {
            const job = await buildVidJob(project, videoPromptNode, vidId, files);
            jobs.push(job);
        } catch (error) {
            errors.push(error instanceof Error ? error.message : `${vidId}: ${String(error)}`);
        }
    }

    if (errors.length) throw new Error(errors.join("\n"));
    if (!jobs.length) throw new Error(i18n.t("canvas.videoWorkflowExport.noReadyJobs"));

    const index: VideoWorkflowExportIndex = {
        schema: "infinite-canvas/video-workflow-export@1",
        projectId: project.id,
        exportedAt: new Date().toISOString(),
        jobs,
    };
    files.unshift({ name: "workflow-index.json", data: JSON.stringify(index, null, 2) });
    return { files, index };
}

async function buildVidJob(project: CanvasProject, videoPromptNode: CanvasNodeData, vidId: string, files: ExportEntry[]) {
    const vidNodes = project.nodes.filter((node) => nodeVidId(node) === vidId);
    const keyframes = vidNodes.filter(isKeyframeImageNode).sort(compareFrames);
    if (!keyframes.length) throw new Error(i18n.t("canvas.videoWorkflowExport.missingKeyframes", { vid: vidId }));

    const sceneId = videoPromptNode.metadata?.workflowSceneId || vidNodes.find((node) => node.metadata?.workflowSceneId)?.metadata?.workflowSceneId || "";
    const directory = vidId;
    const frameManifests: WorkflowFrameManifest[] = [];
    const assetNodes = collectVidAssetNodes(project.nodes, keyframes, videoPromptNode);
    const characterAssets = assetNodes.filter((node) => assetType(node) === "character");
    const sceneAssets = assetNodes.filter((node) => assetType(node) === "scene");
    if (!characterAssets.length) throw new Error(i18n.t("canvas.videoWorkflowExport.missingCharacterAssets", { vid: vidId }));
    if (!sceneAssets.length) throw new Error(i18n.t("canvas.videoWorkflowExport.missingSceneAssets", { vid: vidId }));

    for (const [index, keyframe] of keyframes.entries()) {
        const frameId = nodeFrameId(keyframe) || `KF-${String(index + 1).padStart(2, "0")}`;
        const prompt = findKeyframePrompt(vidNodes, keyframe, frameId);
        if (!prompt) throw new Error(i18n.t("canvas.videoWorkflowExport.missingKeyframePrompt", { vid: vidId, frame: frameId }));
        const imageBlob = await nodeBlob(keyframe);
        if (!imageBlob) throw new Error(i18n.t("canvas.videoWorkflowExport.missingNodeFile", { vid: vidId, title: keyframe.title }));

        const imagePath = `${directory}/keyframes/${safeFileName(frameId)}.${fileExtension(imageBlob.type)}`;
        const promptPath = `${directory}/keyframe-prompts/${safeFileName(frameId)}.txt`;
        const promptBlob = new Blob([prompt], { type: "text/plain;charset=utf-8" });
        files.push({ name: imagePath, data: imageBlob }, { name: promptPath, data: promptBlob });
        frameManifests.push({
            frameId,
            canvasNodeId: keyframe.id,
            image: relativeToVid(imagePath),
            imageSha256: await sha256(imageBlob),
            prompt: relativeToVid(promptPath),
            promptSha256: await sha256(promptBlob),
        });
    }

    const assetManifests: WorkflowAssetManifest[] = [];
    for (const node of assetNodes.sort((a, b) => assetId(a).localeCompare(assetId(b)))) {
        const blob = await nodeBlob(node);
        if (!blob) throw new Error(i18n.t("canvas.videoWorkflowExport.missingNodeFile", { vid: vidId, title: node.title }));
        const type = assetType(node)!;
        const id = assetId(node);
        const assetPath = `${directory}/assets/${type === "character" ? "characters" : "scenes"}/${safeFileName(`${id}_${node.title}`)}.${fileExtension(blob.type)}`;
        files.push({ name: assetPath, data: blob });
        assetManifests.push({ assetId: id, type, title: node.title, canvasNodeId: node.id, file: relativeToVid(assetPath), bytes: blob.size, sha256: await sha256(blob) });
    }

    const videoPrompt = nodeText(videoPromptNode);
    if (!videoPrompt) throw new Error(i18n.t("canvas.videoWorkflowExport.missingVideoPrompt", { vid: vidId }));
    const videoPromptPath = `${directory}/video-prompt.txt`;
    const videoPromptBlob = new Blob([videoPrompt], { type: "text/plain;charset=utf-8" });
    files.push({ name: videoPromptPath, data: videoPromptBlob });

    const manifestPath = `${directory}/manifest.json`;
    const manifest = {
        schema: "infinite-canvas/video-workflow-job@1",
        vidId,
        sceneId,
        status: "READY",
        videoPrompt: relativeToVid(videoPromptPath),
        videoPromptSha256: await sha256(videoPromptBlob),
        keyframes: frameManifests,
        assets: assetManifests,
    };
    files.push({ name: manifestPath, data: JSON.stringify(manifest, null, 2) });
    return { vidId, sceneId, directory, manifest: manifestPath };
}

function collectVidAssetNodes(nodes: CanvasNodeData[], keyframes: CanvasNodeData[], videoPromptNode: CanvasNodeData) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const wantedNodeIds = new Set<string>();
    const wantedAssetIds = new Set<string>();
    for (const node of [...keyframes, videoPromptNode]) {
        for (const id of node.metadata?.workflowAuthoritativeAssetNodeIds || []) wantedNodeIds.add(id);
        for (const id of node.metadata?.referenceNodeIds || []) wantedNodeIds.add(id);
        for (const id of node.metadata?.referenceAssetIds || []) wantedAssetIds.add(id);
        const searchable = `${node.metadata?.content || ""}\n${node.metadata?.prompt || ""}`;
        for (const id of searchable.match(/(?:SCENE_)?ASSET_\d+/g) || []) wantedAssetIds.add(id);
    }
    const direct = [...wantedNodeIds].map((id) => byId.get(id)).filter((node): node is CanvasNodeData => Boolean(node && assetType(node)));
    const mapped = nodes.filter((node) => assetType(node) && wantedAssetIds.has(assetId(node)));
    const scoped = nodes.filter((node) => assetType(node) && nodeVidId(node) === nodeVidId(videoPromptNode));
    return [...new Map([...direct, ...mapped, ...scoped].map((node) => [node.id, node])).values()];
}

function findKeyframePrompt(nodes: CanvasNodeData[], keyframe: CanvasNodeData, frameId: string) {
    const explicit = nodes.find((node) => node.type === CanvasNodeType.Text && node.metadata?.workflowArtifactType === "keyframe-prompt" && nodeFrameId(node) === frameId);
    const titled = nodes.find((node) => node.type === CanvasNodeType.Text && nodeFrameId(node) === frameId && /提示词|prompt/i.test(node.title));
    return nodeText(explicit || titled || keyframe).trim();
}

function isVideoPromptNode(node: CanvasNodeData) {
    if (node.type !== CanvasNodeType.Text || !nodeVidId(node) || isBlocked(node)) return false;
    return node.metadata?.workflowArtifactType === "video-prompt" || node.metadata?.workflowSkill === "optimized-video-shot-prompt-compiler" || /视频提示词|video prompt|minimax h3/i.test(node.title);
}

function isKeyframeImageNode(node: CanvasNodeData) {
    if (node.type !== CanvasNodeType.Image || !nodeFrameId(node) || isBlocked(node)) return false;
    return node.metadata?.workflowArtifactType === "keyframe-image" || Boolean(node.metadata?.workflowFrameId) || /关键帧|KF[-_ ]?[A-Z0-9]+/i.test(node.title);
}

function isBlocked(node: CanvasNodeData) {
    return node.metadata?.workflowBranchStatus === "blocked" || node.metadata?.workflowBranchStatus === "error" || node.metadata?.workflowFrameStatus === "blocked" || node.metadata?.workflowConsistencyStatus === "blocked";
}

function nodeVidId(node: CanvasNodeData) {
    const raw = node.metadata?.workflowSourceVidId || node.title.match(/VID[-_ ]?(\d{1,3})/i)?.[0] || "";
    const number = raw.match(/\d+/)?.[0];
    return number ? `VID-${number.padStart(3, "0")}` : "";
}

function nodeFrameId(node: CanvasNodeData) {
    return node.metadata?.workflowFrameId || node.title.match(/KF[-_ ]?[A-Z0-9]+/i)?.[0].replace(/[_ ]/g, "-").toUpperCase() || "";
}

function nodeText(node?: CanvasNodeData) {
    return String(node?.metadata?.content || node?.metadata?.prompt || "");
}

function assetType(node: CanvasNodeData): WorkflowAssetType | null {
    if (node.type !== CanvasNodeType.Image) return null;
    if (node.metadata?.workflowArtifactType === "character-asset") return "character";
    if (node.metadata?.workflowArtifactType === "scene-asset") return "scene";
    if (node.metadata?.sceneAssetId || /SCENE_ASSET/i.test(node.id)) return "scene";
    if (node.metadata?.assetId) return "character";
    return null;
}

function assetId(node: CanvasNodeData) {
    return node.metadata?.workflowAssetId || node.metadata?.sceneAssetId || node.metadata?.assetId || node.id.match(/(?:SCENE_)?ASSET_\d+/i)?.[0] || node.id;
}

async function nodeBlob(node: CanvasNodeData) {
    const storageKey = node.metadata?.storageKey || "";
    if (storageKey) {
        const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
        if (blob) return blob;
    }
    const source = node.metadata?.content || "";
    if (!source || (!source.startsWith("data:") && !source.startsWith("blob:") && !/^https?:\/\//i.test(source))) return null;
    const response = await fetch(source);
    return response.ok ? response.blob() : null;
}

async function sha256(blob: Blob) {
    const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function compareVidNodes(a: CanvasNodeData, b: CanvasNodeData) {
    return nodeVidId(a).localeCompare(nodeVidId(b)) || Number(b.metadata?.workflowArtifactType === "video-prompt") - Number(a.metadata?.workflowArtifactType === "video-prompt") || (b.metadata?.workflowStep || 0) - (a.metadata?.workflowStep || 0);
}

function compareFrames(a: CanvasNodeData, b: CanvasNodeData) {
    return (a.metadata?.workflowFrameOrder || 0) - (b.metadata?.workflowFrameOrder || 0) || nodeFrameId(a).localeCompare(nodeFrameId(b));
}

function relativeToVid(value: string) {
    return value.split("/").slice(1).join("/");
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "video-workflow";
}

function fileExtension(mimeType: string) {
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    return "png";
}
