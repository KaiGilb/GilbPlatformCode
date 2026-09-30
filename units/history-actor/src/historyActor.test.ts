import { describe, expect, it } from "vitest";
import { agentLabel, describeAgent } from "./historyActor";

describe("describeAgent", () => {
  it("treats blank input as an unknown actor", () => {
    expect(describeAgent(null)).toEqual({
      who: "Unknown actor",
      whoKind: "unknown",
      agentLabel: "unknown",
    });
    expect(describeAgent("   ")).toEqual({
      who: "Unknown actor",
      whoKind: "unknown",
      agentLabel: "unknown",
    });
    expect(agentLabel(undefined)).toBe("unknown");
  });

  it("prettifies an agent- slug and keeps the raw slug as the badge", () => {
    expect(describeAgent("http://example.test/base/e/agent-VABaseVedanta")).toEqual({
      who: "AI agent · VA BVedanta",
      whoKind: "agent",
      agentLabel: "VABaseVedanta",
    });
    expect(describeAgent("agent-esco-helper")).toEqual({
      who: "AI agent · ESCO helper",
      whoKind: "agent",
      agentLabel: "esco-helper",
    });
    expect(describeAgent("http://example.test/base/e/agent-myvedanta").who).toBe(
      "AI agent · myvedanta",
    );
    expect(describeAgent("/base/e/agent-pre-vedanta").who).toBe("AI agent · pre BVedanta");
  });

  it("does not prettify the underscore form, and does not look up a person", () => {
    expect(describeAgent("http://example.test/base/e/agent_vedanta")).toEqual({
      who: "AI agent · vedanta",
      whoKind: "agent",
      agentLabel: "vedanta",
    });
    expect(describeAgent("http://example.test/base/p/abc?x=1")).toEqual({
      who: "Person",
      whoKind: "person",
      agentLabel: "Person",
    });
    expect(describeAgent("http://example.test/base/e/agent-")).toEqual({
      who: "AI agent · ",
      whoKind: "agent",
      agentLabel: "",
    });
  });

  it("truncates a long system id in the line and keeps the full id as the badge", () => {
    const id = "123456789012345678901";
    expect(describeAgent(`http://example.test/base/e/${id}`)).toEqual({
      who: "System · 1234567890123456…",
      whoKind: "system",
      agentLabel: id,
    });
    expect(describeAgent("http://example.test/base/e/short-id").who).toBe("System · short-id");
    expect(describeAgent("http://example.test/BASE/E/short-id")).toEqual({
      who: "Actor · short-id",
      whoKind: "unknown",
      agentLabel: "short-id",
    });
  });

  it("returns a new object each call", () => {
    const a = describeAgent("agent-one");
    const b = describeAgent("agent-one");
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
