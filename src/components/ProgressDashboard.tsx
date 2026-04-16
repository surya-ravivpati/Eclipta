import { motion } from "framer-motion";
import { useState } from "react";
import {
  BookOpen, Target, TrendingUp, Users, Award, Clock, ChevronRight,
  Zap, Lock, CheckCircle, Star, BarChart3, Brain, Route as RouteIcon,
  Coffee, Flame, GitBranch, Layers
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

/* ── Mock Data ─────────────────────────────────────────────── */

const enrolledCourses = [
  { id: 1, title: "Linear Algebra Foundations", progress: 78, totalLessons: 24, completed: 19, category: "Mathematics", streak: 5, nextMilestone: "Chapter Quiz" },
  { id: 2, title: "FAANG Interview Prep", progress: 42, totalLessons: 60, completed: 25, category: "Computer Science", streak: 12, nextMilestone: "Mock Interview #3" },
  { id: 3, title: "Organic Chemistry", progress: 15, totalLessons: 32, completed: 5, category: "Science", streak: 2, nextMilestone: "Lab Simulation" },
  { id: 4, title: "Data Structures & Algorithms", progress: 91, totalLessons: 40, completed: 36, category: "Computer Science", streak: 8, nextMilestone: "Final Assessment" },
];

const learningPaths = [
  {
    id: 1, title: "Full-Stack Developer", type: "intensive" as const, duration: "6 months", courses: 8, completed: 3,
    description: "A structured path from fundamentals to deployment, covering frontend, backend, databases, and DevOps.",
    prerequisites: ["Basic Programming", "HTML/CSS Basics"],
    milestones: [
      { label: "Web Fundamentals", done: true },
      { label: "JavaScript Deep Dive", done: true },
      { label: "React Mastery", done: true },
      { label: "Backend & APIs", done: false, current: true },
      { label: "Databases", done: false },
      { label: "DevOps & Deploy", done: false },
    ],
  },
  {
    id: 2, title: "Quick Stats Refresher", type: "casual" as const, duration: "2 weeks", courses: 3, completed: 1,
    description: "A short path to brush up on probability, distributions, and hypothesis testing.",
    prerequisites: ["Algebra"],
    milestones: [
      { label: "Probability Basics", done: true },
      { label: "Distributions", done: false, current: true },
      { label: "Hypothesis Testing", done: false },
    ],
  },
  {
    id: 3, title: "Machine Learning Engineer", type: "intensive" as const, duration: "9 months", courses: 12, completed: 0,
    description: "From linear algebra through neural networks to production ML systems.",
    prerequisites: ["Linear Algebra", "Python", "Statistics"],
    milestones: [
      { label: "Math Foundations", done: false, current: true },
      { label: "Classical ML", done: false },
      { label: "Deep Learning", done: false },
      { label: "NLP & Vision", done: false },
      { label: "MLOps", done: false },
    ],
  },
];

const recommendations = [
  { title: "Discrete Mathematics", reason: "Complements your Data Structures course", match: 94 },
  { title: "System Design", reason: "Next step after FAANG Interview Prep", match: 89 },
  { title: "Probability & Statistics", reason: "Prerequisite for Machine Learning path", match: 85 },
  { title: "Graph Theory", reason: "You excelled at tree-based problems", match: 78 },
];

const collaborationGroups = [
  { name: "FAANG Study Group", members: 12, active: true, topic: "Interview Prep" },
  { name: "Linear Algebra Gang", members: 5, active: true, topic: "Mathematics" },
  { name: "Organic Chem Lab Partners", members: 3, active: false, topic: "Science" },
];

const trophyMilestones = [
  { label: "First Course Enrolled", earned: true, xp: 100 },
  { label: "7-Day Streak", earned: true, xp: 500 },
  { label: "First Perfect Score", earned: true, xp: 750 },
  { label: "30-Day Streak", earned: false, xp: 2000, progress: 40 },
  { label: "Complete a Learning Path", earned: false, xp: 5000, progress: 60 },
  { label: "Win 50 Battles", earned: false, xp: 3000, progress: 24 },
  { label: "Mentor 10 Users", earned: false, xp: 4000, progress: 0 },
];

/* ── Sub-components ────────────────────────────────────────── */

function CourseProgressCard({ course }: { course: typeof enrolledCourses[0] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
    >
      <Card className="bg-card/60 border-border hover:border-neon-purple/30 transition-colors group">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="font-bold font-display text-sm">{course.title}</h4>
              <Badge variant="secondary" className="mt-1 text-[10px]">{course.category}</Badge>
            </div>
            <div className="flex items-center gap-1 text-neon-pink">
              <Flame className="w-3.5 h-3.5" />
              <span className="text-xs font-mono font-bold">{course.streak}d</span>
            </div>
          </div>
          <Progress value={course.progress} className="h-2 mb-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{course.completed}/{course.totalLessons} lessons</span>
            <span className="text-neon-purple font-mono font-bold">{course.progress}%</span>
          </div>
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Next: {course.nextMilestone}</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-neon-purple transition-colors" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function PathCard({ path }: { path: typeof learningPaths[0] }) {
  const completionPct = Math.round((path.completed / path.courses) * 100);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
    >
      <Card className="bg-card/60 border-border hover:border-neon-cyan/30 transition-colors">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-display">{path.title}</CardTitle>
            <Badge variant={path.type === "intensive" ? "default" : "secondary"} className="text-[10px] uppercase tracking-wider">
              {path.type}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{path.description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{path.duration}</span>
            <span className="flex items-center gap-1"><Layers className="w-3 h-3" />{path.courses} courses</span>
          </div>

          {/* Prerequisites */}
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Prerequisites</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {path.prerequisites.map(p => (
                <Badge key={p} variant="outline" className="text-[10px] border-neon-cyan/30 text-neon-cyan">{p}</Badge>
              ))}
            </div>
          </div>

          {/* Mini Trophy Road */}
          <div className="flex items-center gap-1">
            {path.milestones.map((m, i) => (
              <div key={m.label} className="flex items-center gap-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${
                    m.done
                      ? "bg-neon-purple text-primary-foreground"
                      : m.current
                      ? "bg-neon-pink text-foreground ring-2 ring-neon-pink/30"
                      : "bg-secondary text-muted-foreground"
                  }`}
                  title={m.label}
                >
                  {m.done ? "✓" : i + 1}
                </div>
                {i < path.milestones.length - 1 && (
                  <div className={`w-4 h-0.5 ${m.done ? "bg-neon-purple" : "bg-border"}`} />
                )}
              </div>
            ))}
          </div>

          <Progress value={completionPct} className="h-1.5" />
          <div className="text-[11px] text-muted-foreground text-right font-mono">{completionPct}% complete</div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ── Main Component ────────────────────────────────────────── */

export function ProgressDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <section className="pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          className="mb-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-5xl font-bold font-display mb-4">
            Your <span className="text-neon-purple text-glow-purple">Progress</span>
          </h1>
          <p className="text-muted-foreground max-w-2xl leading-relaxed">
            Track everything in one place. Your courses, paths, milestones, and collaborations — 
            all adapting as you grow.
          </p>
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {[
            { icon: BookOpen, label: "Enrolled", value: "4 Courses", color: "text-neon-purple" },
            { icon: Flame, label: "Best Streak", value: "12 Days", color: "text-neon-pink" },
            { icon: Target, label: "Accuracy", value: "87%", color: "text-neon-cyan" },
            { icon: Award, label: "Trophies", value: "3 / 7", color: "text-neon-purple" },
          ].map(stat => (
            <Card key={stat.label} className="bg-card/60 border-border">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`${stat.color} bg-secondary p-2 rounded-lg`}>
                  <stat.icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                  <p className="font-bold font-display text-sm">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-secondary/60 mb-8">
            <TabsTrigger value="overview">Courses</TabsTrigger>
            <TabsTrigger value="paths">Learning Paths</TabsTrigger>
            <TabsTrigger value="trophies">Trophy Road</TabsTrigger>
            <TabsTrigger value="recommendations">For You</TabsTrigger>
            <TabsTrigger value="collaborate">Collaborate</TabsTrigger>
          </TabsList>

          {/* ── Courses ────────────────────────── */}
          <TabsContent value="overview">
            <div className="grid md:grid-cols-2 gap-4">
              {enrolledCourses.map(c => <CourseProgressCard key={c.id} course={c} />)}
            </div>
          </TabsContent>

          {/* ── Learning Paths ─────────────────── */}
          <TabsContent value="paths">
            <div className="mb-6">
              <p className="text-sm text-muted-foreground mb-4">
                Follow structured intensive programs or pick casual refreshers — mix and match freely.
              </p>
              <div className="flex gap-2 mb-6">
                <Badge variant="outline" className="border-neon-purple/40 text-neon-purple">All</Badge>
                <Badge variant="outline" className="border-border text-muted-foreground">Intensive</Badge>
                <Badge variant="outline" className="border-border text-muted-foreground">Casual</Badge>
              </div>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {learningPaths.map(p => <PathCard key={p.id} path={p} />)}
              {/* Add path CTA */}
              <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
                <Card className="bg-card/30 border-dashed border-border hover:border-neon-purple/40 transition-colors h-full flex items-center justify-center min-h-[280px] cursor-pointer group">
                  <CardContent className="text-center p-6">
                    <GitBranch className="w-8 h-8 text-muted-foreground mx-auto mb-3 group-hover:text-neon-purple transition-colors" />
                    <p className="font-display font-bold text-sm mb-1">Build Custom Path</p>
                    <p className="text-xs text-muted-foreground">Mix courses from any topic into your own learning journey</p>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </TabsContent>

          {/* ── Trophy Road ────────────────────── */}
          <TabsContent value="trophies">
            <div className="max-w-2xl">
              <p className="text-sm text-muted-foreground mb-6">
                Unlock milestones as you learn. Each trophy marks real achievement — not just participation.
              </p>
              <div className="space-y-1">
                {trophyMilestones.map((m, i) => (
                  <motion.div
                    key={m.label}
                    className="flex items-center gap-4 relative"
                    initial={{ opacity: 0, x: -12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.05 }}
                  >
                    {i < trophyMilestones.length - 1 && (
                      <div className={`absolute left-5 top-10 w-0.5 h-10 ${m.earned ? "bg-neon-purple" : "bg-border"}`} />
                    )}
                    <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      m.earned
                        ? "bg-neon-purple neon-glow-purple"
                        : "bg-secondary border border-border"
                    }`}>
                      {m.earned ? <CheckCircle className="w-5 h-5 text-primary-foreground" /> : <Lock className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 py-4">
                      <div className="flex items-center justify-between">
                        <span className={`font-bold font-display text-sm ${m.earned ? "text-foreground" : "text-muted-foreground"}`}>{m.label}</span>
                        <span className={`text-xs font-mono ${m.earned ? "text-neon-purple" : "text-muted-foreground"}`}>{m.xp} XP</span>
                      </div>
                      {!m.earned && m.progress !== undefined && m.progress > 0 && (
                        <Progress value={m.progress} className="h-1 mt-2" />
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ── Recommendations ────────────────── */}
          <TabsContent value="recommendations">
            <p className="text-sm text-muted-foreground mb-6">
              Based on your goals, activity, and performance — Luna recommends these next steps.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {recommendations.map((r, i) => (
                <motion.div
                  key={r.title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="bg-card/60 border-border hover:border-neon-purple/30 transition-colors group cursor-pointer">
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className="bg-secondary p-2.5 rounded-xl">
                        <Brain className="w-5 h-5 text-neon-cyan" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold font-display text-sm">{r.title}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">{r.reason}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-neon-purple font-mono font-bold text-sm">{r.match}%</span>
                        <p className="text-[10px] text-muted-foreground">match</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </TabsContent>

          {/* ── Collaborate ────────────────────── */}
          <TabsContent value="collaborate">
            <p className="text-sm text-muted-foreground mb-6">
              Learn together. Join study groups, share courses, and mentor other learners.
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {collaborationGroups.map((g, i) => (
                <motion.div
                  key={g.name}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="bg-card/60 border-border hover:border-neon-pink/30 transition-colors">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-bold font-display text-sm">{g.name}</h4>
                        <div className={`w-2 h-2 rounded-full ${g.active ? "bg-neon-cyan" : "bg-muted-foreground"}`} />
                      </div>
                      <Badge variant="secondary" className="text-[10px] mb-3">{g.topic}</Badge>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{g.members} members</span>
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] text-neon-purple hover:text-neon-pink">
                          Open <ChevronRight className="w-3 h-3 ml-0.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
              {/* Create group CTA */}
              <Card className="bg-card/30 border-dashed border-border hover:border-neon-pink/40 transition-colors cursor-pointer group flex items-center justify-center min-h-[160px]">
                <CardContent className="text-center p-6">
                  <Users className="w-6 h-6 text-muted-foreground mx-auto mb-2 group-hover:text-neon-pink transition-colors" />
                  <p className="font-display font-bold text-sm">Create Study Group</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
