import { LEGAL_CONTACT, PLATFORM, type LegalDocument } from "./types";

/**
 * The eight policies, written against what the code actually does.
 *
 * Data categories were read from the schema (user_profiles, battle_sessions,
 * learning_history, concept_mastery, ai_call_log, forum_*, study_room_*,
 * search_history, email_*, pressure_sessions, moderation_*, wellbeing_alerts),
 * so the disclosures match the system rather than a template.
 */

const UPDATED = "1 August 2026";

// ─── Privacy Policy ──────────────────────────────────────────────────────────

const privacy: LegalDocument = {
  slug: "privacy",
  title: "Privacy Policy",
  summary: "What we collect, why, who it goes to, and how to get it back or delete it.",
  lastUpdated: UPDATED,
  draft: true,
  sections: [
    {
      heading: "Who we are",
      body: [
        `${PLATFORM} is a proprietary educational platform. This policy explains what personal data we process when you use it, and the choices you have. Contact us at ${LEGAL_CONTACT} for anything in this document.`,
      ],
    },
    {
      heading: "What we collect",
      body: [
        "We collect three kinds of data: what you give us, what the platform records as you use it, and what your device sends automatically.",
      ],
      bullets: [
        "Account: email address, username, and password (stored only as a hash we cannot reverse).",
        "Profile, if you provide it: age, avatar, bio, learning goal, preferred pace and study style, and interface language.",
        "Learning activity: courses and lessons you open, questions you answer and whether each was correct, time taken per question, concept mastery estimates, study streaks and practice dates.",
        "Battles and Pressure Mode: match results, ratings, per-question records, chosen archetypes and Ecliptars, and — in Pressure Mode — timing and answer-change patterns used to compute your score.",
        "Community content: forum threads, answers, comments, votes, study-room messages, and reports you submit.",
        "Luna (AI tutor): the messages you send, the platform's replies, and notes generated to personalise future sessions. Voice features additionally process the audio you record.",
        "Search: queries you run in the platform search, and which result you opened.",
        "Email: which lifecycle emails we sent you and whether sending succeeded.",
        "Technical: IP address, browser and device type, and timestamps, recorded by our hosting and security infrastructure.",
      ],
    },
    {
      heading: "Why we process it",
      body: [
        "We process your data to operate the platform, and only for the purposes below. We do not sell personal data, and we do not use your learning data for advertising.",
      ],
      bullets: [
        "To provide the service you asked for — running courses, battles, forums and study rooms (contractual necessity).",
        "To personalise learning: mastery estimates, spaced review scheduling and recommendations (contractual necessity).",
        "To keep the platform safe: automated and human moderation of user content (legitimate interests, and legal obligation where applicable).",
        "To send service messages, and — only if you have not opted out — digests and progress emails (consent, withdrawable at any time).",
        "To improve the platform in aggregate (legitimate interests).",
      ],
    },
    {
      heading: "AI processing",
      body: [
        "Luna and some question-generation features send your input to a third-party AI provider to produce a response. That means text you type into Luna, and audio if you use voice, leaves our systems and is processed by that provider under contract.",
        "We log that a call was made and its metadata so we can enforce rate limits and investigate abuse. Do not put information into Luna that you would not want processed by a third party — see the AI Usage Disclaimer for what Luna is and is not.",
      ],
    },
    {
      heading: "Who we share it with",
      body: [
        "We share personal data only with service providers acting on our instructions, and with people you choose.",
      ],
      bullets: [
        "Hosting, database and authentication provider — stores substantially all platform data.",
        "AI provider — receives the content described above when you use AI features.",
        "Email delivery provider — receives your email address and the message content.",
        "Guardians and teachers you invite — receive weekly progress summaries, and only after they confirm their own address. You can revoke this at any time, and so can they.",
        "Other users — anything you post publicly (forum content, username, profile, leaderboard position) is visible to them.",
      ],
    },
    {
      heading: "Children and young people",
      body: [
        "This platform is used by students, and we ask for age during onboarding.",
        `Where a user is under the age at which they can consent for themselves — 13 in the United States under COPPA, and between 13 and 16 depending on the country under GDPR Article 8 — verifiable parental consent is required before we may process their personal data. If you believe a child has provided us with personal data without that consent, contact ${LEGAL_CONTACT} and we will delete it.`,
        "If a school or district deploys Eclipta, additional obligations may apply, including FERPA in the United States. Schools should contact us before rolling the platform out to students.",
      ],
    },
    {
      heading: "Retention",
      body: [
        "We keep account and learning data for as long as your account exists, because your mastery history is the product. Search history is capped at your 50 most recent queries. Email send records are kept so we can answer 'why did I not receive that'. Moderation records are retained after content is removed, because deleting the record of a decision defeats the point of having one.",
        "When you delete your account we delete or anonymise your personal data, except where we must retain something to comply with a legal obligation or to resolve a dispute.",
      ],
    },
    {
      heading: "Your rights",
      body: [
        "Depending on where you live, you may have the right to access your data, correct it, delete it, restrict or object to processing, and receive a copy in a portable format. Users in the EU/UK have these under GDPR; users in California have comparable rights under the CCPA/CPRA, including the right not to be discriminated against for exercising them.",
        `To exercise any of these, contact ${LEGAL_CONTACT}. You also have the right to complain to your local data protection authority.`,
      ],
    },
    {
      heading: "Security and international transfers",
      body: [
        "We use industry-standard measures including encryption in transit, hashed passwords, and row-level access controls in the database. No system is perfectly secure, and we do not claim otherwise.",
        "Our providers may process data outside your country, including in the United States. Where required, transfers rely on appropriate safeguards such as Standard Contractual Clauses.",
      ],
    },
    {
      heading: "Changes",
      body: [
        "We will update this policy as the platform changes. The date at the top always reflects the current version, and we will notify you of material changes rather than relying on you to re-read it.",
      ],
    },
  ],
};

