/**
 * Course lesson blocks - the units a community course is built from.
 *
 * `course_blocks.data` is a `jsonb` column, so what it holds depends on the
 * sibling `type` column. Modelling that as one object with a loose payload
 * meant every reader and editor had to know, untyped, which fields its
 * branch was allowed to touch. `CourseBlock` is a discriminated union
 * instead: narrowing on `type` narrows `data` with it, and the compiler
 * rejects reading a quiz's `options` off an image block.
 *
 * `toCourseBlock` is the only door from the database into that union.
 */
import type { Json } from "@/integrations/supabase/database";

export const COURSE_BLOCK_TYPES = ["text", "youtube", "image", "quiz"] as const;
export type CourseBlockType = (typeof COURSE_BLOCK_TYPES)[number];

/** Prose, rendered as Markdown. */
export type TextBlockData = { text?: string };

/** A YouTube embed or an uploaded image - both are a URL plus a caption. */
export type MediaBlockData = { url?: string; caption?: string };

/** A single multiple-choice question. `correctIndex` points into `options`. */
export type QuizBlockData = { question?: string; options?: string[]; correctIndex?: number };

interface CourseBlockBase {
  id: string;
  module_id: string;
  position: number;
}

export type CourseBlock =
  | (CourseBlockBase & { type: "text"; data: TextBlockData })
  | (CourseBlockBase & { type: "youtube"; data: MediaBlockData })
  | (CourseBlockBase & { type: "image"; data: MediaBlockData })
  | (CourseBlockBase & { type: "quiz"; data: QuizBlockData });

/** Any block's payload - what an editor hands back when the user edits one. */
export type CourseBlockData = CourseBlock["data"];

/** The `course_blocks` columns this module reads, before narrowing. */
export interface CourseBlockRow {
  id: string;
  module_id: string;
  type: string;
  data: Json;
  position: number;
}

// -- Json readers ------------------------------------------------------------
// A jsonb column can hold anything, so each field is read defensively and a
// value of the wrong shape is treated as absent rather than coerced.

function asObject(value: Json): Record<string, Json | undefined> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

function asString(value: Json | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: Json | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asStringArray(value: Json | undefined): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => (typeof entry === "string" ? entry : ""));
}

function isCourseBlockType(value: string): value is CourseBlockType {
  return (COURSE_BLOCK_TYPES as readonly string[]).includes(value);
}

/**
 * Narrow a stored row into a `CourseBlock`.
 *
 * Returns an empty array for a block whose `type` this build doesn't know -
 * a course authored by a newer version should render its other blocks
 * rather than crash the lesson. Callers use `flatMap`.
 */
export function toCourseBlock(row: CourseBlockRow): CourseBlock[] {
  if (!isCourseBlockType(row.type)) return [];
  const fields = asObject(row.data);
  const base = { id: row.id, module_id: row.module_id, position: row.position };

  switch (row.type) {
    case "text":
      return [{ ...base, type: "text", data: { text: asString(fields.text) } }];
    case "youtube":
      return [
        {
          ...base,
          type: "youtube",
          data: { url: asString(fields.url), caption: asString(fields.caption) },
        },
      ];
    case "image":
      return [
        {
          ...base,
          type: "image",
          data: { url: asString(fields.url), caption: asString(fields.caption) },
        },
      ];
    case "quiz":
      return [
        {
          ...base,
          type: "quiz",
          data: {
            question: asString(fields.question),
            options: asStringArray(fields.options),
            correctIndex: asNumber(fields.correctIndex),
          },
        },
      ];
  }
}

/** The payload a freshly added block starts with. */
export function emptyBlockData(type: CourseBlockType): CourseBlockData {
  switch (type) {
    case "text":
      return { text: "" };
    case "youtube":
      return { url: "", caption: "" };
    case "image":
      return { url: "", caption: "" };
    case "quiz":
      return { question: "", options: ["", "", "", ""], correctIndex: 0 };
  }
}
