import { describe, expect, it } from "vitest";
import { EVENT } from "../constants";
import { classifyTimestamp, eatDate, EVENT_WINDOW, parseInstant } from "./window";

describe("event window configuration", () => {
  it("is 07:00-19:00 Africa/Nairobi expressed in UTC", () => {
    expect(EVENT_WINDOW.startUtc).toBe("2026-11-07T04:00:00Z");
    expect(EVENT_WINDOW.deadlineUtc).toBe("2026-11-07T16:00:00Z");
    expect(EVENT.timezone).toBe("Africa/Nairobi");
  });
});

describe("classifyTimestamp boundaries", () => {
  it("immediately before the start is before_start", () => {
    expect(classifyTimestamp("2026-11-07T03:59:59Z")).toBe("before_start");
    expect(classifyTimestamp("2026-11-07T03:59:59.999Z")).toBe("before_start");
  });
  it("exactly at the start is inside (start is inclusive)", () => {
    expect(classifyTimestamp("2026-11-07T04:00:00Z")).toBe("within_window");
  });
  it("inside the window", () => {
    expect(classifyTimestamp("2026-11-07T04:00:01Z")).toBe("within_window");
    expect(classifyTimestamp("2026-11-07T10:30:00Z")).toBe("within_window");
    expect(classifyTimestamp("2026-11-07T15:59:59Z")).toBe("within_window");
  });
  it("exactly at the deadline is still inside", () => {
    expect(classifyTimestamp("2026-11-07T16:00:00Z")).toBe("within_window");
  });
  it("immediately after the deadline is after_deadline", () => {
    expect(classifyTimestamp("2026-11-07T16:00:00.001Z")).toBe("after_deadline");
    expect(classifyTimestamp("2026-11-07T16:00:01Z")).toBe("after_deadline");
  });
  it("far before and far after", () => {
    expect(classifyTimestamp("2026-11-06T12:00:00Z")).toBe("before_start");
    expect(classifyTimestamp("2026-11-08T12:00:00Z")).toBe("after_deadline");
  });
});

describe("offset conversion", () => {
  it("07:00 EAT (+03:00) is exactly the start", () => {
    expect(classifyTimestamp("2026-11-07T07:00:00+03:00")).toBe("within_window");
    expect(classifyTimestamp("2026-11-07T06:59:59+03:00")).toBe("before_start");
  });
  it("19:00 EAT is the deadline; 19:00:01 EAT is after", () => {
    expect(classifyTimestamp("2026-11-07T19:00:00+03:00")).toBe("within_window");
    expect(classifyTimestamp("2026-11-07T19:00:01+03:00")).toBe("after_deadline");
  });
  it("a UTC date of 7 Nov can be outside the window, and 6 Nov UTC can be 7 Nov EAT", () => {
    // 21:30Z on 6 Nov is 00:30 EAT on 7 Nov, still before the 07:00 start.
    expect(eatDate("2026-11-06T21:30:00Z")).toBe("2026-11-07");
    expect(classifyTimestamp("2026-11-06T21:30:00Z")).toBe("before_start");
    // 21:30Z on 7 Nov is 00:30 EAT on 8 Nov.
    expect(eatDate("2026-11-07T21:30:00Z")).toBe("2026-11-08");
    expect(classifyTimestamp("2026-11-07T21:30:00Z")).toBe("after_deadline");
  });
  it("other offsets convert correctly", () => {
    expect(classifyTimestamp("2026-11-06T23:00:00-05:00")).toBe("within_window"); // = 04:00Z
    expect(classifyTimestamp("2026-11-07T00:00:00+00:00")).toBe("before_start");
  });
});

describe("invalid input", () => {
  it.each([undefined, "", "not a date", "2026-11-07T10:00:00", "2026-11-07", "2026-13-45T00:00:00Z"])(
    "%s is invalid and never silently read in local time",
    (v) => {
      expect(classifyTimestamp(v)).toBe("invalid");
      expect(parseInstant(v)).toBeNull();
      expect(eatDate(v)).toBeNull();
    },
  );
});
