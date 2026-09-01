---
name: short-drama-workflow-current
description: "Run the user's current three-stage Infinite Canvas short-drama workflow in its saved order: script conversion, strict asset-bound keyframes, then Seedance 2.5 prompt optimization. Use when the user asks to use, restore, or continue the workflow configured in Prompt Center."
---

# Current Short-Drama Workflow

Treat this Skill as the published snapshot of the workflow arranged in the final `http://localhost:3000` frontend.

## Required order

1. Apply `convert-script-to-ai-video` to the complete source script.
2. For every resulting active VID, apply `generate-keyframe-prompts-strict-asset-binding` independently with the actual character and scene assets connected on the canvas.
3. For every successful VID branch, apply `sd25-pe` to compile the final Seedance 2.5 prompt without changing the locked story facts or asset mappings.

Do not merge separate VID branches after step 1. A blocked VID stops only its own branch. Keep source VID, SCENE, character assets, scene assets, keyframe prompts, and final video prompts traceable through direct canvas connections.

## Canvas behavior

- Reuse the current Infinite Canvas origin and project; do not switch between localhost and an online origin.
- Read actual connected nodes before each stage. Never infer asset identity from filenames alone.
- Preserve the user's T-shirt version or other explicitly selected character variant throughout the branch.
- Treat a scene overview, multi-view grid, and original scene image as different reference responsibilities. Do not silently replace one with another.
- Create downstream nodes from the output node of the preceding stage so the visible graph matches the required order.

Use `silkdock-media` only when the user asks to submit image or video generation. Prompt compilation by itself does not authorize generation.
