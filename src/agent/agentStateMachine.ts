import type { CalendarEvent, CreateCalendarEventInput } from "../calendar/eventTypes";
import {
  createInitialAgentMemory,
  rememberCandidates,
  rememberIntent,
  rememberMentionedEvents,
  selectMemoryCandidate,
  type AgentMemory
} from "./agentMemory";

export type AgentMessage = {
  id: string;
  role: "user" | "agent";
  text: string;
};

export type PendingAction =
  | {
      type: "create_event";
      event: CreateCalendarEventInput;
      conflicts: CalendarEvent[];
      summary: string;
    }
  | {
      type: "delete_event";
      candidates: CalendarEvent[];
      selectedIndex: number | null;
      summary: string;
    }
  | {
      type: "update_event";
      candidates: CalendarEvent[];
      selectedIndex: number | null;
      start?: Date;
      end?: Date;
      reminderMinutes?: number;
      location?: string;
      summary: string;
    };

export type UndoAction =
  | {
      type: "create_event";
      event: CalendarEvent;
    }
  | {
      type: "delete_event";
      event: CalendarEvent;
    }
  | {
      type: "update_event";
      event: CalendarEvent;
    };

export type ConfirmPendingActionResult =
  | {
      type: "create_event";
      event: CreateCalendarEventInput;
    }
  | {
      type: "delete_event";
      event: CalendarEvent;
    }
  | {
      type: "update_event";
      event: CalendarEvent;
      updates: Partial<Pick<CalendarEvent, "start" | "end" | "reminderMinutes" | "location">>;
    }
  | {
      type: "needs_selection";
      message: string;
    };

export type AgentPhase =
  | "idle"
  | "awaiting_confirmation"
  | "awaiting_candidate_selection"
  | "completed"
  | "failed";

export type AgentState = {
  phase: AgentPhase;
  messages: AgentMessage[];
  pendingAction: PendingAction | null;
  lastUndoAction: UndoAction | null;
  lastReferencedEvent: CalendarEvent | null;
  memory: AgentMemory;
};

export type AgentStateEvent =
  | {
      type: "append_message";
      message: AgentMessage;
    }
  | {
      type: "set_pending_action";
      pendingAction: PendingAction;
    }
  | {
      type: "clear_pending_action";
      phase?: AgentPhase;
    }
  | {
      type: "select_candidate";
      index: number;
      summary: string;
      referencedEvent?: CalendarEvent;
    }
  | {
      type: "set_last_undo_action";
      undoAction: UndoAction;
    }
  | {
      type: "clear_last_undo_action";
    }
  | {
      type: "set_last_referenced_event";
      event: CalendarEvent | null;
    }
  | {
      type: "remember_intent";
      intent: string;
    }
  | {
      type: "remember_mentioned_events";
      events: CalendarEvent[];
      intent?: string;
    }
  | {
      type: "remember_candidates";
      candidates: CalendarEvent[];
      intent?: string;
    }
  | {
      type: "select_memory_candidate";
      index: number;
    }
  | {
      type: "mark_failed";
    };

export const initialAgentMessages: AgentMessage[] = [
  {
    id: "msg-1",
    role: "agent",
    text: "说出或输入一条日程指令，我会先展示理解结果，再等待你确认写入。"
  }
];

export function createInitialAgentState(): AgentState {
  return {
    phase: "idle",
    messages: initialAgentMessages,
    pendingAction: null,
    lastUndoAction: null,
    lastReferencedEvent: null,
    memory: createInitialAgentMemory()
  };
}

export function agentReducer(state: AgentState, event: AgentStateEvent): AgentState {
  if (event.type === "append_message") {
    return {
      ...state,
      messages: [...state.messages, event.message]
    };
  }

  if (event.type === "set_pending_action") {
    return {
      ...state,
      phase: getPendingActionPhase(event.pendingAction),
      pendingAction: event.pendingAction
    };
  }

  if (event.type === "clear_pending_action") {
    return {
      ...state,
      phase: event.phase ?? "idle",
      pendingAction: null
    };
  }

  if (event.type === "select_candidate") {
    if (!state.pendingAction || state.pendingAction.type === "create_event") {
      return state;
    }

    return {
      ...state,
      phase: "awaiting_confirmation",
      pendingAction: {
        ...state.pendingAction,
        selectedIndex: event.index,
        summary: event.summary
      },
      lastReferencedEvent: event.referencedEvent ?? state.lastReferencedEvent
    };
  }

  if (event.type === "set_last_undo_action") {
    return {
      ...state,
      lastUndoAction: event.undoAction
    };
  }

  if (event.type === "clear_last_undo_action") {
    return {
      ...state,
      lastUndoAction: null
    };
  }

  if (event.type === "set_last_referenced_event") {
    return {
      ...state,
      lastReferencedEvent: event.event,
      memory: event.event ? rememberMentionedEvents(state.memory, [event.event]) : state.memory
    };
  }

  if (event.type === "remember_intent") {
    return {
      ...state,
      memory: rememberIntent(state.memory, event.intent)
    };
  }

  if (event.type === "remember_mentioned_events") {
    return {
      ...state,
      memory: rememberMentionedEvents(state.memory, event.events, event.intent),
      lastReferencedEvent: event.events.length === 1 ? event.events[0] : state.lastReferencedEvent
    };
  }

  if (event.type === "remember_candidates") {
    return {
      ...state,
      memory: rememberCandidates(state.memory, event.candidates, event.intent),
      lastReferencedEvent: event.candidates.length === 1 ? event.candidates[0] : state.lastReferencedEvent
    };
  }

  if (event.type === "select_memory_candidate") {
    const selected = selectMemoryCandidate(state.memory, event.index);
    return {
      ...state,
      memory: selected.memory,
      lastReferencedEvent: selected.event ?? state.lastReferencedEvent
    };
  }

  if (event.type === "mark_failed") {
    return {
      ...state,
      phase: "failed"
    };
  }

  return state;
}

