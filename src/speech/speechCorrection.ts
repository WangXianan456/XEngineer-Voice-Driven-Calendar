export type SpeechRecognitionSource = "browser" | "local";

export type SpeechRecognitionMeta = {
  source: SpeechRecognitionSource;
  confidence?: number;
  language?: string;
  duration?: number;
};

export type SpeechCorrectionResult = {
  originalText: string;
  text: string;
  corrections: string[];
  shouldConfirmBeforeSubmit: boolean;
  confirmationReason: "empty" | "low_confidence" | "corrected_local_asr" | "missing_command_clue" | null;
};

const lowConfidenceThreshold = 0.65;

const correctionRules: Array<{ pattern: RegExp; replacement: string; label: string }> = [
  { pattern: /产品\s*(平审|凭审|品审|评申)\s*会/g, replacement: "产品评审会", label: "产品评审会" },
  { pattern: /(平审|凭审|品审|评申)/g, replacement: "评审", label: "评审" },
  { pattern: /(题型|体型|提型|题醒)/g, replacement: "提醒", label: "提醒" },
  { pattern: /日立/g, replacement: "日历", label: "日历" },
  { pattern: /明添/g, replacement: "明天", label: "明天" },
  { pattern: /后添/g, replacement: "后天", label: "后天" },
  { pattern: /删掉/g, replacement: "删除", label: "删除" }
];

export function normalizeSpeechTranscript(text: string, meta: SpeechRecognitionMeta): SpeechCorrectionResult {
  const originalText = text.trim();
  const corrections: string[] = [];
  let normalized = originalText
    .replace(/\s+/g, "")
    .replace(/[，。,.!?！？]+$/g, "");

  for (const rule of correctionRules) {
    const next = normalized.replace(rule.pattern, rule.replacement);
    if (next !== normalized) {
      normalized = next;
      corrections.push(rule.label);
    }
  }

  const confirmationReason = getConfirmationReason(normalized, corrections, meta);

  return {
    originalText,
    text: normalized,
    corrections: Array.from(new Set(corrections)),
    shouldConfirmBeforeSubmit: confirmationReason !== null,
    confirmationReason
  };
}

function getConfirmationReason(
  normalized: string,
  corrections: string[],
  meta: SpeechRecognitionMeta
): SpeechCorrectionResult["confirmationReason"] {
  if (!normalized) {
    return "empty";
  }

  if (meta.confidence !== undefined && meta.confidence < lowConfidenceThreshold) {
    return "low_confidence";
  }

  if (meta.source === "local" && corrections.length > 0) {
    return "corrected_local_asr";
  }

  if (meta.source === "local" && !hasCalendarCommandClue(normalized)) {
    return "missing_command_clue";
  }

  return null;
}

function hasCalendarCommandClue(text: string) {
  return /今天|明天|后天|下周|上午|下午|晚上|日程|安排|会议|评审|提醒|删除|取消|修改|改到|改成|空闲|有空|撤销/.test(text);
}
