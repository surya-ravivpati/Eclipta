import { describe, it, expect } from "vitest";
import type { Json } from "@/integrations/supabase/database";
import {
  COURSE_BLOCK_TYPES,
  emptyBlockData,
  toCourseBlock,
  type CourseBlockRow,
} from "./course-blocks";

/**
 * `course_blocks.data` is a jsonb column, which means anything at all can come
 * back from it: a row written by an older build, by a newer one, or by hand.
 * `toCourseBlock` is the single door from that column into a typed union, so
 * it is the one place where a wrong-shaped value has to become "absent"
 * instead of reaching a component that will try to `.map()` it.
 */

function row(over: Partial<CourseBlockRow> = {}): CourseBlockRow {
  return { id: "b1", module_id: "m1", type: "text", data: {}, position: 0, ...over };
}

describe("toCourseBlock", () => {
  it("keeps the row's identity on the narrowed block", () => {
    const [block] = toCourseBlock(row({ id: "b9", module_id: "m4", position: 3 }));
    expect(block).toMatchObject({ id: "b9", module_id: "m4", position: 3 });
  });

  it("narrows each known type", () => {
    for (const type of COURSE_BLOCK_TYPES) {
      const [block] = toCourseBlock(row({ type }));
      expect(block?.type, `${type} did not narrow`).toBe(type);
    }
  });

  it("drops a type this build does not know instead of crashing the lesson", () => {
    // A course authored by a newer version must still render its other blocks.
    expect(toCourseBlock(row({ type: "hologram" }))).toEqual([]);
    expect(toCourseBlock(row({ type: "" }))).toEqual([]);
  });

  it("reads the fields belonging to each type", () => {
    const [text] = toCourseBlock(row({ type: "text", data: { text: "hello" } }));
    expect(text?.data).toEqual({ text: "hello" });

    const [video] = toCourseBlock(
      row({ type: "youtube", data: { url: "https://y.tube/x", caption: "Intro" } }),
    );
    expect(video?.data).toEqual({ url: "https://y.tube/x", caption: "Intro" });

    const [quiz] = toCourseBlock(
      row({ type: "quiz", data: { question: "2+2?", options: ["3", "4"], correctIndex: 1 } }),
    );
    expect(quiz?.data).toEqual({ question: "2+2?", options: ["3", "4"], correctIndex: 1 });
  });

  it("treats a field of the wrong type as absent rather than coercing it", () => {
    const [text] = toCourseBlock(row({ type: "text", data: { text: 42 } }));
    expect(text?.data.text).toBeUndefined();

    const [quiz] = toCourseBlock(
      row({ type: "quiz", data: { question: null, options: "a,b", correctIndex: "1" } }),
    );
    expect(quiz?.data).toEqual({
      question: undefined,
      options: undefined,
      correctIndex: undefined,
    });
  });

  it("survives a data column that is not an object at all", () => {
    for (const data of [null, "text", 7, true, [1, 2]] as Json[]) {
      const [block] = toCourseBlock(row({ type: "text", data }));
      expect(block?.data.text, `data=${JSON.stringify(data)}`).toBeUndefined();
    }
  });

  it("keeps a quiz's option list the same length, blanking non-string entries", () => {
    // Blanking rather than dropping matters: correctIndex points into this
    // array by position, so removing an entry would silently move the answer.
    const [quiz] = toCourseBlock(
      row({ type: "quiz", data: { options: ["a", 3, null, "d"], correctIndex: 3 } }),
    );
    expect(quiz?.type).toBe("quiz");
    if (quiz?.type !== "quiz") return;
    expect(quiz.data.options).toEqual(["a", "", "", "d"]);
    expect(quiz.data.options?.[quiz.data.correctIndex ?? 0]).toBe("d");
  });
});

describe("emptyBlockData", () => {
  it("gives every type a starting payload", () => {
    for (const type of COURSE_BLOCK_TYPES) {
      expect(emptyBlockData(type), `${type} has no starting payload`).toBeTruthy();
    }
  });

  it("starts a quiz with four options and the first selected", () => {
    expect(emptyBlockData("quiz")).toEqual({
      question: "",
      options: ["", "", "", ""],
      correctIndex: 0,
    });
  });

  it("round-trips through toCourseBlock unchanged", () => {
    // What the editor creates must survive a save and a read back.
    for (const type of COURSE_BLOCK_TYPES) {
      const data = emptyBlockData(type) as Json;
      const [block] = toCourseBlock(row({ type, data }));
      expect(block?.data, `${type} did not round-trip`).toEqual(emptyBlockData(type));
    }
  });
});
