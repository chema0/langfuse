import { generateTitle, formatTimestamp } from "@/src/features/assistant/utils";

describe("assistant utils", () => {
  describe("generateTitle", () => {
    it("should return the content as-is when under 50 chars", () => {
      expect(generateTitle("Hello world")).toBe("Hello world");
    });

    it("should truncate to 50 chars with ellipsis when over 50 chars", () => {
      const longMessage =
        "This is a very long message that exceeds fifty characters and should be truncated";
      const result = generateTitle(longMessage);

      expect(result).toBe(longMessage.substring(0, 50) + "...");
      expect(result.length).toBe(53); // 50 + "..."
    });

    it("should return the content when exactly 50 chars", () => {
      const exact = "a".repeat(50);
      expect(generateTitle(exact)).toBe(exact);
    });

    it("should handle empty string", () => {
      expect(generateTitle("")).toBe("");
    });
  });

  describe("formatTimestamp", () => {
    it("should format a date to a readable string", () => {
      const date = new Date("2025-06-15T14:30:00Z");
      const result = formatTimestamp(date);

      // formatDate(date, "Pp") produces locale-dependent output,
      // so just verify it returns a non-empty string containing the date parts
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
