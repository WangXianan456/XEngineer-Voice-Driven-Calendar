import { describe, expect, it } from "vitest";
import { normalizeSpeechTranscript } from "./speechCorrection";

describe("speechCorrection", () => {
  it("normalizes common Chinese ASR mistakes", () => {
    const result = normalizeSpeechTranscript("明天下午三点开产品平审会，提前十分钟题型我。", {
      source: "browser",
      confidence: 0.9
    });

    expect(result.text).toBe("明天下午三点开产品评审会，提前十分钟提醒我");
    expect(result.corrections).toEqual(["产品评审会", "提醒"]);
    expect(result.shouldConfirmBeforeSubmit).toBe(false);
  });

  it("asks for confirmation when local ASR output was corrected", () => {
    const result = normalizeSpeechTranscript("明天下午三点开产品凭审会", {
      source: "local",
      confidence: 0.9
    });

    expect(result.text).toBe("明天下午三点开产品评审会");
    expect(result.shouldConfirmBeforeSubmit).toBe(true);
    expect(result.confirmationReason).toBe("corrected_local_asr");
  });

  it("asks for confirmation on low confidence transcripts", () => {
    const result = normalizeSpeechTranscript("明天下午三点开产品评审会", {
      source: "local",
      confidence: 0.42
    });

    expect(result.shouldConfirmBeforeSubmit).toBe(true);
    expect(result.confirmationReason).toBe("low_confidence");
  });

  it("asks for confirmation on empty transcripts", () => {
    const result = normalizeSpeechTranscript("   ", {
      source: "local",
      confidence: 0
    });

    expect(result.text).toBe("");
    expect(result.confirmationReason).toBe("empty");
  });

  it("does not auto-submit local text that lacks calendar command clues", () => {
    const result = normalizeSpeechTranscript("随便聊两句", {
      source: "local",
      confidence: 0.9
    });

    expect(result.shouldConfirmBeforeSubmit).toBe(true);
    expect(result.confirmationReason).toBe("missing_command_clue");
  });
});
