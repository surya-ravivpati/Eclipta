/**
 * The educational progression graph — Phase 2 of the Courses redesign
 * (docs/courses-redesign.md §8).
 *
 * Courses don't depend on courses (brittle); they depend on CONCEPTS, which a
 * course may teach or require. Concepts form a DAG. Proving a concept by any
 * path (finishing a course that teaches it, a strong battle/quiz signal) raises
 * readiness for everything downstream.
 *
 * This is a curated graph over the current catalog. When courses gain real
 * `teaches`/`requires` concept columns the COURSE_CONCEPTS map moves to the DB,
 * but the engine that reads it (src/lib/recommend.ts) stays the same.
 */

import type { Subject } from "./courses";

export interface ConceptNode {
  id: string;
  label: string;
  subject: Subject;
  /** prerequisite concept ids — the DAG edges */
  dependsOn: string[];
  /** free-text phrases (from weak/strong_areas) that map onto this concept */
  aliases: string[];
}

export const CONCEPTS: ConceptNode[] = [
  // ── Mathematics ladder ───────────────────────────────────────────────
  { id: "algebra", label: "Algebra", subject: "Mathematics", dependsOn: [], aliases: ["algebra", "equations"] },
  { id: "limits", label: "Limits", subject: "Mathematics", dependsOn: ["algebra"], aliases: ["limits", "continuity"] },
  { id: "derivatives", label: "Derivatives", subject: "Mathematics", dependsOn: ["limits"], aliases: ["derivative", "differentiation"] },
  { id: "integrals", label: "Integrals", subject: "Mathematics", dependsOn: ["derivatives"], aliases: ["integral", "integration"] },
  { id: "linear-algebra", label: "Linear Algebra", subject: "Mathematics", dependsOn: ["algebra"], aliases: ["linear algebra", "vectors", "matrices", "matrix"] },
  { id: "statistics", label: "Statistics", subject: "Mathematics", dependsOn: ["algebra"], aliases: ["statistics", "stats", "probability"] },

  // ── Computer Science ladder ──────────────────────────────────────────
  { id: "programming", label: "Programming", subject: "Computer Science", dependsOn: [], aliases: ["programming", "coding", "intro to python", "basics"] },
  { id: "python", label: "Python", subject: "Computer Science", dependsOn: ["programming"], aliases: ["python"] },
  { id: "data-structures", label: "Data Structures", subject: "Computer Science", dependsOn: ["programming"], aliases: ["data structure", "data structures", "arrays", "linked list"] },
  { id: "algorithms", label: "Algorithms", subject: "Computer Science", dependsOn: ["data-structures"], aliases: ["algorithm", "algorithms", "sorting", "recursion"] },
  { id: "graph-algorithms", label: "Graph Algorithms", subject: "Computer Science", dependsOn: ["algorithms"], aliases: ["graph algorithm", "graphs", "dijkstra", "bfs", "dfs"] },
  { id: "complexity", label: "Complexity", subject: "Computer Science", dependsOn: ["algorithms"], aliases: ["complexity", "big-o", "big o", "amortized"] },
  { id: "databases", label: "Databases", subject: "Computer Science", dependsOn: ["programming"], aliases: ["database", "databases", "sql"] },
  { id: "distributed-systems", label: "Distributed Systems", subject: "Computer Science", dependsOn: ["databases"], aliases: ["distributed systems", "scalability", "systems design"] },
  { id: "ml-basics", label: "Machine Learning", subject: "Computer Science", dependsOn: ["linear-algebra", "statistics", "python"], aliases: ["machine learning", "ml", "regression"] },
  { id: "neural-nets", label: "Neural Networks", subject: "Computer Science", dependsOn: ["ml-basics"], aliases: ["neural network", "neural networks", "deep learning", "backprop"] },
  { id: "networking", label: "Networking", subject: "Computer Science", dependsOn: [], aliases: ["networking", "network", "tcp"] },
  { id: "linux", label: "Linux", subject: "Computer Science", dependsOn: [], aliases: ["linux", "bash", "shell"] },
  { id: "pentesting", label: "Penetration Testing", subject: "Computer Science", dependsOn: ["networking", "linux"], aliases: ["penetration testing", "pentest", "security", "cybersecurity"] },
  { id: "web-exploitation", label: "Web Exploitation", subject: "Computer Science", dependsOn: ["pentesting"], aliases: ["web exploitation", "sqli", "xss", "ssrf"] },

  // ── Science (quantum) ────────────────────────────────────────────────
  { id: "qubits", label: "Qubits", subject: "Science", dependsOn: ["linear-algebra"], aliases: ["qubit", "qubits", "superposition", "quantum"] },
  { id: "quantum-algorithms", label: "Quantum Algorithms", subject: "Science", dependsOn: ["qubits"], aliases: ["quantum algorithm", "grover", "shor"] },
];

