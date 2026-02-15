import { formatDate } from "date-fns";

export function formatTimestamp(date: Date): string {
  return formatDate(date, "Pp");
}

export function generateTitle(content: string): string {
  return content.length > 50 ? content.substring(0, 50) + "..." : content;
}