// ─── Terms of Service ────────────────────────────────────────────────────────

const terms: LegalDocument = {
  slug: "terms",
  title: "Terms of Service",
  summary: "The agreement between you and Eclipta for using the platform.",
  lastUpdated: UPDATED,
  draft: true,
  sections: [
    {
      heading: "Agreement",
      body: [
        `By creating an account or using ${PLATFORM}, you agree to these Terms. If you do not agree, do not use the platform.`,
        "If you are under the age of majority where you live, you may use Eclipta only with the involvement of a parent, guardian or school that agrees to these Terms on your behalf.",
      ],
    },
    {
      heading: "Your account",
      body: [
        "You are responsible for keeping your credentials secure and for activity under your account. Provide accurate information when you register, and tell us promptly if you believe your account has been compromised.",
        "One person, one account. Do not share an account, and do not create an account on someone else's behalf without authority to do so.",
      ],
    },
    {
      heading: "Ownership of the platform",
      body: [
        `${PLATFORM} is proprietary software. We and our licensors retain all rights in the platform, including its code, design, content, trade marks and the Ecliptar characters.`,
        "You receive a limited, non-exclusive, non-transferable, revocable licence to use the platform for your own learning. You may not copy, modify, reverse-engineer, resell, scrape, or create derivative works from any part of it, or use it to build a competing product.",
      ],
    },
    {
      heading: "Your content",
      body: [
        "You keep ownership of what you create — forum posts, messages, courses you build. You grant us a worldwide, non-exclusive, royalty-free licence to host, store, reproduce and display that content for the purpose of operating and improving the platform.",
        "You are responsible for what you post, and you confirm you have the rights to post it. See the Community Guidelines and Acceptable Use Policy for what is not allowed.",
      ],
    },
    {
      heading: "Educational content is not advice",
      body: [
        "Eclipta is a study tool. Its content, including anything produced by Luna, may contain errors and is not professional advice of any kind — academic, medical, legal, financial or otherwise. Verify anything that matters against an authoritative source or a qualified person.",
      ],
    },
    {
      heading: "Availability and changes",
      body: [
        "We may change, suspend or discontinue features. We aim to give notice of significant changes but cannot always do so, particularly where a change is needed for security.",
        "We do not guarantee uninterrupted or error-free operation.",
      ],
    },
    {
      heading: "Suspension and termination",
      body: [
        "We may suspend or terminate an account that breaches these Terms, the Acceptable Use Policy, the Community Guidelines or the Academic Integrity Policy, or where required by law.",
        "You may delete your account at any time. Some content you posted publicly may remain visible where others have relied on it, but it will be disassociated from your identity where we can do so.",
      ],
    },
    {
      heading: "Disclaimers and liability",
      body: [
        "To the fullest extent permitted by law, the platform is provided 'as is' without warranties of any kind, and our aggregate liability arising out of your use of it is limited to the greater of the amount you paid us in the twelve months before the claim, or fifty US dollars.",
        "Nothing in these Terms excludes liability that cannot lawfully be excluded, including for death or personal injury caused by negligence, or for fraud. Some jurisdictions do not allow certain exclusions, so parts of this section may not apply to you.",
      ],
    },
    {
      heading: "Governing law",
      body: [
        "These Terms are governed by the laws of the jurisdiction in which the operator of Eclipta is established, without regard to conflict-of-law rules. Consumers retain the protection of mandatory provisions of the law of the country where they live.",
      ],
    },
    {
      heading: "Contact",
      body: [`Questions about these Terms: ${LEGAL_CONTACT}.`],
    },
  ],
};

