import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import {
  deleteCourseBlock,
  deleteCourseModule,
  enrollInCourse,
  getConceptMasteryEvidence,
  getCourseBlocksForModules,
  getCourseBySlug,
  getCourseCreatorUsername,
  getCourseForEdit,
  getCourseModules,
  getCourseProgressForUser,
  getEnrolledCourseSlugs,
  getEnrollmentSlugsWithDates,
  getEnrollmentsWithCount,
  getPublishedCommunityCourses,
  getWeakConceptRows,
  insertCourseBlock,
  insertCourseModule,
  insertCourseProposal,
  isEnrolled,
  renameCourseModule,
  updateCourseBlockData,
  updateCourseFields,
  upsertConceptMastery,
  upsertCourseProgress,
} from "./courses";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCourseBySlug", () => {
  it("queries user_courses filtered to the given slug", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "c1" }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ select } as never);

    await getCourseBySlug("intro-to-calc");

    expect(supabase.from).toHaveBeenCalledWith("user_courses");
    expect(eq).toHaveBeenCalledWith("slug", "intro-to-calc");
  });

  it("returns null for an unknown slug rather than throwing", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
    } as never);

    await expect(getCourseBySlug("missing")).resolves.toBeNull();
  });

  it("throws on a genuine database error", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "timeout" } });
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
    } as never);

    await expect(getCourseBySlug("intro-to-calc")).rejects.toThrow("timeout");
  });
});

describe("getCourseModules", () => {
  it("queries course_modules for the course, ordered by position", async () => {
    const order = vi
      .fn()
      .mockResolvedValue({ data: [{ id: "m1", title: "Intro", position: 0 }], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as never);

    const modules = await getCourseModules("c1");

    expect(supabase.from).toHaveBeenCalledWith("course_modules");
    expect(eq).toHaveBeenCalledWith("course_id", "c1");
    expect(order).toHaveBeenCalledWith("position");
    expect(modules).toEqual([{ id: "m1", title: "Intro", position: 0 }]);
  });

  it("returns an empty array rather than null when a course has no modules", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order }) }),
    } as never);

    await expect(getCourseModules("c1")).resolves.toEqual([]);
  });
});

describe("getCourseBlocksForModules", () => {
  it("queries course_blocks scoped to the given module ids, ordered by position", async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const inFn = vi.fn().mockReturnValue({ order });
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ in: inFn }),
    } as never);

    await getCourseBlocksForModules(["m1", "m2"]);

    expect(supabase.from).toHaveBeenCalledWith("course_blocks");
    expect(inFn).toHaveBeenCalledWith("module_id", ["m1", "m2"]);
    expect(order).toHaveBeenCalledWith("position");
  });
});

describe("getCourseCreatorUsername", () => {
  it("queries the public_profiles view by user_id", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { username: "nova" }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as never);

    await expect(getCourseCreatorUsername("u1")).resolves.toBe("nova");
    expect(supabase.from).toHaveBeenCalledWith("public_profiles");
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("returns null rather than throwing when no profile row is visible", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
    } as never);

    await expect(getCourseCreatorUsername("u1")).resolves.toBeNull();
  });
});

describe("isEnrolled", () => {
  it("returns true when an enrollment row exists", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null });
    const eq2 = vi.fn().mockReturnValue({ maybeSingle });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1 }),
    } as never);

    await expect(isEnrolled("u1", "intro-to-calc")).resolves.toBe(true);
    expect(eq1).toHaveBeenCalledWith("user_id", "u1");
    expect(eq2).toHaveBeenCalledWith("course_slug", "intro-to-calc");
  });

  it("returns false when no enrollment row exists", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.from).mockReturnValue({
      select: vi
        .fn()
        .mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
        }),
    } as never);

    await expect(isEnrolled("u1", "intro-to-calc")).resolves.toBe(false);
  });
});

describe("getPublishedCommunityCourses", () => {
  it("queries published user_courses, most-enrolled first, limited", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as never);

    await getPublishedCommunityCourses(120);

    expect(supabase.from).toHaveBeenCalledWith("user_courses");
    expect(eq).toHaveBeenCalledWith("status", "published");
    expect(order).toHaveBeenCalledWith("enrolled_count", { ascending: false });
    expect(limit).toHaveBeenCalledWith(120);
  });
});

describe("getEnrollmentSlugsWithDates", () => {
  it("returns each enrollment's slug and date", async () => {
    const eq = vi
      .fn()
      .mockResolvedValue({ data: [{ course_slug: "a", enrolled_at: "2026-01-01" }], error: null });
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as never);

    await expect(getEnrollmentSlugsWithDates("u1")).resolves.toEqual([
      { course_slug: "a", enrolled_at: "2026-01-01" },
    ]);
  });
});

