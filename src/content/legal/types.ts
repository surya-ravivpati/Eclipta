/**
 * Legal document model.
 *
 * ── Status of these documents ───────────────────────────────────────────────
 * These are **drafts prepared for review by qualified counsel**, not
 * lawyer-approved policies. They are written to be accurate about what the
 * codebase actually does — every data category below was read off the schema
 * rather than copied from a template — which is the part an outside lawyer
 * cannot do for you and the part that most published policies get wrong.
 *
 * They must be reviewed before publication because Eclipta sits on three
 * exposures at once: it collects learners' ages (so COPPA in the US and
 * GDPR Art. 8 in the EU both bite), it processes student work through a
 * third-party AI provider, and it can disclose a learner's progress to a
 * guardian or teacher. A policy that misdescribes any of that is itself a
 * deceptive practice under FTC Act §5, independent of the underlying handling.
 *
 * `lastUpdated` is a real commitment: changing a policy's substance means
 * changing this date and, for material changes, notifying users.
 */

export interface LegalSection {
  heading: string;
  /** Paragraphs. Rendered as prose, in order. */
  body: string[];
  /** Optional bullets rendered under the paragraphs. */
  bullets?: string[];
}

export interface LegalDocument {
  slug: string;
  title: string;
  /** One line shown under the title and in the footer link's tooltip. */
  summary: string;
  lastUpdated: string;
  /** Shown at the top when the document needs review before it is relied on. */
  draft: boolean;
  sections: LegalSection[];
}

export const LEGAL_CONTACT = "ecliptalearning@gmail.com";
export const PLATFORM = "Eclipta";
