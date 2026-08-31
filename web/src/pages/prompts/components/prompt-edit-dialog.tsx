import { useEffect } from "react";
import { Alert, Button, Form, Input, Modal, Popconfirm, Select, Space } from "antd";
import { useTranslation } from "react-i18next";

import type { Prompt } from "@/services/api/prompts";

type PromptEditValues = {
    title: string;
    description: string;
    prompt: string;
    tags: string[];
};

export function PromptEditDialog({ prompt, hasOverride, syncing, onClose, onSave, onReset }: { prompt: Prompt | null; hasOverride: boolean; syncing: boolean; onClose: () => void; onSave: (values: PromptEditValues) => Promise<void>; onReset: () => Promise<void> }) {
    const { t } = useTranslation();
    const [form] = Form.useForm<PromptEditValues>();

    useEffect(() => {
        if (!prompt) return;
        form.setFieldsValue({ title: prompt.title, description: prompt.description, prompt: prompt.prompt, tags: prompt.tags });
    }, [form, prompt]);

    const save = (values: PromptEditValues) =>
        onSave({
            title: values.title.trim(),
            description: values.description?.trim() || "",
            prompt: values.prompt.trim(),
            tags: (values.tags || []).map((tag) => tag.trim()).filter(Boolean),
        });

    return (
        <Modal
            title={t("prompts.editTitle", { title: prompt?.title || "" })}
            open={Boolean(prompt)}
            onCancel={onClose}
            closable={!syncing}
            maskClosable={!syncing}
            width={860}
            centered
            styles={{ body: { maxHeight: "72dvh", overflowY: "auto" } }}
            footer={
                <div className="flex items-center justify-between gap-3">
                    <div>
                        {hasOverride ? (
                            <Popconfirm title={t("prompts.resetConfirm")} onConfirm={onReset} okText={t("prompts.resetOriginal")} cancelText={t("common.cancel")}>
                                <Button danger disabled={syncing} loading={syncing}>{t("prompts.resetOriginal")}</Button>
                            </Popconfirm>
                        ) : null}
                    </div>
                    <Space>
                        <Button disabled={syncing} onClick={onClose}>{t("common.cancel")}</Button>
                        <Button type="primary" loading={syncing} onClick={() => form.submit()}>{t("common.save")}</Button>
                    </Space>
                </div>
            }
        >
            <Alert className="mb-4" type="info" showIcon message={t("prompts.embeddedSkillNotice")} />
            <Form form={form} layout="vertical" onFinish={save} requiredMark={false} disabled={syncing}>
                <Form.Item name="title" label={t("prompts.editFields.title")} rules={[{ required: true, whitespace: true }]}>
                    <Input />
                </Form.Item>
                <Form.Item name="description" label={t("prompts.editFields.description")} rules={[{ required: true, whitespace: true }]}>
                    <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} />
                </Form.Item>
                <Form.Item name="tags" label={t("prompts.editFields.tags")}>
                    <Select mode="tags" tokenSeparators={[",", "，"]} open={false} />
                </Form.Item>
                <Form.Item name="prompt" label={t("prompts.editFields.prompt")} rules={[{ required: true, whitespace: true }]}>
                    <Input.TextArea autoSize={{ minRows: 16, maxRows: 28 }} className="font-mono text-sm leading-6" />
                </Form.Item>
            </Form>
        </Modal>
    );
}
