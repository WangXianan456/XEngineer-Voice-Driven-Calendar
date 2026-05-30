import { useMemo, useRef, useState } from "react";

type SpeechRecognitionStatus = "unsupported" | "idle" | "listening" | "error";

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<{
    0: {
      transcript: string;
    };
  }>;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function useSpeechRecognition(onResult: (text: string) => void) {
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const [status, setStatus] = useState<SpeechRecognitionStatus>(() => getRecognitionConstructor() ? "idle" : "unsupported");

  const isSupported = status !== "unsupported";

  const statusLabel = useMemo(() => {
    if (status === "unsupported") {
      return "语音不可用";
    }

    if (status === "listening") {
      return "正在聆听";
    }

    if (status === "error") {
      return "语音失败";
    }

    return "语音待命";
  }, [status]);

  function startListening() {
    const Recognition = getRecognitionConstructor();

    if (!Recognition) {
      setStatus("unsupported");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const result = event.results[0]?.[0]?.transcript?.trim();
      if (result) {
        onResult(result);
      }
    };

    recognition.onerror = () => {
      setStatus("error");
    };

    recognition.onend = () => {
      setStatus((current) => (current === "listening" ? "idle" : current));
    };

    recognitionRef.current = recognition;
    setStatus("listening");
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setStatus("idle");
  }

  return {
    isSupported,
    status,
    statusLabel,
    startListening,
    stopListening
  };
}

function getRecognitionConstructor() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}
