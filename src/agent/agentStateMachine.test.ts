import { describe, expect, it } from "vitest";
import { createCalendarEvent } from "../calendar/eventStore";
import {
  agentReducer,
  createConfirmPendingActionResult,
  createCreatePendingAction,
  createDeletePendingAction,
  createInitialAgentState,
  createReminderPendingAction,
  createUpdatePendingAction,
  getSelectedPendingEvent
} from "./agentStateMachine";

const baseEvent = createCalendarEvent({
  title: "产品评审会",
  start: new Date("2026-06-01T10:00:00+08:00"),
  end: new Date("2026-06-01T11:00:00+08:00"),
  reminderMinutes: 10,
  sourceText: "下周一上午十点开产品评审会"
});

describe("agentStateMachine", () => {
  it("moves to candidate selection when multiple delete candidates need selection", () => {
    const state = agentReducer(createInitialAgentState(), {
      type: "set_pending_action",
      pendingAction: {
        type: "delete_event",
        candidates: [baseEvent, { ...baseEvent, id: "other" }],
        selectedIndex: null,
        summary: "找到 2 个匹配日程，请先选择要删除的候选。"
      }
    });

    expect(state.phase).toBe("awaiting_candidate_selection");
    expect(state.pendingAction?.type).toBe("delete_event");
  });

  it("selects a candidate and moves to confirmation", () => {
    const initial = agentReducer(createInitialAgentState(), {
      type: "set_pending_action",
      pendingAction: {
        type: "delete_event",
        candidates: [baseEvent, { ...baseEvent, id: "other", title: "设计评审会" }],
        selectedIndex: null,
        summary: "找到 2 个匹配日程，请先选择要删除的候选。"
      }
    });

    const selected = agentReducer(initial, {
      type: "select_candidate",
      index: 1,
      summary: "确认删除「设计评审会」吗？",
      referencedEvent: { ...baseEvent, id: "other", title: "设计评审会" }
    });

    expect(selected.phase).toBe("awaiting_confirmation");
    expect(selected.pendingAction?.type).toBe("delete_event");

    if (selected.pendingAction?.type !== "delete_event") {
      throw new Error("expected delete_event");
    }

    expect(getSelectedPendingEvent(selected.pendingAction)?.title).toBe("设计评审会");
    expect(selected.lastReferencedEvent?.title).toBe("设计评审会");
  });

  it("clears pending action after cancel", () => {
    const pending = agentReducer(createInitialAgentState(), {
      type: "set_pending_action",
      pendingAction: {
        type: "delete_event",
        candidates: [baseEvent],
        selectedIndex: 0,
        summary: "确认删除「产品评审会」吗？"
      }
    });

    const cleared = agentReducer(pending, { type: "clear_pending_action" });

    expect(cleared.phase).toBe("idle");
    expect(cleared.pendingAction).toBeNull();
  });

  it("creates pending actions with the right initial selection state", () => {
    const second = { ...baseEvent, id: "other", title: "设计评审会" };
    const createPending = createCreatePendingAction(
      {
        title: "冲突会议",
        start: new Date("2026-06-01T10:30:00+08:00"),
        end: new Date("2026-06-01T11:30:00+08:00"),
        reminderMinutes: 10,
        sourceText: "下周一上午十点半开会"
      },
      [baseEvent],
      "准备添加「冲突会议」。"
    );
    const deletePending = createDeletePendingAction([baseEvent, second]);
    const updatePending = createUpdatePendingAction(
      [baseEvent],
      new Date("2026-06-01T12:00:00+08:00"),
      new Date("2026-06-01T13:00:00+08:00")
    );
    const reminderPending = createReminderPendingAction(baseEvent, 15, "提前 15 分钟");

    expect(createPending.summary).toContain("冲突");
    expect(deletePending.selectedIndex).toBeNull();
    expect(deletePending.summary).toContain("找到 2 个匹配日程");
    expect(updatePending.selectedIndex).toBe(0);
    expect(updatePending.start?.getHours()).toBe(12);
    expect(reminderPending.reminderMinutes).toBe(15);
    expect(reminderPending.summary).toContain("提前 15 分钟");
  });

  it("creates confirm results without calendar side effects", () => {
    const updatePending = createUpdatePendingAction(
      [baseEvent],
      new Date("2026-06-01T12:00:00+08:00"),
      new Date("2026-06-01T13:00:00+08:00")
    );
    const result = createConfirmPendingActionResult(updatePending);

    expect(result.type).toBe("update_event");

    if (result.type !== "update_event") {
      throw new Error("expected update_event");
    }

    expect(result.event.id).toBe(baseEvent.id);
    expect(result.updates.start).toBe("2026-06-01T04:00:00.000Z");
    expect(result.updates.end).toBe("2026-06-01T05:00:00.000Z");
  });
});
