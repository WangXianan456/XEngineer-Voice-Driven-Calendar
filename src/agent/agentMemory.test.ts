import { describe, expect, it } from "vitest";
import { createCalendarEvent } from "../calendar/eventStore";
import {
  createInitialAgentMemory,
  isMemoryCorrection,
  isReferenceCommand,
  isTargetlessMemoryTimeCommand,
  parseMemoryCandidateChoice,
  rememberCandidates,
  rememberIntent,
  rememberMentionedEvents,
  resolveMemoryReference,
  resolveMemoryTimeUpdate,
  selectMemoryCandidate
} from "./agentMemory";

const productReview = createCalendarEvent({
  title: "产品评审会",
  start: new Date("2026-06-01T15:00:00+08:00"),
  end: new Date("2026-06-01T16:00:00+08:00"),
  reminderMinutes: 10,
  sourceText: "明天下午三点开产品评审会"
});

const designReview = createCalendarEvent({
  title: "设计评审会",
  start: new Date("2026-06-01T16:00:00+08:00"),
  end: new Date("2026-06-01T17:00:00+08:00"),
  reminderMinutes: 10,
  sourceText: "明天下午四点开设计评审会"
});

describe("agentMemory", () => {
  it("starts empty", () => {
    const memory = createInitialAgentMemory();

    expect(memory.lastIntent).toBeNull();
    expect(memory.lastMentionedEvents).toEqual([]);
    expect(memory.lastCandidates).toEqual([]);
    expect(memory.selectedEventId).toBeNull();
  });

  it("remembers the last intent", () => {
    const memory = rememberIntent(createInitialAgentMemory(), "list_events");

    expect(memory.lastIntent).toBe("list_events");
  });

  it("remembers a single mentioned event as selected reference", () => {
    const memory = rememberMentionedEvents(createInitialAgentMemory(), [productReview], "list_events");

    expect(memory.selectedEventId).toBe(productReview.id);
    expect(memory.conversationSummary).toContain("产品评审会");
  });

  it("does not auto-select when multiple events are mentioned", () => {
    const memory = rememberMentionedEvents(createInitialAgentMemory(), [productReview, designReview], "list_events");

    expect(memory.selectedEventId).toBeNull();
    expect(memory.lastMentionedEvents).toHaveLength(2);
  });

  it("remembers multiple candidates as pending clarification", () => {
    const memory = rememberCandidates(createInitialAgentMemory(), [productReview, designReview], "delete_event");

    expect(memory.pendingClarification).toBe("candidate_selection");
    expect(memory.lastCandidates).toHaveLength(2);
  });

  it("selects a candidate by index and clears clarification", () => {
    const memory = rememberCandidates(createInitialAgentMemory(), [productReview, designReview], "delete_event");
    const selected = selectMemoryCandidate(memory, 1);

    expect(selected.event?.title).toBe("设计评审会");
    expect(selected.memory.selectedEventId).toBe(designReview.id);
    expect(selected.memory.pendingClarification).toBeNull();
  });

  it("keeps memory unchanged when selecting an invalid candidate", () => {
    const memory = rememberCandidates(createInitialAgentMemory(), [productReview], "delete_event");
    const selected = selectMemoryCandidate(memory, 2);

    expect(selected.event).toBeNull();
    expect(selected.memory).toBe(memory);
  });

  it("resolves selected event against current calendar state", () => {
    const memory = rememberMentionedEvents(createInitialAgentMemory(), [productReview], "list_events");
    const updatedEvent = { ...productReview, title: "产品终审会" };

    expect(resolveMemoryReference(memory, [updatedEvent])?.title).toBe("产品终审会");
  });

  it("parses numeric and Chinese candidate choices", () => {
    expect(parseMemoryCandidateChoice("第二个")).toBe(1);
    expect(parseMemoryCandidateChoice("选 2")).toBe(1);
    expect(parseMemoryCandidateChoice("第九条")).toBe(8);
    expect(parseMemoryCandidateChoice("随便")).toBeNull();
  });

  it("detects correction and reference commands", () => {
    expect(isMemoryCorrection("不是这个，是第二个")).toBe(true);
    expect(isMemoryCorrection("选第一个")).toBe(false);
    expect(isReferenceCommand("刚才那个取消")).toBe(true);
    expect(isReferenceCommand("删除产品评审会")).toBe(false);
  });

  it("detects targetless memory time commands without hijacking titled updates", () => {
    expect(isTargetlessMemoryTimeCommand("改成明天下午")).toBe(true);
    expect(isTargetlessMemoryTimeCommand("把时间改成下周三上午")).toBe(true);
    expect(isTargetlessMemoryTimeCommand("把产品评审会改成明天下午")).toBe(false);
  });

  it("moves the remembered event to tomorrow afternoon with deterministic default time", () => {
    const range = resolveMemoryTimeUpdate("改成明天下午", productReview, new Date("2026-05-31T09:00:00+08:00"));

    expect(range?.start.toISOString()).toBe("2026-06-01T07:00:00.000Z");
    expect(range?.end.toISOString()).toBe("2026-06-01T08:00:00.000Z");
  });

  it("preserves the original clock time when only a date is provided", () => {
    const range = resolveMemoryTimeUpdate("改到后天", productReview, new Date("2026-05-31T09:00:00+08:00"));

    expect(range?.start.toISOString()).toBe("2026-06-02T07:00:00.000Z");
    expect(range?.end.toISOString()).toBe("2026-06-02T08:00:00.000Z");
  });

  it("parses explicit clock time in memory time updates", () => {
    const range = resolveMemoryTimeUpdate("改到下周三下午四点半", productReview, new Date("2026-05-31T09:00:00+08:00"));

    expect(range?.start.toISOString()).toBe("2026-06-03T08:30:00.000Z");
    expect(range?.end.toISOString()).toBe("2026-06-03T09:30:00.000Z");
  });

  it("does not resolve memory time updates without context", () => {
    expect(resolveMemoryTimeUpdate("改成明天下午", null, new Date("2026-05-31T09:00:00+08:00"))).toBeNull();
  });
});