const CONCEPT_BY_ID = new Map(CONCEPTS.map((c) => [c.id, c]));
export const conceptById = (id: string): ConceptNode | undefined => CONCEPT_BY_ID.get(id);

/** Which catalog courses teach / require which concepts. */
export interface CourseConcepts {
  teaches: string[];
  requires: string[];
}

export const COURSE_CONCEPTS: Record<string, CourseConcepts> = {
  "calculus-through-intuition": { teaches: ["limits", "derivatives", "integrals"], requires: ["algebra"] },
  "machine-learning-foundations": { teaches: ["ml-basics", "neural-nets"], requires: ["linear-algebra", "statistics", "python"] },
  "advanced-algorithms": { teaches: ["graph-algorithms", "complexity"], requires: ["data-structures"] },
  "quantum-computing-primer": { teaches: ["qubits", "quantum-algorithms"], requires: ["linear-algebra"] },
  "systems-design-mastery": { teaches: ["distributed-systems"], requires: ["databases", "programming"] },
  "cybersecurity-red-team": { teaches: ["pentesting", "web-exploitation"], requires: ["networking", "linux"] },
};

export const conceptsOf = (slug: string): CourseConcepts =>
  COURSE_CONCEPTS[slug] ?? { teaches: [], requires: [] };

/** Find the concept a free-text phrase (a weak/strong area) refers to, if any. */
export function matchConcept(phrase: string): ConceptNode | undefined {
  const p = phrase.toLowerCase().trim();
  if (!p) return undefined;
  // exact alias hit first, then substring either direction
  for (const c of CONCEPTS) {
    if (c.aliases.some((a) => a === p)) return c;
  }
  for (const c of CONCEPTS) {
    if (c.aliases.some((a) => p.includes(a) || a.includes(p))) return c;
  }
  return undefined;
}

/** The first catalog course that teaches a concept (for remediation links). */
export function courseTeaching(conceptId: string): string | undefined {
  for (const [slug, cc] of Object.entries(COURSE_CONCEPTS)) {
    if (cc.teaches.includes(conceptId)) return slug;
  }
  return undefined;
}

/**
 * Topologically ordered concepts for one subject — the spine a learning path
 * renders. Stable (Kahn's algorithm over the subject-local subgraph).
 */
export function subjectPath(subject: Subject): ConceptNode[] {
  const nodes = CONCEPTS.filter((c) => c.subject === subject);
  const ids = new Set(nodes.map((n) => n.id));
  const indeg = new Map<string, number>();
  for (const n of nodes) indeg.set(n.id, n.dependsOn.filter((d) => ids.has(d)).length);
  const out: ConceptNode[] = [];
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0);
  const seen = new Set<string>();
  while (queue.length) {
    const n = queue.shift()!;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
    for (const m of nodes) {
      if (m.dependsOn.includes(n.id)) {
        indeg.set(m.id, (indeg.get(m.id) ?? 1) - 1);
        if ((indeg.get(m.id) ?? 0) <= 0) queue.push(m);
      }
    }
  }
  // append any cycle-stranded nodes (shouldn't happen in a DAG) for safety
  for (const n of nodes) if (!seen.has(n.id)) out.push(n);
  return out;
}
