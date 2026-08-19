/**
 * The shapes forum rows take once they reach the UI.
 *
 * `Thread` was declared twice with sixteen identical fields - once in
 * `Forum.tsx` and once in the thread route - and had already started to drift:
 * one named the moderation union, the other inlined it. AGENTS.md asks for one
 * exported type per shape crossing a boundary; this one crosses several.
 *
 * These describe what the components read, not what Postgres stores. Two pages
 * deliberately select fewer columns, and say so with `Pick` rather than by
 * writing a narrower copy that can disagree about a field's type.
 */

/** `null` is a real value here: a row written before moderation existed. */
export type ModerationStatus = "visible" | "pending" | "hidden" | "removed" | null;

/** Fields every moderatable forum row carries. */
interface Moderatable {
  moderation_status?: ModerationStatus;
  moderation_reason?: string | null;
}

export interface ForumThread extends Moderatable {
  id: string;
  user_id: string;
  author_name: string;
  title: string;
  body: string;
  course: string;
  tags: string[];
  solved: boolean;
  votes: number;
  answer_count: number;
  view_count: number;
  created_at: string;
}

export interface ForumAnswer extends Moderatable {
  id: string;
  thread_id: string;
  user_id: string;
  author_name: string;
  body: string;
  votes: number;
  accepted: boolean;
  created_at: string;
}

export interface ForumComment extends Moderatable {
  id: string;
  user_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

/** What a tag listing needs: a card, without the body's neighbours. */
export type ThreadListItem = Pick<
  ForumThread,
  | "id"
  | "title"
  | "body"
  | "course"
  | "tags"
  | "votes"
  | "answer_count"
  | "view_count"
  | "author_name"
  | "created_at"
  | "solved"
>;

/** What a profile's "recent threads" list needs: a line, not a card. */
export type ThreadLinkItem = Pick<
  ForumThread,
  "id" | "title" | "created_at" | "votes" | "answer_count"
>;