// ─── Cookie Policy ───────────────────────────────────────────────────────────

const cookies: LegalDocument = {
  slug: "cookies",
  title: "Cookie Policy",
  summary: "What we store on your device, and which of it you can refuse.",
  lastUpdated: UPDATED,
  draft: true,
  sections: [
    {
      heading: "What we use",
      body: [
        "We use cookies and equivalent browser storage — localStorage and sessionStorage — for a small number of purposes. We do not use advertising cookies and we do not sell data to advertisers.",
      ],
      bullets: [
        "Strictly necessary: keeping you signed in, protecting against cross-site request forgery, and load balancing. These cannot be switched off, because the platform does not function without them.",
        "Preferences: your theme, interface language, and Reduce Motion setting. Stored locally so the platform looks the way you left it.",
        "Functional: your place in a course, and draft content you have not submitted.",
      ],
    },
    {
      heading: "Consent",
      body: [
        "Strictly necessary storage does not require consent under the ePrivacy Directive or equivalent laws, and is used from the moment you load the platform. Anything beyond that is set only after you agree, and you can change your mind at any time from your profile settings.",
        "If you decline non-essential storage, the platform continues to work; it will simply forget preferences between sessions.",
      ],
    },
    {
      heading: "Third parties",
      body: [
        "Our hosting and authentication provider sets cookies necessary to keep your session valid. Our AI and email providers do not set cookies in your browser, because you never contact them directly — the platform calls them on your behalf.",
      ],
    },
    {
      heading: "Managing storage",
      body: [
        "You can clear cookies and site data from your browser settings at any time. Doing so signs you out and resets your preferences.",
      ],
    },
  ],
};

// ─── Community Guidelines ────────────────────────────────────────────────────

const community: LegalDocument = {
  slug: "community",
  title: "Community Guidelines",
  summary: "How we expect people to treat each other in forums, groups and battles.",
  lastUpdated: UPDATED,
  draft: false,
  sections: [
    {
      heading: "The short version",
      body: [
        "Eclipta is a place where people admit what they do not understand. That only works if being wrong in public is safe here. Everything below follows from that.",
      ],
    },
    {
      heading: "Be decent",
      body: ["The things that get content removed and accounts suspended:"],
      bullets: [
        "Harassment, bullying, or targeting someone repeatedly.",
        "Hate speech or slurs directed at people for who they are.",
        "Sexual content, and any sexualisation of minors — the latter is reported to the relevant authorities, always.",
        "Threats of violence, or encouraging self-harm.",
        "Doxxing: posting someone's personal information without their consent.",
        "Spam, scams, or promotional content dressed up as a question.",
      ],
    },
    {
      heading: "Answering well",
      body: [
        "A good answer explains the reasoning, not just the result. Posting a bare solution to someone's homework is unhelpful at best and a breach of the Academic Integrity Policy at worst.",
        "Nobody is required to answer, but if you do, answer the question that was asked. Correcting someone's grammar instead of their calculus is not participation.",
      ],
    },
    {
      heading: "Asking well",
      body: [
        "Show what you tried. 'I got −4 and the answer is 4, where does the sign flip?' will get you a real answer; 'solve question 7' usually will not.",
      ],
    },
    {
      heading: "Reporting",
      body: [
        "Report content that breaks these rules rather than replying to it. Reports are confidential — the person reported is not told who reported them.",
        "Reporting in bad faith, or organising others to mass-report someone, is itself a breach.",
      ],
    },
    {
      heading: "How we enforce",
      body: [
        "Content is checked automatically and, where a decision is unclear or contested, by a person. Consequences scale with severity and history: most first breaches get content removed and a note explaining why.",
        `If you think we got it wrong, contact ${LEGAL_CONTACT}. We will look again.`,
      ],
    },
  ],
};

