# Infinite Canvas Codex Plugin

让 Codex 可以打开并操作 Infinite Canvas。

## 安装

直接从 GitHub 安装发布版：

```bash
codex plugin marketplace add 928522282/infinite-canvas --ref v0.18.2
codex plugin add infinite-canvas@infinite-canvas-local
```

如需检出源码：

```bash
git clone --branch v0.18.2 https://github.com/928522282/infinite-canvas.git
cd infinite-canvas
codex plugin marketplace add .
codex plugin add infinite-canvas@infinite-canvas-local
```

仓库和插件不包含 API Key。画布中配置的服务密钥只保存在用户自己的浏览器本地，不随插件发布或同步。

发布版内置提示词中心的 7 个短剧 Skill、当前三步工作流（AI脚本转化 → 关键帧资产强约束 → Seedance 2.5）和最新版 SilkDock 生图/视频协议。插件会优先复用已经授权的 `http://localhost:3000` 来源，因此打开的是同一份浏览器本地画布、资产和提示词数据。

Windows 版插件使用 Codex 自带 Node 启动内嵌 Canvas Agent，不要求任务环境另外安装或配置 Node、npm、npx。

安装后新建一个 Codex 任务，然后输入：

```text
帮我打开并连接到 Infinite Canvas
```
