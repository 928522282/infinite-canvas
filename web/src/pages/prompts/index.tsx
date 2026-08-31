import { ArrowLeft, ArrowRight, ArrowUpRight, FolderPlus, ListPlus, ListX, Pencil, RotateCcw, Search, Workflow, X } from "lucide-react";
import { Fragment, type ReactNode, type UIEvent, useEffect, useState } from "react";
import { App, Button, Empty, Input, Select, Spin, Tag } from "antd";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import { PromptCard } from "@/components/prompts/prompt-card";
import { usePromptList } from "@/components/prompts/use-prompt-list";
import { PromptDetailDialog } from "./components/prompt-detail-dialog";
import { PromptEditDialog } from "./components/prompt-edit-dialog";
import { useCopyText } from "@/hooks/use-copy-text";
import { createCanvasNode } from "@/lib/canvas/canvas-node-factory";
import { createShortDramaWorkflow, embeddedWorkflowSkill, SHORT_DRAMA_WORKFLOW_SOURCE_ID } from "@/lib/canvas/short-drama-workflow";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/use-agent-store";
import { useAgentSkillStore } from "@/stores/use-agent-skill-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { promptOverrideKey, usePromptEditorStore } from "@/stores/use-prompt-editor-store";
import { usePromptWorkflowStore } from "@/stores/use-prompt-workflow-store";
import { PROMPT_CENTER_SKILL_IDS } from "@/lib/prompt-center-skills";
import { syncPromptSkill } from "@/services/api/prompt-skills";
import { ALL_PROMPTS_OPTION, fetchOriginalSourcePrompts, fetchSourcePrompts, type Prompt } from "@/services/api/prompts";
import { CanvasNodeType } from "@/types/canvas";

