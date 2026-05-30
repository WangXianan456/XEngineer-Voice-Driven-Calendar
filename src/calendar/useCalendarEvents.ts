import { useEffect, useMemo, useState } from "react";
import {
  createCalendarEvent,
  createDemoEvents,
  loadCalendarEvents,
  saveCalendarEvents
} from "./eventStore";
import type { CalendarEvent, CreateCalendarEventInput } from "./eventTypes";

export function useCalendarEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>(() => loadCalendarEvents());

  useEffect(() => {
    saveCalendarEvents(events);
  }, [events]);

  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (first, second) => new Date(first.start).getTime() - new Date(second.start).getTime()
      ),
    [events]
  );

  function addEvent(input: CreateCalendarEventInput) {
    const event = createCalendarEvent(input);
    setEvents((current) => [...current, event]);
    return event;
  }

  function restoreEvent(event: CalendarEvent) {
    setEvents((current) => {
      if (current.some((item) => item.id === event.id)) {
        return current;
      }

      return [...current, event];
    });
  }

  function deleteEvent(eventId: string) {
    setEvents((current) => current.filter((event) => event.id !== eventId));
  }

  function updateEvent(eventId: string, updates: Partial<CalendarEvent>) {
    setEvents((current) =>
      current.map((event) =>
        event.id === eventId
          ? {
              ...event,
              ...updates,
              id: event.id,
              createdAt: event.createdAt,
              updatedAt: new Date().toISOString()
            }
          : event
      )
    );
  }

  function resetDemoEvents() {
    setEvents(createDemoEvents());
  }

  function clearEvents() {
    setEvents([]);
  }

  return {
    events: sortedEvents,
    addEvent,
    restoreEvent,
    deleteEvent,
    updateEvent,
    resetDemoEvents,
    clearEvents
  };
}
