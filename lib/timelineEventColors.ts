import type { CSSProperties } from "react";

/** Per-event colors for timeline dots and card left border only. */
export function getTimelineEventColor(eventType: string): string {
  switch (eventType) {
    case "submitted":
      return "#B0B0B0";
    case "acknowledged":
      return "#7DCEA0";
    case "item_checked":
      return "#A8C8E8";
    case "update_added":
    case "followup_added":
      return "#C3A8E8";
    case "action_required":
      return "#F0A58A";
    default:
      return "#B0B0B0";
  }
}

export const TIMELINE_LEGEND = [
  { color: "#B0B0B0", label: "Submitted" },
  { color: "#7DCEA0", label: "Acknowledged" },
  { color: "#A8C8E8", label: "Checked off" },
  { color: "#C3A8E8", label: "Update" },
  { color: "#F0A58A", label: "Action" },
] as const;

export function timelineEventCardStyle(eventColor: string): CSSProperties {
  return {
    borderTop: "0.5px solid #E9E9E7",
    borderRight: "0.5px solid #E9E9E7",
    borderBottom: "0.5px solid #E9E9E7",
    borderLeft: `3px solid ${eventColor}`,
    borderRadius: "0 4px 4px 0",
    paddingLeft: 12,
  };
}
