import { useMemo, useRef, useState } from "react";

type LocalAsrStatus = "unsupported" | "idle" | "listening" | "transcribing" | "error";

type AsrResponse = {
  text: string;
  language?: string;
  duration?: number;
};

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const apiBaseUrl = env?.VITE_API_BASE_URL?.trim();

export function useLocalAsrRecognition(onResult: (text: string) => void) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoStopTimerRef = useRef<number | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [status, setStatus] = useState<LocalAsrStatus>(() => getInitialStatus());

  const isSupported = status !== "unsupported";

  const statusLabel = useMemo(() => {
    if (status === "unsupported") {
      return "本地 ASR 不可用";
    }

    if (status === "listening") {
      return "正在录音";
    }

    if (status === "transcribing") {
      return "本地识别中";
    }

    if (status === "error") {
      return "语音失败";
    }

    return "本地 ASR 待命";
  }, [status]);

  async function startListening() {
    if (!apiBaseUrl || typeof navigator === "undefined" || !navigator.mediaDevices || !window.MediaRecorder) {
      setStatus("unsupported");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() });

      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        cleanupStream();
        setStatus("error");
      };

      recorder.onstop = () => {
        void transcribeRecording();
      };

      recorder.start(250);
      autoStopTimerRef.current = window.setTimeout(() => {
        stopListening();
      }, 8000);
      setStatus("listening");
    } catch (error) {
      console.error("Failed to start local ASR recording", error);
      cleanupStream();
      setStatus("error");
    }
  }

  function stopListening() {
    if (recorderRef.current?.state === "recording") {
      setStatus("transcribing");
      recorderRef.current.requestData();
      recorderRef.current.stop();
      return;
    }

    cleanupStream();
    setStatus("idle");
  }

  async function transcribeRecording() {
    const mimeType = getSupportedMimeType();
    const blob = new Blob(chunksRef.current, { type: mimeType });
    cleanupStream();

    if (!blob.size) {
      console.error("Local ASR recording produced an empty audio blob");
      setStatus("error");
      return;
    }

    try {
      const form = new FormData();
      form.append("file", blob, `voice-command.${mimeType.includes("ogg") ? "ogg" : "webm"}`);

      const response = await fetch(`${apiBaseUrl}/api/asr?language=zh`, {
        method: "POST",
        body: form
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`ASR request failed: ${response.status} ${detail}`);
      }

      const result = (await response.json()) as AsrResponse;
      const text = result.text.trim();

      if (!text) {
        throw new Error("ASR returned empty text");
      }

      onResult(text);
      setStatus("idle");
    } catch (error) {
      console.error("Local ASR transcription failed", error);
      setStatus("error");
    } finally {
      chunksRef.current = [];
    }
  }

  function cleanupStream() {
    if (autoStopTimerRef.current !== null) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }

  return {
    isSupported,
    status,
    statusLabel,
    startListening,
    stopListening
  };
}

function getInitialStatus(): LocalAsrStatus {
  if (!apiBaseUrl || typeof window === "undefined" || typeof navigator === "undefined") {
    return "unsupported";
  }

  return navigator.mediaDevices && window.MediaRecorder ? "idle" : "unsupported";
}

function getSupportedMimeType() {
  if (typeof window !== "undefined" && window.MediaRecorder?.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }

  if (typeof window !== "undefined" && window.MediaRecorder?.isTypeSupported("audio/ogg;codecs=opus")) {
    return "audio/ogg;codecs=opus";
  }

  return "audio/webm";
}