describe("getCourseProgressForUser", () => {
  it("queries course_progress scoped to the user", async () => {
    const eq = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as never);

    await getCourseProgressForUser("u1");

    expect(supabase.from).toHaveBeenCalledWith("course_progress");
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
  });
});

describe("getEnrolledCourseSlugs", () => {
  it("returns the set of slugs the user is enrolled in", async () => {
    const eq = vi
      .fn()
      .mockResolvedValue({ data: [{ course_slug: "a" }, { course_slug: "b" }], error: null });
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as never);

    await expect(getEnrolledCourseSlugs("u1")).resolves.toEqual(["a", "b"]);
  });
});

describe("getEnrollmentsWithCount", () => {
  it("returns the rows and total count, ordered by most recently enrolled", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ course_slug: "a", course_title: "A" }],
      count: 1,
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ select } as never);

    await expect(getEnrollmentsWithCount("u1")).resolves.toEqual({
      rows: [{ course_slug: "a", course_title: "A" }],
      count: 1,
    });
    expect(select).toHaveBeenCalledWith("course_slug,course_title", { count: "exact" });
    expect(order).toHaveBeenCalledWith("enrolled_at", { ascending: false });
  });

  it("returns an empty result rather than throwing when the user has no enrollments", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, count: 0, error: null });
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order }) }),
    } as never);

    await expect(getEnrollmentsWithCount("u1")).resolves.toEqual({ rows: [], count: 0 });
  });
});

describe("enrollInCourse", () => {
  it("inserts the enrollment row", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert } as never);

    await enrollInCourse({
      user_id: "u1",
      course_slug: "intro-to-calc",
      course_title: "Intro to Calc",
    });

    expect(supabase.from).toHaveBeenCalledWith("enrollments");
    expect(insert).toHaveBeenCalledWith({
      user_id: "u1",
      course_slug: "intro-to-calc",
      course_title: "Intro to Calc",
    });
  });

  it("throws on a duplicate enrollment so the caller can surface the message", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "duplicate key value" } });
    vi.mocked(supabase.from).mockReturnValue({ insert } as never);

    await expect(
      enrollInCourse({
        user_id: "u1",
        course_slug: "intro-to-calc",
        course_title: "Intro to Calc",
      }),
    ).rejects.toThrow("duplicate key value");
  });
});

describe("insertCourseProposal", () => {
  it("inserts the proposal and returns the new id", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "p1" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    vi.mocked(supabase.from).mockReturnValue({ insert } as never);

    const payload = {
      user_id: "u1",
      topic: "Linear algebra",
      description: null,
      level: "beginner",
      structure: "linear",
      depth: "standard",
      weekly_hours: 5,
      prerequisites: null,
      creator_reasoning: "I teach this professionally.",
      status: "reviewing",
    };
    await expect(insertCourseProposal(payload)).resolves.toBe("p1");

    expect(supabase.from).toHaveBeenCalledWith("course_proposals");
    expect(insert).toHaveBeenCalledWith(payload);
  });

  it("throws on a genuine database error", async () => {
    const single = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "constraint violation" } });
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    vi.mocked(supabase.from).mockReturnValue({ insert } as never);

    await expect(
      insertCourseProposal({
        user_id: "u1",
        topic: "Linear algebra",
        description: null,
        level: "beginner",
        structure: "linear",
        depth: "standard",
        weekly_hours: 5,
        prerequisites: null,
        creator_reasoning: "I teach this professionally.",
        status: "reviewing",
      }),
    ).rejects.toThrow("constraint violation");
  });
});

describe("upsertCourseProgress", () => {
  it("upserts on the user_id, course_slug conflict target", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ upsert } as never);

    const payload = {
      user_id: "u1",
      course_slug: "intro-to-calc",
      course_title: "Intro to Calc",
      source: "community",
      status: "in_progress",
      lessons_done: 2,
      lessons_total: 5,
      current_block_id: "b1",
      last_opened_at: "2026-07-26T00:00:00.000Z",
      completed_at: null,
    };
    await upsertCourseProgress(payload);

    expect(supabase.from).toHaveBeenCalledWith("course_progress");
    expect(upsert).toHaveBeenCalledWith(payload, { onConflict: "user_id,course_slug" });
  });

  it("throws on a genuine database error", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: "constraint violation" } });
    vi.mocked(supabase.from).mockReturnValue({ upsert } as never);

    await expect(
      upsertCourseProgress({
        user_id: "u1",
        course_slug: "intro-to-calc",
        course_title: "Intro to Calc",
        source: "community",
        status: "enrolled",
        lessons_done: 0,
        lessons_total: 0,
        current_block_id: null,
        last_opened_at: "2026-07-26T00:00:00.000Z",
        completed_at: null,
      }),
    ).rejects.toThrow("constraint violation");
  });
});