export function getSelectedPendingEvent(
  pendingAction: Extract<PendingAction, { type: "delete_event" | "update_event" }>
) {
  if (pendingAction.selectedIndex === null) {
    return null;
  }

  return pendingAction.candidates[pendingAction.selectedIndex] ?? null;
}

export function createCreatePendingAction(
  event: CreateCalendarEventInput,
  conflicts: CalendarEvent[],
  reply: string
): Extract<PendingAction, { type: "create_event" }> {
  return {
    type: "create_event",
    event,
    conflicts,
    summary:
      conflicts.length > 0 ? `${reply} 但这个时间和「${conflicts[0].title}」冲突，是否仍然添加？` : reply
  };
}

export function createDeletePendingAction(candidates: CalendarEvent[]): Extract<PendingAction, { type: "delete_event" }> {
  const selectedIndex = candidates.length === 1 ? 0 : null;
  return {
    type: "delete_event",
    candidates,
    selectedIndex,
    summary:
      candidates.length === 1
        ? `确认删除「${candidates[0].title}」吗？删除后可以撤销最近一次操作。`
        : `找到 ${candidates.length} 个匹配日程，请先选择要删除的候选。`
  };
}

export function createUpdatePendingAction(
  candidates: CalendarEvent[],
  start: Date,
  end: Date,
  singleCandidateSummary?: string
): Extract<PendingAction, { type: "update_event" }> {
  const selectedIndex = candidates.length === 1 ? 0 : null;
  return {
    type: "update_event",
    candidates,
    selectedIndex,
    start,
    end,
    summary:
      candidates.length === 1
        ? (singleCandidateSummary ?? `将「${candidates[0].title}」改到新时间。`)
        : `找到 ${candidates.length} 个匹配日程，请先选择要修改的候选。`
  };
}

export function createReminderPendingAction(
  event: CalendarEvent,
  reminderMinutes: number,
  reminderText: string
): Extract<PendingAction, { type: "update_event" }> {
  return {
    type: "update_event",
    candidates: [event],
    selectedIndex: 0,
    reminderMinutes,
    summary: `将「${event.title}」的提醒改为 ${reminderText}。`
  };
}

export function createLocationPendingAction(
  event: CalendarEvent,
  location: string
): Extract<PendingAction, { type: "update_event" }> {
  return {
    type: "update_event",
    candidates: [event],
    selectedIndex: 0,
    location,
    summary: `将「${event.title}」的地点改为 ${location}。`
  };
}

export function createCandidateSelectionSummary(
  pendingAction: Extract<PendingAction, { type: "delete_event" | "update_event" }>,
  event: CalendarEvent,
  formatEventTime: (startIso: string, endIso: string) => string,
  formatReminder: (minutes: number) => string
) {
  if (pendingAction.type === "delete_event") {
    return `确认删除「${event.title}」吗？删除后可以撤销最近一次操作。`;
  }

  if (pendingAction.reminderMinutes !== undefined) {
    return `将「${event.title}」的提醒改为 ${formatReminder(pendingAction.reminderMinutes)}。`;
  }

  if (pendingAction.location !== undefined) {
    return `将「${event.title}」的地点改为 ${pendingAction.location}。`;
  }

  if (pendingAction.start && pendingAction.end) {
    return `将「${event.title}」从 ${formatEventTime(event.start, event.end)} 改到 ${formatEventTime(
      pendingAction.start.toISOString(),
      pendingAction.end.toISOString()
    )}。`;
  }

  return `确认修改「${event.title}」吗？`;
}

export function createConfirmPendingActionResult(pendingAction: PendingAction): ConfirmPendingActionResult {
  if (pendingAction.type === "create_event") {
    return {
      type: "create_event",
      event: pendingAction.event
    };
  }

  const event = getSelectedPendingEvent(pendingAction);
  if (!event) {
    return {
      type: "needs_selection",
      message: pendingAction.type === "delete_event" ? "请先选择要删除的候选。" : "请先选择要修改的候选。"
    };
  }

  if (pendingAction.type === "delete_event") {
    return {
      type: "delete_event",
      event
    };
  }

  const updates: Partial<Pick<CalendarEvent, "start" | "end" | "reminderMinutes" | "location">> = {};
  if (pendingAction.start && pendingAction.end) {
    updates.start = pendingAction.start.toISOString();
    updates.end = pendingAction.end.toISOString();
  }

  if (pendingAction.reminderMinutes !== undefined) {
    updates.reminderMinutes = pendingAction.reminderMinutes;
  }

  if (pendingAction.location !== undefined) {
    updates.location = pendingAction.location;
  }

  return {
    type: "update_event",
    event,
    updates
  };
}

function getPendingActionPhase(pendingAction: PendingAction): AgentPhase {
  if (pendingAction.type === "create_event") {
    return "awaiting_confirmation";
  }

  return pendingAction.selectedIndex === null ? "awaiting_candidate_selection" : "awaiting_confirmation";
}
