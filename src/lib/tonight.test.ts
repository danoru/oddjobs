import { describe, expect, it } from "vitest";
import { inheritedBy, planTonight } from "./tonight";

const cast = [
  {
    id: "a",
    name: "A",
    ifUnclaimed: {
      npc: "A runs the inn.",
      reassign: [
        { beat: "the key", to: ["b", "c"], text: "You have the key." },
        { beat: "the map", to: ["d"], text: "You have the map." },
      ],
      cuts: ["The inn scene"],
    },
  },
  { id: "b", name: "B" },
  { id: "c", name: "C", ifUnclaimed: { npc: "C is away.", reassign: [{ beat: "the oath", to: ["a"], text: "You swore it." }], cuts: [] } },
  { id: "d", name: "D" },
];

describe("planTonight", () => {
  it("does nothing when everyone's here", () => {
    expect(planTonight(cast, ["a", "b", "c", "d"])).toEqual({ npcs: [], moves: [], orphaned: [], cuts: [] });
  });

  it("hands beats to the first listed character at the table", () => {
    const plan = planTonight(cast, ["c", "d"]);
    expect(plan.npcs.map((n) => n.id)).toEqual(["a", "b"]);
    expect(plan.moves).toEqual([
      { beat: "the key", from: "a", to: "c", text: "You have the key." },
      { beat: "the map", from: "a", to: "d", text: "You have the map." },
    ]);
    expect(plan.cuts).toEqual([{ from: "a", text: "The inn scene" }]);
    expect(inheritedBy(plan, "d").map((m) => m.beat)).toEqual(["the map"]);
  });

  it("flags beats nobody present can inherit", () => {
    const plan = planTonight(cast, ["b", "d"]);
    expect(plan.orphaned).toEqual([{ beat: "the oath", from: "c" }]);
  });

  it("explains characters with no fallback written", () => {
    const plan = planTonight(cast, ["a", "c"]);
    expect(plan.npcs.find((n) => n.id === "b")!.note).toMatch(/No fallback/);
  });
});