// ─── Academic Integrity ──────────────────────────────────────────────────────

const integrity: LegalDocument = {
  slug: "academic-integrity",
  title: "Academic Integrity Policy",
  summary: "Using Eclipta to learn, not to get around learning.",
  lastUpdated: UPDATED,
  draft: false,
  sections: [
    {
      heading: "The principle",
      body: [
        "Eclipta exists to make you better at things. Every feature is built around that, which is why Luna gives hints instead of answers and why the forum rewards explanations over solutions.",
        "Using the platform to produce work you pass off as your own understanding defeats the only thing it is for.",
      ],
    },
    {
      heading: "What is not allowed",
      body: [],
      bullets: [
        "Submitting Eclipta output — including anything Luna produced — as your own work where your institution forbids it.",
        "Using the platform during an exam, test or assessment unless your institution has explicitly permitted it.",
        "Posting live exam questions, or content under an active academic embargo.",
        "Asking the community to complete graded work on your behalf, or doing so for someone else.",
        "Sharing accounts so that someone else's work appears under your name.",
      ],
    },
    {
      heading: "What is encouraged",
      body: [],
      bullets: [
        "Asking why an answer is what it is, after you have attempted it.",
        "Working a problem with Luna until you can do the next one unaided.",
        "Explaining a concept to someone else — the fastest way to find out whether you actually know it.",
        "Practising under exam conditions in Pressure Mode before the real thing.",
      ],
    },
    {
      heading: "Your institution's rules come first",
      body: [
        "Schools and universities set their own policies, and they vary widely — some permit AI assistance with disclosure, others prohibit it entirely. Where their rules are stricter than ours, theirs apply. We cannot tell you what your institution allows; ask them.",
      ],
    },
    {
      heading: "Enforcement",
      body: [
        "Accounts used to circumvent assessment may be suspended. Where an institution formally requests it in connection with a misconduct investigation, we may confirm account activity to the extent the law requires or permits.",
      ],
    },
  ],
};

// ─── Acceptable Use ──────────────────────────────────────────────────────────

const acceptableUse: LegalDocument = {
  slug: "acceptable-use",
  title: "Acceptable Use Policy",
  summary: "Technical limits on how the platform may be used.",
  lastUpdated: UPDATED,
  draft: true,
  sections: [
    {
      heading: "Scope",
      body: [
        "This policy covers how you may interact with the platform's systems. The Community Guidelines cover how you interact with people.",
      ],
    },
    {
      heading: "Prohibited",
      body: [],
      bullets: [
        "Accessing accounts, data or areas you are not authorised to reach, or attempting to.",
        "Probing, scanning or testing the security of the platform without our prior written permission.",
        "Scraping, crawling or bulk-extracting content, including via automated clients, without permission.",
        "Reverse-engineering, decompiling, or attempting to derive source code.",
        "Circumventing rate limits, quotas, paywalls or moderation.",
        "Uploading malware, or content designed to disrupt the platform or other users' devices.",
        "Using the AI features to generate content prohibited elsewhere in these policies, or to extract the underlying model or its instructions.",
        "Reselling, sublicensing, or providing the platform as a service to third parties.",
        "Using automated means to inflate ratings, streaks, leaderboard position or any other metric.",
      ],
    },
    {
      heading: "Rate limits",
      body: [
        "We apply limits to AI calls and other expensive operations. They exist to keep the platform available and affordable for everyone. Deliberately working around them is a breach of this policy.",
      ],
    },
    {
      heading: "Security research",
      body: [
        `If you find a vulnerability, tell us at ${LEGAL_CONTACT} before telling anyone else, and give us reasonable time to fix it. We will not pursue action against research conducted in good faith, that respects user privacy, and that does not degrade the service.`,
      ],
    },
  ],
};

// ─── AI Usage Disclaimer ─────────────────────────────────────────────────────

