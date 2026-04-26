// Luna learning context tracker
// Tracks user behavior signals for adaptive responses

export interface LunaLearningContext {
  courseId?: string;
  lessonTitle?: string;
  currentQuestion?: string;
  difficulty?: string;
  weakAreas: string[];
  streak: number;
  incorrectCount: number;
  avgResponseTime: number;
  totalQuestions: number;
  correctAnswers: number;
  sessionStartTime: number;
  lastActivityTime: number;
  hintLevel: number; // 0 = no hint yet, 1 = conceptual, 2 = direct, 3 = full explain
  consecutiveErrors: number;
  rapidGuessCount: number;
}

const DEFAULT_CONTEXT: LunaLearningContext = {
  weakAreas: [],
  streak: 0,
  incorrectCount: 0,
  avgResponseTime: 0,
  totalQuestions: 0,
  correctAnswers: 0,
  sessionStartTime: Date.now(),
  lastActivityTime: Date.now(),
  hintLevel: 0,
  consecutiveErrors: 0,
  rapidGuessCount: 0,
};

let context: LunaLearningContext = { ...DEFAULT_CONTEXT };
let currentOwnerId: string | null = null;

// Pub/sub so Luna can react to fatigue the moment recordAnswer changes the
// signals, instead of polling on a 60s interval.
type FatigueLevel = "none" | "mild" | "severe";
type FatigueListener = (level: FatigueLevel, ctx: LunaLearningContext) => void;
const fatigueListeners = new Set<FatigueListener>();
let lastEmittedFatigue: FatigueLevel = "none";

export function subscribeFatigue(listener: FatigueListener): () => void {
  fatigueListeners.add(listener);
  return () => fatigueListeners.delete(listener);
}

function emitFatigueIfChanged() {
  const level = detectFatigue();
  if (level === lastEmittedFatigue) return;
  lastEmittedFatigue = level;
  fatigueListeners.forEach(l => {
    try { l(level, context); } catch { /* ignore listener errors */ }
  });
}

/**
 * Bind the in-memory context to a specific user. If the owner changes
 * (login, logout, account switch) the context is reset so one user's
 * streak/weakness signals never leak into another user's session.
 */
export function bindLunaContextToUser(userId: string | null) {
  if (currentOwnerId === userId) return;
  currentOwnerId = userId;
  context = { ...DEFAULT_CONTEXT, sessionStartTime: Date.now() };
  lastEmittedFatigue = "none";
}

export function getLunaContext(): LunaLearningContext {
  return { ...context };
}

export function updateLunaContext(partial: Partial<LunaLearningContext>) {
  context = { ...context, ...partial, lastActivityTime: Date.now() };
}

export function resetHintLevel() {
  context.hintLevel = 0;
}

export function escalateHint(): number {
  context.hintLevel = Math.min(context.hintLevel + 1, 3);
  return context.hintLevel;
}

export function recordAnswer(correct: boolean, responseTimeMs: number) {
  context.totalQuestions++;
  context.lastActivityTime = Date.now();

  if (correct) {
    context.correctAnswers++;
    context.streak++;
    context.consecutiveErrors = 0;
    context.rapidGuessCount = 0;
  } else {
    context.incorrectCount++;
    context.streak = 0;
    context.consecutiveErrors++;
    if (responseTimeMs < 2000) context.rapidGuessCount++;
  }

  // Rolling average response time
  const n = context.totalQuestions;
  context.avgResponseTime =
    (context.avgResponseTime * (n - 1) + responseTimeMs / 1000) / n;

  emitFatigueIfChanged();
}

// Fatigue detection
export function detectFatigue(): "none" | "mild" | "severe" {
  if (context.consecutiveErrors >= 5 || context.rapidGuessCount >= 4) return "severe";
  if (context.consecutiveErrors >= 3 || context.rapidGuessCount >= 2) return "mild";
  return "none";
}

// Session duration in minutes
export function getSessionDuration(): number {
  return (Date.now() - context.sessionStartTime) / 60000;
}

// Accuracy percentage
export function getAccuracy(): number {
  if (context.totalQuestions === 0) return 0;
  return Math.round((context.correctAnswers / context.totalQuestions) * 100);
}

export function resetSession() {
  context = { ...DEFAULT_CONTEXT, sessionStartTime: Date.now() };
  lastEmittedFatigue = "none";
}
