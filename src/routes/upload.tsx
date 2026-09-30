import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileText, Upload, LoaderCircle, Square, Circle } from "lucide-react";
import { useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { extractOfficeText } from "@/lib/office-text";
import { runTranscribeAudio } from "@/lib/ai/run";
import { formatAudioBytes, formatDurationSec, uploadUserAudio } from "@/lib/audio";
import {
  parseTranscript,
  remapSpeakers,
  serializeSegments,
  uniqueSpeakers,
} from "@/lib/parse-transcript";
import { getStoredResearcher, setStoredResearcher } from "@/lib/researcher";
import { listProjects, createSession } from "@/lib/firebase-db";
import { SESSION_KINDS, type SessionAudio } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { ReadOnlyNotice } from "@/components/read-only-notice";
import { padCode } from "@/lib/utils";

const MAX_AUDIO_BYTES = 200 * 1024 * 1024;

export const Route = createFileRoute("/upload")({
  validateSearch: (search: Record<string, unknown>) => ({
    projectId: typeof search.projectId === "string" ? search.projectId : undefined,
  }),
  component: UploadPage,
});

function UploadPage() {
  const { user, canWrite } = useAuth();
  const uid = user?.uid;
  const qc = useQueryClient();
  const { projectId: qProject } = Route.useSearch();
  const navigate = useNavigate();
  const { data: liveProjects = [] } = useQuery({
    queryKey: ["projects", uid],
    queryFn: () => listProjects(uid!),
    enabled: !!uid,
  });

  const [projectId, setProjectId] = useState(qProject ?? liveProjects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [sessionKind, setSessionKind] = useState("기업 인터뷰");
  const [industry, setIndustry] = useState("");
  const [sizeLabel, setSizeLabel] = useState("");
  const [district, setDistrict] = useState("");
  const [researcher, setResearcher] = useState("");
  const [filename, setFilename] = useState("");
  const [text, setText] = useState("");
  const [speakerMap, setSpeakerMap] = useState<Record<string, string>>({});
  const [dragOver, setDragOver] = useState(false);
  const [reading, setReading] = useState(false);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const durationRef = useRef(0);
  const audioChunksRef = useRef<Blob[]>([]);
  const pendingAudioRef = useRef<{
    blob: Blob;
    filename: string;
    durationSec: number | null;
  } | null>(null);

  // Waveform Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    setResearcher(getStoredResearcher());
  }, []);

  useEffect(() => {
    if (!projectId && liveProjects[0]?.id) setProjectId(qProject ?? liveProjects[0].id);
  }, [liveProjects, projectId, qProject]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [transcribeLabel, setTranscribeLabel] = useState("");
  const [audio, setAudio] = useState<SessionAudio | null>(null);
  const [audioPhase, setAudioPhase] = useState<
    "idle" | "uploading" | "transcribing" | "ready" | "failed"
  >("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const pending = pendingAudioRef.current;
    if (!pending) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pending.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audio, audioPhase]);

  const parsed = useMemo(() => (text ? parseTranscript(text) : []), [text]);
  const speakers = useMemo(() => uniqueSpeakers(parsed), [parsed]);
  const remapped = useMemo(() => remapSpeakers(parsed, speakerMap), [parsed, speakerMap]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Setup Web Audio API for waveform
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const audioCtx = new AudioContextClass();
        const analyser = audioCtx.createAnalyser();
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 2048;
        audioContextRef.current = audioCtx;
        analyserRef.current = analyser;
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        isRecordingRef.current = false;

        if (timerRef.current) window.clearInterval(timerRef.current);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(console.error);
        }

        await handleAudioData(audioBlob, "녹음본.webm", durationRef.current);
      };

      mediaRecorder.start();
      setIsRecording(true);
      isRecordingRef.current = true;
      setRecordingTime(0);
      durationRef.current = 0;
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => {
          const next = prev + 1;
          durationRef.current = next;
          return next;
        });
      }, 1000);

      // Start drawing waveform
      if (canvasRef.current && analyserRef.current) {
        const drawWaveform = () => {
          if (!isRecordingRef.current || !canvasRef.current || !analyserRef.current) return;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          const analyser = analyserRef.current;
          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);

          animationFrameRef.current = requestAnimationFrame(drawWaveform);
          analyser.getByteTimeDomainData(dataArray);

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.lineWidth = 2;
          ctx.strokeStyle = "rgb(239, 68, 68)"; // tailwind destructive color
          ctx.beginPath();

          const sliceWidth = (canvas.width * 1.0) / bufferLength;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * canvas.height) / 2;

            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
            x += sliceWidth;
          }
          ctx.lineTo(canvas.width, canvas.height / 2);
          ctx.stroke();
        };
        drawWaveform();
      }
    } catch (err) {
      toast.error("마이크 권한을 허용해주세요.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  async function readDuration(blob: Blob): Promise<number | null> {
    try {
      const url = URL.createObjectURL(blob);
      const duration = await new Promise<number | null>((resolve) => {
        const el = document.createElement("audio");
        el.preload = "metadata";
        el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : null);
        el.onerror = () => resolve(null);
        el.src = url;
      });
      URL.revokeObjectURL(url);
      return duration;
    } catch {
      return null;
    }
  }

  async function transcribeStored(stored: SessionAudio) {
    setAudioPhase("transcribing");
    setTranscribeLabel("원본 준비 중");
    setIsTranscribing(true);
    try {
      const res = await runTranscribeAudio(
        {
          storagePath: stored.storagePath,
          mimeType: stored.mimeType,
          durationSec: stored.durationSec,
        },
        (p) =>
          setTranscribeLabel(
            p.stage === "preparing"
              ? "원본 준비 중"
              : `전사 중 ${p.part}${p.totalParts ? ` / ${p.totalParts} 구간` : " 구간"}`,
          ),
      );
      if (!res.ok) {
        setAudioPhase("failed");
        toast.error(res.error);
        return;
      }
      setText(res.text);
      setSpeakerMap({});
      setAudioPhase("ready");
      toast.success("음성 전사가 완료되었습니다.");
    } catch (err) {
      setAudioPhase("failed");
      toast.error(err instanceof Error ? err.message : "음성을 처리하지 못했습니다.");
    } finally {
      setIsTranscribing(false);
      setTranscribeLabel("");
    }
  }

  async function handleAudioData(
    file: Blob | File,
    defaultName: string,
    durationSec?: number | null,
  ) {
    if (!uid) {
      toast.error("로그인이 필요합니다.");
      return;
    }
    if (file.size >= MAX_AUDIO_BYTES) {
      toast.error("음성 파일은 200MB보다 작아야 합니다.");
      return;
    }
    const name = (file as File).name || defaultName;
    const ext = name.split(".").pop()?.toLowerCase();
    const fallbackMime = ext === "m4a" ? "audio/mp4" : ext === "mp3" ? "audio/mpeg" : "audio/webm";
    const mimeType = file.type || fallbackMime;
    const blob = file.type ? file : new Blob([await file.arrayBuffer()], { type: mimeType });
    const duration = durationSec ?? (await readDuration(blob));
    pendingAudioRef.current = { blob, filename: name, durationSec: duration ?? null };
    setFilename(name);
    setSpeakerMap({});
    if (!title) setTitle(name.replace(/\.(mp3|wav|m4a|aac|webm)$/i, ""));

    // 1) 원본을 Storage 에 보관
    setAudio(null);
    setAudioPhase("uploading");
    setUploadPct(0);
    let stored: SessionAudio;
    try {
      stored = await uploadUserAudio(uid, blob, name, {
        durationSec: duration ?? null,
        onProgress: setUploadPct,
      });
    } catch (err) {
      setAudioPhase("failed");
      toast.error(err instanceof Error ? err.message : "원본을 보관하지 못했습니다.");
      return;
    }
    setAudio(stored);

    // 2) 보관된 원본으로 전사
    await transcribeStored(stored);
  }

  async function onFile(file: File) {
    if (file.type.startsWith("audio/")) {
      await handleAudioData(file, file.name);
      return;
    }

    setReading(true);
    try {
      const raw = await extractOfficeText(file.name, await file.arrayBuffer());
      setText(raw);
      setFilename(file.name);
      setSpeakerMap({});
      if (!title) {
        setTitle(file.name.replace(/\.(txt|md|docx|hwpx|hwp|doc)$/i, ""));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "파일을 읽지 못했습니다.");
    } finally {
      setReading(false);
    }
  }

  const mutation = useMutation({
    mutationFn: () =>
      createSession(uid!, {
        projectId,
        title,
        sessionDate: sessionDate || null,
        sessionKind,
        industry,
        sizeLabel,
        district,
        researcher,
        filename: filename || audio?.filename || "붙여넣기.txt",
        originalText: serializeSegments(remapped),
        audio,
        segments: remapped.map((seg, i) => ({
          seq: i + 1,
          speaker: seg.speaker,
          ts: seg.ts,
          body: seg.body,
          code: padCode(i + 1),
        })),
      }),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["sessions"] });
      await qc.invalidateQueries({ queryKey: ["projects"] });
      setStoredResearcher(researcher);
      toast.success(
        res.segmentCount > 0 ? `구간 ${res.segmentCount}개를 읽었습니다.` : "원본을 저장했습니다.",
      );
      void navigate({ to: "/sessions/$sessionId", params: { sessionId: res.id } });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSubmit =
    !!projectId && !!title.trim() && audioPhase !== "uploading" && (remapped.length > 0 || !!audio);

  if (!canWrite) return <ReadOnlyNotice />;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">녹취 올리기</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          화자와 구간이 나뉜 텍스트, 워드, 한글(HWPX)을 받습니다. 음성은 원본을 먼저 보관한 뒤
          Gemini Files API로 전사합니다.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) void onFile(file);
            }}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center transition-colors ${
              dragOver ? "border-primary bg-highlight" : "border-border bg-muted/40"
            }`}
          >
            {isTranscribing ? (
              <LoaderCircle className="size-5 text-primary animate-spin" />
            ) : (
              <Upload className="size-5 text-primary" />
            )}
            <span className="text-sm font-medium">
              {audioPhase === "uploading"
                ? `원본 보관 중 ${uploadPct}%`
                : isTranscribing
                  ? `원본은 보관됐습니다. ${transcribeLabel || "전사하는 중"}...`
                  : reading
                    ? "파일을 읽는 중..."
                    : "파일을 놓거나 선택"}
            </span>
            <span className="text-xs text-muted-foreground">
              .txt .docx .hwpx 또는 음성 파일 (.mp3, .wav, .m4a)
            </span>
            <input
              type="file"
              accept=".txt,.md,.docx,.hwpx,.hwp,.doc,text/plain,audio/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
              }}
            />
          </label>
          {audio || audioPhase !== "idle" ? (
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {audioPhase === "uploading"
                    ? `오디오 파일 전송 중 (${uploadPct}%)...`
                    : audioPhase === "transcribing"
                      ? `Gemini 음성 전사 · ${transcribeLabel || "진행 중"}`
                      : audioPhase === "failed"
                        ? "음성 전사 실패"
                        : audioPhase === "ready"
                          ? "음성 인식 및 전사 완료"
                          : "오디오 대기"}
                </p>
                {audioPhase === "uploading" || audioPhase === "transcribing" ? (
                  <span className="text-xs text-primary font-semibold animate-pulse">
                    {audioPhase === "uploading" ? `${uploadPct}%` : "AI 처리 중"}
                  </span>
                ) : null}
              </div>
              {audioPhase === "uploading" ? (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.max(5, uploadPct)}%` }}
                  />
                </div>
              ) : null}
              {audio ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {audio.filename}
                  {formatDurationSec(audio.durationSec)
                    ? ` · ${formatDurationSec(audio.durationSec)}`
                    : ""}
                  {audio.sizeBytes ? ` · ${formatAudioBytes(audio.sizeBytes)}` : ""}
                </p>
              ) : null}
              {previewUrl ? (
                <audio className="mt-2 w-full" controls src={previewUrl} preload="metadata" />
              ) : null}
              {audioPhase === "failed" && pendingAudioRef.current ? (
                <Button
                  className="mt-3"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const pending = pendingAudioRef.current!;
                    if (audio?.storagePath) void transcribeStored(audio);
                    else void handleAudioData(pending.blob, pending.filename, pending.durationSec);
                  }}
                >
                  다시 전사
                </Button>
              ) : null}
              {audio && remapped.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  전사가 없어도 원본을 먼저 저장할 수 있습니다. 세션에서 다시 전사하세요.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/20 p-6">
            <Label className="text-base font-semibold">앱에서 직접 녹음하기</Label>
            <p className="text-sm text-muted-foreground text-center">
              회의나 인터뷰를 실시간으로 녹음하고 즉시 분석합니다.
            </p>
            {isRecording ? (
              <div className="flex flex-col items-center gap-4 w-full">
                <canvas
                  ref={canvasRef}
                  width={300}
                  height={60}
                  className="w-full max-w-xs h-[60px] rounded bg-background/50"
                />
                <div className="text-xl font-mono text-destructive font-medium animate-pulse">
                  {formatTime(recordingTime)}
                </div>
                <Button variant="destructive" onClick={stopRecording} className="gap-2">
                  <Square className="size-4" fill="currentColor" />
                  녹음 중지 및 보관
                </Button>
              </div>
            ) : (
              <Button
                onClick={startRecording}
                variant="outline"
                className="gap-2 border-primary text-primary hover:bg-primary/5"
              >
                <Circle className="size-4 text-destructive" fill="currentColor" />
                녹음 시작
              </Button>
            )}
          </div>
          <div>
            <Label htmlFor="paste">또는 텍스트 붙여넣기</Label>
            <Textarea
              id="paste"
              className="mt-1.5 font-mono text-sm"
              rows={8}
              value={text}
              placeholder={`[대표] 00:01:12\n경력 MLOps가 비어 있습니다.\n\n조사원: 훈련은 어떤 방식이 가능하신가요.`}
              onChange={(e) => {
                setText(e.target.value);
                if (!filename) setFilename("붙여넣기.txt");
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            형식 예: <code className="font-mono text-xs">[대표] 00:01:12</code> 다음 줄에 발화, 또는{" "}
            <code className="font-mono text-xs">조사원: …</code>
            {" · "}
            <a
              className="underline underline-offset-2"
              href="/samples/ai-sme-interview.txt"
              download
            >
              예시 파일 받기
            </a>
          </p>
        </CardContent>
      </Card>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="프로젝트">
            <NativeSelect value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
              {liveProjects.length === 0 ? (
                <option value="">먼저 프로젝트를 만드세요</option>
              ) : null}
              {liveProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="대상 표시명">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="하린랩, 또는 익명코드"
              required
            />
          </Field>
          <Field label="일자">
            <Input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
            />
          </Field>
          <Field label="유형">
            <NativeSelect value={sessionKind} onChange={(e) => setSessionKind(e.target.value)}>
              {SESSION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="업종">
            <Input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="AI, 콘텐츠…"
              list="industry-hints"
            />
            <datalist id="industry-hints">
              {["AI", "IT·소프트웨어", "콘텐츠", "바이오헬스", "금융", "사회서비스"].map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </Field>
          <Field label="규모">
            <Input
              value={sizeLabel}
              onChange={(e) => setSizeLabel(e.target.value)}
              placeholder="42명"
            />
          </Field>
          <Field label="지역">
            <Input
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="구로구"
            />
          </Field>
          <Field label="조사자">
            <Input
              value={researcher}
              onChange={(e) => setResearcher(e.target.value)}
              placeholder="서울지역 인적자원개발위원회"
            />
          </Field>
        </div>

        {speakers.length > 0 ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-medium">화자 이름</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              파일의 표기를 조사원·직함으로 고칩니다. 본문은 그대로 둡니다.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {speakers.map((name) => (
                <div key={name} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">
                    {name}
                  </span>
                  <Input
                    value={speakerMap[name] ?? name}
                    onChange={(e) => setSpeakerMap((m) => ({ ...m, [name]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {remapped.length > 0 ? (
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm">
              <FileText className="size-4 text-primary" />
              <span className="font-medium">구간 {remapped.length}개</span>
              <span className="text-muted-foreground">{filename}</span>
            </div>
            <div className="max-h-64 overflow-auto rounded-lg border border-border bg-card">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">코드</th>
                    <th className="px-3 py-2 font-medium">화자</th>
                    <th className="px-3 py-2 font-medium">시각</th>
                    <th className="px-3 py-2 font-medium">본문</th>
                  </tr>
                </thead>
                <tbody>
                  {remapped.map((seg) => (
                    <tr key={seg.seq} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">
                        S{String(seg.seq).padStart(3, "0")}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{seg.speaker}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {seg.ts || "—"}
                      </td>
                      <td className="max-w-0 truncate px-3 py-2 text-muted-foreground">
                        {seg.body}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : text ? (
          <p className="text-sm text-destructive">
            구간을 읽지 못했습니다. 화자 표기를 확인해 주세요.
          </p>
        ) : audio ? (
          <p className="text-sm text-muted-foreground">
            전사 전이라도 원본을 작업대로 보낼 수 있습니다.
          </p>
        ) : null}

        <Button type="submit" disabled={!canSubmit || mutation.isPending} className="self-start">
          {mutation.isPending
            ? "저장 중"
            : remapped.length > 0
              ? "작업대로 보내기"
              : "원본만 먼저 저장"}
        </Button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