export default function PromptsPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [titleKeyword, setTitleKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
    const [targetProjectId, setTargetProjectId] = useState("");
    const [workflowInserting, setWorkflowInserting] = useState(false);
    const [promptSyncing, setPromptSyncing] = useState(false);
    const addAsset = useAssetStore((state) => state.addAsset);
    const canvasHydrated = useCanvasStore((state) => state.hydrated);
    const projects = useCanvasStore((state) => state.projects);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const updateEmbeddedSkill = useCanvasStore((state) => state.updateEmbeddedSkill);
    const promptOverrides = usePromptEditorStore((state) => state.overrides);
    const savePromptOverride = usePromptEditorStore((state) => state.saveOverride);
    const removePromptOverride = usePromptEditorStore((state) => state.removeOverride);
    const agentConnected = useAgentStore((state) => state.connected);
    const agentUrl = useAgentStore((state) => state.url);
    const agentToken = useAgentStore((state) => state.token);
    const orderedPromptIds = usePromptWorkflowStore((state) => state.orderedPromptIds);
    const addWorkflowPrompt = usePromptWorkflowStore((state) => state.addPrompt);
    const removeWorkflowPrompt = usePromptWorkflowStore((state) => state.removePrompt);
    const copyText = useCopyText();
    const { query, items: promptItems, tags: promptTags, categories: promptCategoryOptions, total: totalPrompts } = usePromptList({ keyword: titleKeyword, tags: selectedTags, category: selectedCategory });

    useEffect(() => {
        if (query.isError) message.error(query.error instanceof Error ? query.error.message : t("prompts.loadFailed"));
    }, [message, query.error, query.isError, t]);

    useEffect(() => {
        if (!canvasHydrated) return;
        if (!projects.some((project) => project.id === targetProjectId)) setTargetProjectId(projects[0]?.id || "");
    }, [canvasHydrated, projects, targetProjectId]);

    useEffect(() => {
        if (!canvasHydrated) return;
        promptItems
            .filter((item) => item.sourceId === SHORT_DRAMA_WORKFLOW_SOURCE_ID && PROMPT_CENTER_SKILL_IDS.has(item.id))
            .forEach((item) => updateEmbeddedSkill(embeddedWorkflowSkill(item)));
    }, [canvasHydrated, promptItems, updateEmbeddedSkill]);

    const toggleTag = (tag: string) => {
        if (tag === ALL_PROMPTS_OPTION) return setSelectedTags([]);
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };

    const savePromptAsset = (item: Prompt) => {
        addAsset({ kind: "text", title: item.title, coverUrl: item.coverUrl, tags: item.tags, source: item.category, data: { content: item.prompt }, metadata: { source: "prompt-library", promptId: item.id, githubUrl: item.githubUrl } });
        message.success(t("common.addedToAssets"));
    };

    const inputPromptOnCanvas = (item: Prompt) => {
        const project = projects.find((candidate) => candidate.id === targetProjectId);
        if (!project) return message.warning(t("prompts.selectCanvasFirst"));
        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
        const rightmost = project.nodes.reduce((result, node) => (!result || node.position.x + node.width > result.position.x + result.width ? node : result), project.nodes[0]);
        const center = rightmost
            ? { x: rightmost.position.x + rightmost.width + 80 + spec.width / 2, y: rightmost.position.y + spec.height / 2 }
            : { x: 80 + spec.width / 2, y: 100 + spec.height / 2 };
        const node = { ...createCanvasNode(CanvasNodeType.Text, center, { content: item.prompt, prompt: item.prompt, status: "success", fontSize: 14 }), title: item.title };
        updateProject(project.id, { nodes: [...project.nodes, node], viewport: { x: 80 - node.position.x, y: 100 - node.position.y, k: 1 } });
        message.success(t("prompts.inputToCanvasSuccess", { title: item.title }));
        navigate(`/canvas/${project.id}`);
    };

    const inputWorkflowOnCanvas = async () => {
        const project = projects.find((candidate) => candidate.id === targetProjectId);
        if (!project) return message.warning(t("prompts.selectCanvasFirst"));
        if (!orderedPromptIds.length) return message.warning(t("prompts.workflowEmpty"));
        setWorkflowInserting(true);
        try {
            const prompts = await fetchSourcePrompts(SHORT_DRAMA_WORKFLOW_SOURCE_ID);
            const selectedPrompts = orderedPromptIds.map((id) => prompts.find((item) => item.id === id)).filter((item): item is Prompt => Boolean(item));
            if (selectedPrompts.length !== orderedPromptIds.length || selectedPrompts.some((item) => !PROMPT_CENTER_SKILL_IDS.has(item.id))) throw new Error(t("prompts.skillSyncUnsupported"));
            const workflow = createShortDramaWorkflow(project, prompts, orderedPromptIds);
            updateProject(project.id, {
                nodes: [...project.nodes, ...workflow.nodes],
                connections: [...project.connections, ...workflow.connections],
                viewport: workflow.viewport,
            });
            const agent = useAgentStore.getState();
            agent.setAgentState({ prompt: workflow.agentPrompt, activeTab: "chat" });
            agent.openPanel();
            message.success(t("prompts.workflowInputSuccess"));
            navigate(`/canvas/${project.id}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("prompts.workflowInputFailed"));
        } finally {
            setWorkflowInserting(false);
        }
    };

    const saveEditedPrompt = async (values: { title: string; description: string; prompt: string; tags: string[] }) => {
        if (!editingPrompt) return;
        if (!PROMPT_CENTER_SKILL_IDS.has(editingPrompt.id)) return message.error(t("prompts.skillSyncUnsupported"));
        const current = editingPrompt;
        setPromptSyncing(true);
        try {
            savePromptOverride({ sourceId: current.sourceId, promptId: current.id, ...values });
            const updated = { ...current, ...values, updatedAt: new Date().toISOString() };
            updateEmbeddedSkill(embeddedWorkflowSkill(updated));
            await syncLocalSkill(updated);
            setEditingPrompt(null);
            message.success(t("prompts.editSaved"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("prompts.editSaveFailed"));
        } finally {
            setPromptSyncing(false);
        }
    };

    const resetEditedPrompt = async () => {
        if (!editingPrompt) return;
        const current = editingPrompt;
        setPromptSyncing(true);
        try {
            const original = (await fetchOriginalSourcePrompts(current.sourceId)).find((item) => item.id === current.id);
            if (!original) throw new Error(t("prompts.sourceMissing"));
            removePromptOverride(current.sourceId, current.id);
            updateEmbeddedSkill(embeddedWorkflowSkill(original));
            await syncLocalSkill(original);
            setEditingPrompt(null);
            message.success(t("prompts.resetSuccess"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("prompts.editSaveFailed"));
        } finally {
            setPromptSyncing(false);
        }
    };

    const syncLocalSkill = async (prompt: Prompt) => {
        if (!agentConnected) return;
        const endpoint = agentUrl.trim().replace(/\/$/, "");
        try {
            await syncPromptSkill(endpoint, agentToken, { id: prompt.id, title: prompt.title, description: prompt.description, prompt: prompt.prompt });
            await useAgentSkillStore.getState().loadSkills(endpoint, agentToken, true);
        } catch {
            message.warning(t("prompts.localSkillSyncFailed"));
        }
    };

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) void query.fetchNextPage();
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <main className="min-h-0 flex-1 overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-4 py-6 [background-size:16px_16px] sm:px-6 lg:py-8 dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)]" onScroll={handleListScroll}>
                <div className="mx-auto max-w-7xl">
                    <div className="text-center">
                        <h1 className="text-2xl font-semibold text-stone-950 dark:text-stone-100">{t("prompts.title")}</h1>
                        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t("prompts.total", { count: totalPrompts })}</p>
                    </div>
                    <div className="mt-5 grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6">
                        <aside className="thin-scrollbar max-h-72 overflow-y-auto border-b border-stone-200 pb-5 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-6rem)] lg:border-b-0 lg:border-r lg:pb-8 lg:pr-5 dark:border-stone-800">
                            <PromptFilter label={t("prompts.category")} options={promptCategoryOptions} selected={selectedCategory} onChange={setSelectedCategory} />
                            <div className="mt-6">
                                <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-stone-400 dark:text-stone-500">{t("prompts.tags")}</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {promptTags.map((tag) => {
                                        const active = tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag);
                                        return <Tag.CheckableTag key={tag} checked={active} className={cn("prompt-filter-tag", active && "is-active")} onChange={() => toggleTag(tag)}>{tag === ALL_PROMPTS_OPTION ? t("common.all") : tag}</Tag.CheckableTag>;
                                    })}
                                </div>
                            </div>
                        </aside>
                        <section className="min-w-0">
                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_240px_auto]">
                                <Input size="large" prefix={<Search className="size-4 text-stone-400" />} value={titleKeyword} placeholder={t("prompts.search")} onChange={(event) => setTitleKeyword(event.target.value)} />
                                <Select
                                    size="large"
                                    value={targetProjectId || undefined}
                                    aria-label={t("prompts.targetCanvas")}
                                    placeholder={canvasHydrated && !projects.length ? t("prompts.noCanvas") : t("prompts.selectCanvas")}
                                    disabled={!canvasHydrated || !projects.length}
                                    options={projects.map((project) => ({ label: t("prompts.canvasOption", { title: project.title }), value: project.id }))}
                                    onChange={setTargetProjectId}
                                />
                                <Button size="large" type="primary" icon={<Workflow className="size-4" />} loading={workflowInserting} disabled={!canvasHydrated || !projects.length} onClick={() => void inputWorkflowOnCanvas()}>
                                    {t("prompts.inputWorkflow")}
                                </Button>
                            </div>
                            <WorkflowComposer items={promptItems} />
                            {query.isLoading ? <div className="flex h-60 items-center justify-center"><Spin /></div> : null}
                            {!query.isLoading ? <div className="mt-5"><PromptGrid items={promptItems} onOpen={setSelectedPrompt} renderActions={(item) => <Fragment><Button type="text" size="small" icon={<Pencil className="size-3.5" />} onClick={() => setEditingPrompt(item)}>{t("common.edit")}</Button><Button type="text" size="small" icon={<ArrowUpRight className="size-3.5" />} onClick={() => inputPromptOnCanvas(item)}>{t("prompts.inputToCanvas")}</Button><Button type="text" size="small" icon={orderedPromptIds.includes(item.id) ? <ListX className="size-3.5" /> : <ListPlus className="size-3.5" />} onClick={() => orderedPromptIds.includes(item.id) ? removeWorkflowPrompt(item.id) : addWorkflowPrompt(item.id)}>{orderedPromptIds.includes(item.id) ? t("prompts.removeFromWorkflow") : t("prompts.addToWorkflow")}</Button><Button type="text" size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => savePromptAsset(item)}>{t("common.addToAssets")}</Button></Fragment>} onCopy={(item) => copyText(item.prompt, t("common.promptCopied"))} emptyText={t("prompts.empty")} /></div> : null}
                            <div className="mt-6 text-center text-xs text-stone-500 dark:text-stone-400">{query.isFetchingNextPage ? t("prompts.loading") : query.hasNextPage ? t("prompts.loadMore") : promptItems.length > 0 ? t("prompts.end") : null}</div>
                        </section>
                    </div>
                </div>
            </main>

            <PromptDetailDialog prompt={selectedPrompt} onClose={() => setSelectedPrompt(null)} onCopy={(prompt) => copyText(prompt, t("common.promptCopied"))} onSaveAsset={savePromptAsset} />
            <PromptEditDialog
                prompt={editingPrompt}
                hasOverride={Boolean(editingPrompt && promptOverrides[promptOverrideKey(editingPrompt.sourceId, editingPrompt.id)])}
                syncing={promptSyncing}
                onClose={() => { if (!promptSyncing) setEditingPrompt(null); }}
                onSave={saveEditedPrompt}
                onReset={resetEditedPrompt}
            />
        </div>
    );
}

function WorkflowComposer({ items }: { items: Prompt[] }) {
    const { t } = useTranslation();
    const orderedPromptIds = usePromptWorkflowStore((state) => state.orderedPromptIds);
    const movePrompt = usePromptWorkflowStore((state) => state.movePrompt);
    const removePrompt = usePromptWorkflowStore((state) => state.removePrompt);
    const reset = usePromptWorkflowStore((state) => state.reset);

    return (
        <div className="mt-4 border-y border-stone-200 py-4 dark:border-stone-800">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-stone-950 dark:text-stone-100"><Workflow className="size-4" />{t("prompts.workflowComposer")}</div>
                    <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{t("prompts.workflowComposerDescription")}</p>
                </div>
                <Button type="text" size="small" icon={<RotateCcw className="size-3.5" />} onClick={reset}>{t("prompts.resetWorkflow")}</Button>
            </div>
            {orderedPromptIds.length ? (
                <div className="thin-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
                    {orderedPromptIds.map((id, index) => {
                        const item = items.find((candidate) => candidate.id === id);
                        return (
                            <div key={id} className="flex min-w-56 items-center gap-3 border-r border-stone-200 pr-3 last:border-r-0 dark:border-stone-800">
                                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-stone-900 text-xs font-semibold text-white dark:bg-stone-100 dark:text-stone-900">{index + 1}</span>
                                {item?.coverUrl ? <img src={item.coverUrl} alt="" className="h-14 w-10 shrink-0 rounded object-cover" /> : null}
                                <span className="min-w-0 flex-1 truncate text-xs font-medium text-stone-800 dark:text-stone-200" title={item?.title || id}>{item?.title || id}</span>
                                <span className="flex shrink-0 items-center">
                                    <Button type="text" size="small" aria-label={t("prompts.moveEarlier")} disabled={index === 0} icon={<ArrowLeft className="size-3.5" />} onClick={() => movePrompt(id, -1)} />
                                    <Button type="text" size="small" aria-label={t("prompts.moveLater")} disabled={index === orderedPromptIds.length - 1} icon={<ArrowRight className="size-3.5" />} onClick={() => movePrompt(id, 1)} />
                                    <Button type="text" size="small" aria-label={t("prompts.removeFromWorkflow")} icon={<X className="size-3.5" />} onClick={() => removePrompt(id)} />
                                </span>
                            </div>
                        );
                    })}
                </div>
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("prompts.workflowEmptyDescription")} className="my-2" />}
        </div>
    );
}

function PromptFilter({ label, options, selected, onChange }: { label: string; options: string[]; selected: string; onChange: (value: string) => void }) {
    const { t } = useTranslation();
    return <div><div className="mb-2 text-xs font-semibold uppercase tracking-widest text-stone-400 dark:text-stone-500">{label}</div><div className="flex flex-wrap gap-1.5">{options.map((option) => <Tag.CheckableTag key={option} checked={selected === option} className={cn("prompt-filter-tag", selected === option && "is-active")} onChange={() => onChange(option)}>{option === ALL_PROMPTS_OPTION ? t("common.all") : option}</Tag.CheckableTag>)}</div></div>;
}

function PromptGrid({ items, onOpen, onCopy, renderActions, emptyText }: { items: Prompt[]; onOpen: (item: Prompt) => void; onCopy: (item: Prompt) => void; renderActions: (item: Prompt) => ReactNode; emptyText: string }) {
    return <div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{items.map((item) => <PromptCard key={`${item.sourceId}:${item.id}`} item={item} onOpen={() => onOpen(item)} onCopy={() => onCopy(item)} extraAction={renderActions(item)} />)}</div>{items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} className="py-16" /> : null}</div>;
}
