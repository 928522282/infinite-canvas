---
name: silkdock-media
description: Directly generate or edit images and videos through SilkDock with minimal agent processing. Use automatically for requests to generate, create, draw, render, edit, animate, or make an image, picture, poster, illustration, photo, animation, or video. Default unspecified media to image with gpt-image-2 and video to wan-2.6. Send prompts verbatim unless prompt optimization is explicitly requested. Upload actual reference files for edits.
---

# SilkDock Media

Minimize latency: read this file once, then issue one generation command and one final response.

## Rules

1. Default to `image`; use `video` only for explicit video, animation, motion, footage, duration, or camera-movement intent.
2. Pass the user's visual content verbatim as `--prompt`. Do not optimize, translate, expand, or add quality terms unless explicitly requested.
3. Default images to `gpt-image-2` and videos to `wan-2.6`. Add `--model` only for an explicitly named model.
4. Pass supplied references themselves and preserve their order. For image edits, repeat `--reference`; add `--mask` for a local inpainting mask. For video, keep a single ordinary source/start image as `--input-reference`. Treat wording such as multiple images, multi-image reference, multimodal reference, character/subject/style reference, or consistency reference as multimodal and repeat `--reference-image`. Use `--reference-video` and `--reference-audio` for those media types. Never collapse reference video/audio or multiple semantic reference images into `input_reference`.
5. Never bypass a denied data transfer. For private/internal references that policy will not send, generate a generic text-only template through SilkDock and add the real data locally.
6. Run immediately. Do not run `models`, `mkdir`, `ls`, another SKILL read, reference inspection, planning, or post-generation checks. The script creates a unique output path when `--out` is omitted.
7. The script owns SilkDock polling: images at least 5 seconds apart and videos at least 10 seconds apart. Never query task status separately.
8. Success requires process exit `0` and terminal JSON `{"status":"completed","terminal":true}`. Link its exact `output` path. A process without `exit_code` is still running; never restart or search for its output.

## Command

```bash
python3 <skill-dir>/scripts/silkdock_media.py <image|video> \
  --prompt "<user content verbatim>" \
  [--reference <URL_OR_LOCAL_PATH> ...] \
  [--input-reference <URL_OR_LOCAL_PATH>] \
  [--reference-image <URL_OR_LOCAL_PATH> ...] \
  [--reference-video <URL_OR_LOCAL_PATH> ...] \
  [--reference-audio <URL_OR_LOCAL_PATH> ...] \
  [--model <explicit-model-id>]
```

Use `--out` only when the user requests a specific destination. Video also accepts `--first-frame` and `--last-frame` when the selected model supports them. Other optional fields are `--size`, `--aspect-ratio`, `--quality`, `--duration`, `--fps`, `--output-format`, and repeatable `--param KEY=JSON_VALUE`.

## One-Call Wait

Keep process launch and all local waiting inside one `functions.exec` JavaScript call:

```javascript
let r = await tools.exec_command({
  cmd: "python3 <skill-dir>/scripts/silkdock_media.py <image|video> --prompt <shell-quoted-prompt>",
  workdir: "<workspace>", yield_time_ms: 30000, max_output_tokens: 3000
});
while (r.session_id !== undefined) {
  r = await tools.write_stdin({
    session_id: r.session_id, chars: "", yield_time_ms: 55000,
    max_output_tokens: 3000
  });
}
text(JSON.stringify(r));
```

Add required escalation fields to `exec_command`. If the outer call yields a cell ID, resume only that cell with a long wait; its JavaScript continues running. Do not wake the Agent to poll the local process.

Read Codex credentials from `${CODEX_HOME}/auth.json` or `~/.codex/auth.json` without printing the key. Read the active base URL from Codex config, falling back to `https://silkdock.ai/v1`.
