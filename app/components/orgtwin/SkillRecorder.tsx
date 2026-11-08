import { useActionMutation } from "@agent-native/core/client/hooks";
import { Textarea } from "@agent-native/toolkit/ui/textarea";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import type { Department } from "../../../shared/types";
import { askAgent } from "./agent";
import {
  MAX_KEYFRAMES,
  canRecordScreen,
  canTranscribe,
  evenly,
  framesFromVideo,
  startScreenCapture,
  startSpeech,
  type Keyframe,
  type ScreenSession,
  type Speech,
} from "./capture";

type Stage = "intro" | "recording" | "extracting" | "captured" | "learning";

/** Re-encode a keyframe smaller so 16 of them fit comfortably in one request. */
async function shrink(url: string, maxW = 768): Promise<string> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const scale = Math.min(1, maxW / img.width);
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.6);
}

export function SkillRecorder({ dept, onClose }: { dept: Department; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>("intro");
  const [frames, setFrames] = useState<Keyframe[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [narration, setNarration] = useState("");
  const [interim, setInterim] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<ScreenSession | null>(null);
  const speech = useRef<Speech | null>(null);
  const t0 = useRef(0);
  const observe = useActionMutation("observe-recording");

  useEffect(() => {
    if (stage !== "recording") return;
    const id = window.setInterval(() => setSeconds((performance.now() - t0.current) / 1000), 250);
    return () => window.clearInterval(id);
  }, [stage]);
  useEffect(() => () => speech.current?.stop(), []);

  const record = async () => {
    setError(null);
    try {
      session.current = await startScreenCapture(
        (f: Keyframe) => setFrames((fs) => [...fs, f].slice(-MAX_KEYFRAMES)),
        () => void stop(),
      );
      setFrames([]);
      t0.current = performance.now();
      setStage("recording");
      speech.current = startSpeech(
        (fin: string, int: string) => {
          if (fin) setNarration(fin);
          setInterim(int);
        },
        (m: string) => setError(m),
      );
    } catch (e: any) {
      if (e?.name !== "NotAllowedError") setError(`Screen recording failed: ${e?.message ?? e}`);
    }
  };

  const stop = async () => {
    speech.current?.stop();
    speech.current = null;
    setInterim("");
    const s = session.current;
    session.current = null;
    if (!s) return;
    const out = await s.stop();
    setVideoUrl(out.videoUrl);
    setSeconds(out.seconds);
    if (out.blob) {
      // Live sampling is throttled in background tabs; re-read the full recording and keep the richer set.
      setStage("extracting");
      setProgress(0);
      try {
        const again = await framesFromVideo(new File([out.blob], "recording.webm", { type: "video/webm" }), setProgress);
        setFrames(again.frames.length > out.frames.length ? again.frames : out.frames);
      } catch {
        setFrames(out.frames);
      }
    } else {
      setFrames(out.frames);
    }
    setStage("captured");
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setStage("extracting");
    setProgress(0);
    try {
      const out = await framesFromVideo(file, setProgress);
      setFrames(out.frames);
      setVideoUrl(out.videoUrl);
      setSeconds(out.seconds);
      setStage("captured");
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStage("intro");
    }
  };

  const useDemo = async () => {
    const blob = await fetch("/samples/skill-demo.webm").then((r) => r.blob());
    await upload(new File([blob], "skill-demo.webm", { type: "video/webm" }));
    if (!narration) {
      setNarration(
        "I open the leads spreadsheet and look at the rows where status is New. For each one I write a short follow up email and send it, then I mark the row as contacted. Finally I tell the team on Slack.",
      );
    }
  };

  const learn = async () => {
    setError(null);
    setStage("learning");
    let observations: string[] = [];
    let note: string | null = null;
    let model: string | null = null;
    if (frames.length) {
      try {
        const picked = await Promise.all(evenly(frames, 16).map((f: Keyframe) => shrink(f.url)));
        const res: any = await observe.mutateAsync({ frames: picked });
        observations = res?.observations ?? [];
        note = res?.note ?? null;
        model = res?.model ?? null;
      } catch (e: any) {
        note = `The vision step failed (${e?.message ?? e}); learning from the narration only.`;
      }
    }
    const evidence = [
      observations.length ? `What was seen on screen (${model}):\n${observations.join("\n")}` : "",
      narration.trim() ? `What the person said while doing it:\n${narration.trim()}` : "",
      note ? `Note: ${note}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    askAgent(
      `I recorded myself doing a task for the ${dept.name} team. Turn the recording into a skill and save it with save-skill: reproduce the same task in a general way, grant only the tools its steps need, and tell me what you picked up.`,
      `Department id ${dept.id}. Recording: ${Math.round(seconds)} s, ${frames.length} keyframes.\n\n${evidence || "(no evidence captured)"}`,
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Record a skill">
      <div className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-xl border bg-background p-5 shadow-xl">
        <header className="flex items-center gap-2">
          <span className="text-xl">🎬</span>
          <h2 className="text-lg font-semibold">Record a skill for {dept.name}</h2>
          <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {stage === "intro" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Do the task once while talking through it. Keyframes are picked in your browser (only when the screen
              changes); a Vultr vision model describes them, and the agent turns that plus your narration into a skill
              you can edit. The video never leaves your browser.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={record} disabled={!canRecordScreen()}>
                ⏺ Record my screen
              </Button>
              <label className="inline-flex cursor-pointer items-center rounded-md border px-3 text-sm hover:bg-accent">
                ⬆ Upload a video
                <input type="file" accept="video/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
              </label>
              <Button variant="outline" onClick={useDemo}>
                ▶ Use the demo recording
              </Button>
              <a className="self-center text-xs text-muted-foreground underline" href="/samples/practice-desk.html" target="_blank" rel="noreferrer">
                practice page to record on
              </a>
            </div>
            {!canTranscribe() && (
              <p className="text-xs text-muted-foreground">Live transcription needs Chrome or Edge; you can type the narration.</p>
            )}
          </div>
        )}

        {stage === "recording" && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
              <span className="text-sm font-medium tabular-nums">Recording · {Math.floor(seconds)} s · {frames.length} keyframes</span>
              <Button size="sm" variant="destructive" className="ml-auto" onClick={() => void stop()}>
                ■ Stop
              </Button>
            </div>
            <p className="min-h-12 rounded-md border bg-muted/40 p-2 text-sm">
              {narration}
              <span className="text-muted-foreground">{interim}</span>
              {!narration && !interim && <span className="text-muted-foreground">Talk through what you do…</span>}
            </p>
          </div>
        )}

        {stage === "extracting" && (
          <div className="space-y-2">
            <p className="text-sm">Picking keyframes from the video…</p>
            <div className="h-2 overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        )}

        {(stage === "captured" || stage === "learning") && (
          <div className="space-y-3">
            {videoUrl && <video src={videoUrl} controls className="max-h-56 w-full rounded-md bg-black" />}
            <p className="text-xs text-muted-foreground">
              {Math.round(seconds)} s · {frames.length} keyframes (up to 16 are sent to the vision model)
            </p>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {frames.map((f, i) => (
                <img key={i} src={f.url} alt={`Keyframe at ${f.t.toFixed(1)} s`} className="h-14 rounded border" />
              ))}
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Narration</span>
              <Textarea value={narration} onChange={(e) => setNarration(e.target.value)} rows={3} placeholder="What you did and why (optional but helps a lot)" />
            </label>
            <div className="flex gap-2">
              <Button onClick={learn} disabled={stage === "learning" || (!frames.length && !narration.trim())}>
                {stage === "learning" ? "Reading the recording…" : "✦ Learn this skill"}
              </Button>
              <Button variant="ghost" onClick={() => setStage("intro")}>
                Start over
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