const aiDisclaimer: LegalDocument = {
  slug: "ai-disclaimer",
  title: "AI Usage Disclaimer",
  summary: "What Luna is, what it is not, and what happens to what you tell it.",
  lastUpdated: UPDATED,
  draft: false,
  sections: [
    {
      heading: "Luna is a study aid, not an authority",
      body: [
        "Luna is built on a large language model. It produces text that is usually helpful and sometimes confidently wrong. It can misstate facts, invent citations, make arithmetic errors, and contradict itself between sessions.",
        "Treat everything it says as a starting point to be checked, not an answer to be trusted. This is a property of the technology, not a bug we expect to eliminate.",
      ],
    },
    {
      heading: "It gives hints on purpose",
      body: [
        "Luna is instructed to guide rather than solve. That is a deliberate design choice: a hint you act on teaches you more than a solution you read. If you want the answer immediately, Luna is the wrong tool.",
      ],
    },
    {
      heading: "Not professional advice",
      body: [
        "Luna is not a doctor, lawyer, financial adviser, therapist or teacher of record. Do not rely on it for decisions with real consequences. If you are in crisis, contact a qualified professional or your local emergency services — Luna cannot help with that and will say so.",
      ],
    },
    {
      heading: "What happens to what you send",
      body: [
        "Your messages, and your audio if you use voice, are sent to a third-party AI provider to generate a response. Luna also keeps notes about your progress to personalise later sessions.",
        "Do not send anything you would not want processed by a third party — including personal details about yourself or others, credentials, or confidential material.",
      ],
    },
    {
      heading: "AI-generated platform content",
      body: [
        "Some questions and explanations on the platform are generated rather than written by a person, and some starter content is authored by us rather than by community members. Where content is not written by a member of the community, it is labelled as such.",
      ],
    },
    {
      heading: "Your institution may restrict AI use",
      body: [
        "See the Academic Integrity Policy. Where your school's rules on AI assistance are stricter than ours, follow theirs.",
      ],
    },
  ],
};

// ─── Copyright Policy ────────────────────────────────────────────────────────

const copyright: LegalDocument = {
  slug: "copyright",
  title: "Copyright Policy",
  summary: "Reporting infringement, and how we handle notices.",
  lastUpdated: UPDATED,
  draft: true,
  sections: [
    {
      heading: "Respecting copyright",
      body: [
        "Do not upload, post or share material you do not have the right to use. That includes textbook pages, past papers under copyright, worked solutions from paid resources, and images you found online.",
        "Quoting a short extract to ask a question about it is usually fine. Reproducing a chapter is not.",
      ],
    },
    {
      heading: "Reporting infringement",
      body: [
        `If you believe content on ${PLATFORM} infringes your copyright, send a notice to ${LEGAL_CONTACT} including:`,
      ],
      bullets: [
        "Your contact details.",
        "Identification of the work you say is infringed.",
        "A link to the specific content on the platform, precise enough for us to find it.",
        "A statement that you believe in good faith the use is not authorised by the rights holder, its agent, or the law.",
        "A statement, under penalty of perjury, that the information is accurate and that you are the rights holder or authorised to act for them.",
        "Your physical or electronic signature.",
      ],
    },
    {
      heading: "What we do with a notice",
      body: [
        "We review notices and remove or disable access to content that appears to infringe. We tell the person who posted it what happened and why.",
      ],
    },
    {
      heading: "Counter-notice",
      body: [
        "If your content was removed and you believe that was a mistake or misidentification, you may send a counter-notice with your contact details, identification of the removed content and where it appeared, and a statement under penalty of perjury to that effect. We may restore the content unless the original complainant brings a court action.",
      ],
    },
    {
      heading: "Repeat infringers",
      body: [
        "We terminate the accounts of users who repeatedly infringe copyright.",
      ],
    },
    {
      heading: "Third-party software",
      body: [
        `${PLATFORM} is proprietary software, but it is built using open-source components licensed to us by their authors. Those licences require us to preserve their copyright and permission notices, which we do — see the Third-Party Notices page. Nothing there grants any right in ${PLATFORM} itself.`,
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  privacy,
  terms,
  cookies,
  community,
  integrity,
  acceptableUse,
  aiDisclaimer,
  copyright,
];

export function getLegalDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((d) => d.slug === slug);
}
