import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { enforceAiLimits, recordAiCall } from "../server/ai-limits.js";
import { describeImages, inferenceConfigured, visionModel } from "../server/vultr.js";
import { owner } from "./lib/owner.js";

const MAX_FRAMES = 16;
const BATCH = 4;

const PROMPT = (start: number, end: number) => `These are consecutive screenshots (frames ${start}-${end}) of a person doing a task at work.
For EACH frame, write one line: "Frame N: <app/site> — <what the person is doing>". Be concrete: name the
spreadsheet, the column headers you can read, filters or values, the email recipient/subject, what they type
into a search box, the website they open, buttons clicked. If a frame shows nothing new, say "no change".
If a frame only shows the recording tool itself (OrgTwin, a screen-share or microphone permission prompt),
write "Frame N: recorder" and nothing else. Do not guess beyond what is visible.`;

function noise(line: string) {
  const low = line.toLowerCase();
  return low.includes("no change") || low.replace(/[. ]+$/, "").endsWith("recorder") || low.includes("orgtwin");
}

function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = (arr.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => arr[Math.round(i * step)]!);
}

// People-only: the browser sends keyframes of a screen recording; a Vultr vision model describes them.
// Frames are processed in memory and never stored; only the text observations come back.
export default defineAction({
  description: "Describe keyframes of a screen recording with the Vultr vision model (Skill Recorder).",
  schema: z.object({
    frames: z
      .array(z.string().startsWith("data:image/").max(600_000))
      .max(48)
      .describe("JPEG data URLs, in order"),
  }),
  agentTool: false,
  mcpTool: false,
  toolCallable: false,
  run: async ({ frames }, ctx) => {
    const email = owner(ctx);
    if (!inferenceConfigured()) {
      return { model: null, observations: [], note: "No Vultr inference key, so the skill is learned from the narration only." };
    }
    const model = await visionModel();
    if (!model) {
      return { model: null, observations: [], note: "No vision model on this Vultr subscription (set VULTR_VISION_MODEL); learning from the narration only." };
    }
    await enforceAiLimits(email);
    const picked = sample(frames, MAX_FRAMES);
    const observations: string[] = [];
    for (let i = 0; i < picked.length; i += BATCH) {
      const batch = picked.slice(i, i + BATCH);
      const res = await describeImages(PROMPT(i + 1, i + batch.length), batch);
      if (!res) break;
      await recordAiCall(email, res.model, res.usage, "skill-recorder");
      observations.push(
        ...res.text
          .split("\n")
          .map((l) => l.replace(/^[\s\-•*]+/, "").trim())
          .filter((l) => l && !noise(l)),
      );
    }
    return { model, framesUsed: picked.length, observations: observations.slice(0, 60), note: null };
  },
});