describe("getConceptMasteryEvidence", () => {
  it("queries concept_mastery scoped to the user and concepts", async () => {
    const inFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn().mockReturnValue({ in: inFn });
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as never);

    await getConceptMasteryEvidence("u1", ["derivatives", "limits"]);

    expect(supabase.from).toHaveBeenCalledWith("concept_mastery");
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
    expect(inFn).toHaveBeenCalledWith("concept", ["derivatives", "limits"]);
  });
});

describe("upsertConceptMastery", () => {
  it("upserts on the user_id, concept conflict target", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ upsert } as never);

    const rows = [
      {
        user_id: "u1",
        concept: "derivatives",
        subject: "Mathematics",
        evidence_count: 4,
        correct_count: 3,
        confidence: 0.75,
        state: "solid",
        last_seen: "2026-07-26T00:00:00.000Z",
        next_review: "2026-08-02T00:00:00.000Z",
      },
    ];
    await upsertConceptMastery(rows);

    expect(upsert).toHaveBeenCalledWith(rows, { onConflict: "user_id,concept" });
  });
});

describe("getWeakConceptRows", () => {
  it("filters to struggling/developing states ordered by ascending confidence", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const inFn = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ in: inFn });
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as never);

    await getWeakConceptRows("u1", 8);

    expect(inFn).toHaveBeenCalledWith("state", ["struggling", "developing"]);
    expect(order).toHaveBeenCalledWith("confidence", { ascending: true });
    expect(limit).toHaveBeenCalledWith(8);
  });
});

describe("getCourseForEdit", () => {
  it("queries user_courses by id", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: "c1", user_id: "u1" }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as never);

    await getCourseForEdit("c1");

    expect(supabase.from).toHaveBeenCalledWith("user_courses");
    expect(eq).toHaveBeenCalledWith("id", "c1");
  });
});

describe("updateCourseFields", () => {
  it("updates the given course by id", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ update } as never);

    await updateCourseFields("c1", { title: "New title" });

    expect(update).toHaveBeenCalledWith({ title: "New title" });
    expect(eq).toHaveBeenCalledWith("id", "c1");
  });
});

describe("insertCourseModule", () => {
  it("inserts a module at the given position and returns the new row", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: "m1", course_id: "c1", title: "New module", position: 2 },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    vi.mocked(supabase.from).mockReturnValue({ insert } as never);

    const mod = await insertCourseModule("c1", "New module", 2);

    expect(insert).toHaveBeenCalledWith({ course_id: "c1", title: "New module", position: 2 });
    expect(mod).toEqual({ id: "m1", course_id: "c1", title: "New module", position: 2 });
  });
});

describe("renameCourseModule", () => {
  it("updates the module's title", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ update } as never);

    await renameCourseModule("m1", "Renamed");

    expect(update).toHaveBeenCalledWith({ title: "Renamed" });
    expect(eq).toHaveBeenCalledWith("id", "m1");
  });
});

describe("deleteCourseModule", () => {
  it("deletes the module by id", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ delete: del } as never);

    await deleteCourseModule("m1");

    expect(eq).toHaveBeenCalledWith("id", "m1");
  });
});

describe("insertCourseBlock", () => {
  it("inserts a block with the given type, data, and position", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: "b1", module_id: "m1", type: "text", data: { text: "" }, position: 0 },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    vi.mocked(supabase.from).mockReturnValue({ insert } as never);

    await insertCourseBlock("m1", "text", { text: "" }, 0);

    expect(insert).toHaveBeenCalledWith({
      module_id: "m1",
      type: "text",
      data: { text: "" },
      position: 0,
    });
  });
});

describe("updateCourseBlockData", () => {
  it("updates the block's data payload", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ update } as never);

    await updateCourseBlockData("b1", { text: "updated" });

    expect(update).toHaveBeenCalledWith({ data: { text: "updated" } });
    expect(eq).toHaveBeenCalledWith("id", "b1");
  });
});

describe("deleteCourseBlock", () => {
  it("deletes the block by id", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ delete: del } as never);

    await deleteCourseBlock("b1");

    expect(eq).toHaveBeenCalledWith("id", "b1");
  });
});
