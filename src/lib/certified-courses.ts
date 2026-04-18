export type CertifiedCourse = {
  slug: string;
  title: string;
  creator: string;
  badge: "ECLIPTA OFFICIAL" | "CERTIFIED CREATOR";
  level: string;
  duration: string;
  enrolled: string;
  rating: number;
  outcomes: string[];
  tags: string[];
  syllabus: { title: string; lessons: string[] }[];
  description: string;
};

export const CERTIFIED_COURSES: CertifiedCourse[] = [
  {
    slug: "machine-learning-foundations",
    title: "Machine Learning Foundations",
    creator: "Eclipta Team",
    badge: "ECLIPTA OFFICIAL",
    level: "Intermediate",
    duration: "40 hrs",
    enrolled: "2.4k",
    rating: 4.9,
    outcomes: ["Build ML models from scratch", "Understand neural network architecture", "Deploy models to production"],
    tags: ["Python", "TensorFlow", "Statistics"],
    description: "A rigorous introduction to modern machine learning — from linear regression all the way to convolutional neural networks. You'll write models from first principles, then graduate to production-grade tooling.",
    syllabus: [
      { title: "Foundations", lessons: ["Linear regression", "Logistic regression", "Loss & gradient descent"] },
      { title: "Classical ML", lessons: ["Decision trees", "Random forests", "SVMs", "k-NN"] },
      { title: "Neural Networks", lessons: ["Forward & backprop", "Activation functions", "Optimizers"] },
      { title: "Deep Learning", lessons: ["CNNs", "RNNs", "Transformers"] },
      { title: "Production", lessons: ["Model versioning", "Serving with FastAPI", "Monitoring drift"] },
    ],
  },
  {
    slug: "advanced-algorithms",
    title: "Advanced Algorithms & Data Structures",
    creator: "Dr. Elara Voss",
    badge: "CERTIFIED CREATOR",
    level: "Advanced",
    duration: "55 hrs",
    enrolled: "1.8k",
    rating: 4.8,
    outcomes: ["Master graph algorithms", "Optimize time & space complexity", "Ace technical interviews"],
    tags: ["Algorithms", "Complexity", "Problem Solving"],
    description: "Go beyond textbook complexity analysis. Tackle the algorithms that show up in real systems — from concurrent skip lists to amortized analysis of LSM trees.",
    syllabus: [
      { title: "Complexity Theory", lessons: ["Big-O refresher", "Amortized analysis", "P vs NP intuition"] },
      { title: "Graph Algorithms", lessons: ["BFS/DFS", "Dijkstra & A*", "Min-cost max-flow"] },
      { title: "Advanced Structures", lessons: ["Skip lists", "Tries", "Segment trees", "Persistent data structures"] },
      { title: "Interview Prep", lessons: ["DP patterns", "Greedy proofs", "System-design crossovers"] },
    ],
  },
  {
    slug: "quantum-computing-primer",
    title: "Quantum Computing Primer",
    creator: "Eclipta Team",
    badge: "ECLIPTA OFFICIAL",
    level: "Beginner",
    duration: "25 hrs",
    enrolled: "980",
    rating: 4.9,
    outcomes: ["Understand qubits & superposition", "Write basic quantum circuits", "Grasp quantum advantage"],
    tags: ["Physics", "Qiskit", "Linear Algebra"],
    description: "A gentle on-ramp to quantum computing. No prior physics required — we'll build the linear algebra you need as we go.",
    syllabus: [
      { title: "Linear Algebra Refresher", lessons: ["Vectors & inner products", "Tensor products"] },
      { title: "The Qubit", lessons: ["Superposition", "Bloch sphere", "Single-qubit gates"] },
      { title: "Multi-qubit Systems", lessons: ["Entanglement", "CNOT, Toffoli", "Bell states"] },
      { title: "Algorithms", lessons: ["Deutsch-Jozsa", "Grover search", "Shor's intuition"] },
    ],
  },
  {
    slug: "systems-design-mastery",
    title: "Systems Design Mastery",
    creator: "Kai Nakamura",
    badge: "CERTIFIED CREATOR",
    level: "Advanced",
    duration: "60 hrs",
    enrolled: "3.1k",
    rating: 4.7,
    outcomes: ["Design scalable distributed systems", "Handle millions of concurrent users", "Navigate real-world trade-offs"],
    tags: ["Architecture", "Distributed Systems", "Databases"],
    description: "Designed for engineers preparing for L5/L6 interviews and architects scaling real systems. Every module ends with a live design challenge.",
    syllabus: [
      { title: "Fundamentals", lessons: ["CAP theorem", "Consistency models", "Latency budgets"] },
      { title: "Storage", lessons: ["SQL vs NoSQL", "Sharding strategies", "Replication"] },
      { title: "Compute", lessons: ["Stateless services", "Queues & streams", "Backpressure"] },
      { title: "Case Studies", lessons: ["Design Twitter", "Design Uber", "Design Dropbox"] },
    ],
  },
  {
    slug: "calculus-through-intuition",
    title: "Calculus Through Intuition",
    creator: "Eclipta Team",
    badge: "ECLIPTA OFFICIAL",
    level: "Beginner",
    duration: "30 hrs",
    enrolled: "5.2k",
    rating: 5.0,
    outcomes: ["Visualize derivatives & integrals", "Solve real-world optimization problems", "Build mathematical intuition"],
    tags: ["Mathematics", "Visualization", "Problem Solving"],
    description: "Calculus the way it should be taught — visual, intuitive, and grounded in real problems.",
    syllabus: [
      { title: "Limits", lessons: ["Geometric intuition", "Continuity", "Asymptotes"] },
      { title: "Derivatives", lessons: ["Slopes & rates", "Chain rule", "Optimization"] },
      { title: "Integrals", lessons: ["Area under curves", "Fundamental theorem", "Substitution"] },
      { title: "Applications", lessons: ["Physics motion", "Probability density", "ML gradients"] },
    ],
  },
  {
    slug: "cybersecurity-red-team",
    title: "Cybersecurity Red Team Ops",
    creator: "Zara Okonkwo",
    badge: "CERTIFIED CREATOR",
    level: "Advanced",
    duration: "70 hrs",
    enrolled: "1.2k",
    rating: 4.8,
    outcomes: ["Perform penetration testing", "Exploit common vulnerabilities", "Build defensive strategies"],
    tags: ["Security", "Networking", "Linux"],
    description: "Hands-on offensive security in a sandboxed lab. Every concept is paired with a CTF-style challenge.",
    syllabus: [
      { title: "Recon", lessons: ["Nmap deep-dive", "OSINT workflows", "Subdomain enumeration"] },
      { title: "Web Exploitation", lessons: ["SQLi", "XSS", "SSRF"] },
      { title: "Network Attacks", lessons: ["MITM", "Pivoting", "Privilege escalation"] },
      { title: "Reporting & Defense", lessons: ["Writing pentest reports", "Hardening playbooks"] },
    ],
  },
];

export function getCourseBySlug(slug: string): CertifiedCourse | undefined {
  return CERTIFIED_COURSES.find(c => c.slug === slug);
}
