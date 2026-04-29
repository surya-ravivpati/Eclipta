import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, GripVertical, Trash2, Type, Youtube, Image as ImageIcon, ListChecks, Loader2, Eye, Globe, EyeOff, Save, AlertTriangle, Check } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/courses/$courseId/edit")({
  head: () => ({
    meta: [
      { title: "Course Editor – Eclipta" },
      { name: "description", content: "Build out your course modules — lessons, videos, images, and quizzes." },
    ],
  }),
  component: CourseEditor,
});

type Course = {
  id: string; user_id: string; slug: string; title: string; summary: string | null;
  level: string; status: string; cover_image_url: string | null;
};
type Module = { id: string; course_id: string; title: string; position: number };
type Block = { id: string; module_id: string; type: "text" | "youtube" | "image" | "quiz"; data: any; position: number };

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function CourseEditor() {
  const { courseId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [blocks, setBlocks] = useState<Record<string, Block[]>>({});
  const [loading, setLoading] = useState(true);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) return;
    const { data: c, error: cErr } = await supabase
      .from("user_courses")
      .select("id,user_id,slug,title,summary,level,status,cover_image_url")
      .eq("id", courseId)
      .maybeSingle();
    if (cErr || !c) {
      toast.error("Couldn't load course");
      navigate({ to: "/profile" });
      return;
    }
    if (c.user_id !== user.id) {
      toast.error("Not your course");
      navigate({ to: "/profile" });
      return;
    }
    setCourse(c as Course);

    const { data: m } = await supabase
      .from("course_modules")
      .select("id,course_id,title,position")
      .eq("course_id", courseId)
      .order("position");
    const mods = (m as Module[]) || [];
    setModules(mods);
    if (mods.length && !activeModuleId) setActiveModuleId(mods[0].id);

    if (mods.length) {
      const { data: b } = await supabase
        .from("course_blocks")
        .select("id,module_id,type,data,position")
        .in("module_id", mods.map(x => x.id))
        .order("position");
      const grouped: Record<string, Block[]> = {};
      (b as Block[] || []).forEach(blk => {
        (grouped[blk.module_id] ||= []).push(blk);
      });
      setBlocks(grouped);
    }
    setLoading(false);
  }, [courseId, user, navigate, activeModuleId]);

  useEffect(() => { reload(); }, [reload]);

  if (!user || loading || !course) {
    return (
      <div className="min-h-screen bg-background"><Navbar />
        <div className="pt-32 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-neon-purple" /></div>
      </div>
    );
  }

  const updateCourseField = async (patch: Partial<Course>) => {
    setCourse({ ...course, ...patch });
    const { error } = await supabase.from("user_courses").update(patch).eq("id", courseId);
    if (error) toast.error(error.message);
  };

  const togglePublish = async () => {
    if (course.status !== "published") {
      // Validate before publish
      const totalBlocks = Object.values(blocks).flat().length;
      if (totalBlocks === 0) {
        toast.error("Add at least one content block before publishing.");
        return;
      }
    }
    const next = course.status === "published" ? "draft" : "published";
    await updateCourseField({ status: next });
    toast.success(next === "published" ? "Course published — visible to everyone" : "Course unpublished");
  };

  const addModule = async () => {
    const position = modules.length;
    const { data, error } = await supabase
      .from("course_modules")
      .insert({ course_id: courseId, title: "New module", position })
      .select("id,course_id,title,position")
      .single();
    if (error) return toast.error(error.message);
    const newMod = data as Module;
    setModules([...modules, newMod]);
    setActiveModuleId(newMod.id);
  };

  const renameModule = async (id: string, title: string) => {
    setModules(prev => prev.map(m => m.id === id ? { ...m, title } : m));
    await supabase.from("course_modules").update({ title }).eq("id", id);
  };

  const deleteModule = async (id: string) => {
    if (!confirm("Delete this module and all its content?")) return;
    await supabase.from("course_modules").delete().eq("id", id);
    setModules(prev => prev.filter(m => m.id !== id));
    if (activeModuleId === id) setActiveModuleId(modules.find(m => m.id !== id)?.id || null);
    toast.success("Module deleted");
  };

  const addBlock = async (type: Block["type"]) => {
    if (!activeModuleId) return;
    const moduleBlocks = blocks[activeModuleId] || [];
    const position = moduleBlocks.length;
    const defaultData =
      type === "text" ? { text: "" } :
      type === "youtube" ? { url: "", caption: "" } :
      type === "image" ? { url: "", caption: "" } :
      { question: "", options: ["", "", "", ""], correctIndex: 0 };
    const { data, error } = await supabase
      .from("course_blocks")
      .insert({ module_id: activeModuleId, type, data: defaultData, position })
      .select("id,module_id,type,data,position")
      .single();
    if (error) return toast.error(error.message);
    setBlocks(prev => ({
      ...prev,
      [activeModuleId]: [...(prev[activeModuleId] || []), data as Block],
    }));
  };

  const updateBlock = async (id: string, data: any) => {
    setBlocks(prev => {
      const copy = { ...prev };
      for (const mid of Object.keys(copy)) {
        copy[mid] = copy[mid].map(b => b.id === id ? { ...b, data } : b);
      }
      return copy;
    });
    await supabase.from("course_blocks").update({ data }).eq("id", id);
  };

  const deleteBlock = async (id: string, moduleId: string) => {
    await supabase.from("course_blocks").delete().eq("id", id);
    setBlocks(prev => ({ ...prev, [moduleId]: prev[moduleId].filter(b => b.id !== id) }));
  };

  const activeBlocks = activeModuleId ? blocks[activeModuleId] || [] : [];

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <div className="pt-24 pb-16 px-6">
        <div className="max-w-6xl mx-auto">
          <Link to="/profile" className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-muted-foreground hover:text-neon-purple mb-6">
            <ArrowLeft className="w-3 h-3" /> MY COURSES
          </Link>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="glass-panel p-6 mb-6 flex flex-col md:flex-row md:items-center gap-4 justify-between"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 border ${
                  course.status === "published"
                    ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                    : "border-amber-500/40 text-amber-400 bg-amber-500/10"
                }`}>
                  {course.status.toUpperCase()}
                </span>
                <span className="text-[10px] font-bold tracking-widest text-muted-foreground border border-border px-2 py-0.5">
                  {course.level.toUpperCase()}
                </span>
              </div>
              <input
                value={course.title}
                onChange={e => setCourse({ ...course, title: e.target.value })}
                onBlur={e => updateCourseField({ title: e.target.value })}
                className="w-full bg-transparent text-2xl md:text-3xl font-display font-bold tracking-tight focus:outline-none focus:bg-secondary/30 px-1 -mx-1"
              />
              <textarea
                value={course.summary || ""}
                onChange={e => setCourse({ ...course, summary: e.target.value })}
                onBlur={e => updateCourseField({ summary: e.target.value })}
                placeholder="Short summary that learners see on the course card…"
                rows={2}
                className="w-full mt-2 bg-transparent text-sm text-muted-foreground focus:outline-none focus:bg-secondary/30 px-1 -mx-1 resize-none"
              />
            </div>
            <div className="flex gap-2 shrink-0">
              {course.status === "published" && (
                <Link
                  to="/courses/$slug" params={{ slug: course.slug }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold tracking-widest border border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/10 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" /> VIEW
                </Link>
              )}
              <button
                onClick={togglePublish}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold tracking-widest transition-colors ${
                  course.status === "published"
                    ? "border border-border text-muted-foreground hover:border-foreground"
                    : "bg-neon-purple text-primary-foreground hover:opacity-90 neon-glow-purple"
                }`}
              >
                {course.status === "published" ? <><EyeOff className="w-3.5 h-3.5" /> UNPUBLISH</> : <><Globe className="w-3.5 h-3.5" /> PUBLISH</>}
              </button>
            </div>
          </motion.div>

          <div className="grid md:grid-cols-[260px_1fr] gap-6">
            {/* Module sidebar */}
            <div className="glass-panel p-4 h-fit md:sticky md:top-24">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-bold text-xs tracking-widest text-muted-foreground">MODULES</h3>
                <button onClick={addModule} className="text-neon-purple hover:text-neon-pink transition-colors" title="Add module">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-1">
                {modules.map((m, i) => (
                  <button
                    key={m.id}
                    onClick={() => setActiveModuleId(m.id)}
                    className={`w-full text-left px-2 py-2 text-xs flex items-start gap-2 transition-colors ${
                      activeModuleId === m.id
                        ? "bg-neon-purple/15 text-neon-purple border-l-2 border-neon-purple"
                        : "text-muted-foreground hover:bg-secondary/40 border-l-2 border-transparent"
                    }`}
                  >
                    <span className="font-mono text-[10px] mt-0.5">{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex-1 line-clamp-2 font-medium">{m.title}</span>
                  </button>
                ))}
              </div>
              {modules.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No modules yet. Click + to add one.</p>
              )}
            </div>

            {/* Module editor */}
            <div className="space-y-4">
              {activeModuleId && (() => {
                const mod = modules.find(m => m.id === activeModuleId);
                if (!mod) return null;
                return (
                  <>
                    <div className="glass-panel p-5">
                      <label className="block text-[10px] font-bold tracking-widest text-muted-foreground mb-2">MODULE TITLE</label>
                      <div className="flex gap-2">
                        <input
                          value={mod.title}
                          onChange={e => setModules(prev => prev.map(x => x.id === mod.id ? { ...x, title: e.target.value } : x))}
                          onBlur={e => renameModule(mod.id, e.target.value)}
                          className="flex-1 bg-secondary/30 border border-input px-3 py-2 text-sm font-display font-bold focus:outline-none focus:ring-1 focus:ring-neon-purple"
                        />
                        <button
                          onClick={() => deleteModule(mod.id)}
                          className="px-3 py-2 border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete module"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Block list */}
                    <div className="space-y-3">
                      {activeBlocks.map((b) => (
                        <BlockEditor key={b.id} block={b} onChange={(data) => updateBlock(b.id, data)} onDelete={() => deleteBlock(b.id, mod.id)} userId={user.id} />
                      ))}
                      {activeBlocks.length === 0 && (
                        <div className="glass-panel p-8 text-center text-sm text-muted-foreground">
                          No content yet. Add a block below.
                        </div>
                      )}
                    </div>

                    {/* Add block toolbar */}
                    <div className="glass-panel p-4">
                      <p className="text-[10px] font-bold tracking-widest text-muted-foreground mb-3">ADD CONTENT BLOCK</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <BlockButton icon={<Type className="w-4 h-4" />} label="TEXT" onClick={() => addBlock("text")} />
                        <BlockButton icon={<Youtube className="w-4 h-4" />} label="VIDEO" onClick={() => addBlock("youtube")} />
                        <BlockButton icon={<ImageIcon className="w-4 h-4" />} label="IMAGE" onClick={() => addBlock("image")} />
                        <BlockButton icon={<ListChecks className="w-4 h-4" />} label="QUIZ" onClick={() => addBlock("quiz")} />
                      </div>
                    </div>
                  </>
                );
              })()}
              {!activeModuleId && modules.length === 0 && (
                <div className="glass-panel p-10 text-center">
                  <h3 className="font-display font-bold text-lg mb-2">Start with your first module</h3>
                  <p className="text-sm text-muted-foreground mb-4">A module is one chapter or section of your course.</p>
                  <button onClick={addModule} className="px-4 py-2 bg-neon-purple text-primary-foreground text-xs font-bold tracking-widest hover:opacity-90 transition-opacity inline-flex items-center gap-2">
                    <Plus className="w-3.5 h-3.5" /> ADD MODULE
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-2 py-3 border border-border hover:border-neon-purple/60 hover:text-neon-purple text-muted-foreground transition-colors text-xs font-bold tracking-widest"
    >
      {icon}{label}
    </button>
  );
}

function BlockEditor({ block, onChange, onDelete, userId }: {
  block: Block; onChange: (data: any) => void; onDelete: () => void; userId: string;
}) {
  return (
    <div className="glass-panel p-4 group relative">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground inline-flex items-center gap-1.5">
          <GripVertical className="w-3 h-3" />
          {block.type === "text" && "TEXT"}
          {block.type === "youtube" && "YOUTUBE VIDEO"}
          {block.type === "image" && "IMAGE"}
          {block.type === "quiz" && "QUIZ"}
        </span>
        <button onClick={onDelete} className="opacity-40 group-hover:opacity-100 text-destructive hover:bg-destructive/10 p-1 transition-all" title="Delete block">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {block.type === "text" && <TextBlockEditor data={block.data} onChange={onChange} />}
      {block.type === "youtube" && <YouTubeBlockEditor data={block.data} onChange={onChange} />}
      {block.type === "image" && <ImageBlockEditor data={block.data} onChange={onChange} userId={userId} />}
      {block.type === "quiz" && <QuizBlockEditor data={block.data} onChange={onChange} />}
    </div>
  );
}

function TextBlockEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  const [text, setText] = useState(data.text || "");
  return (
    <textarea
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={() => text !== data.text && onChange({ ...data, text })}
      placeholder="Write your lesson… Markdown-friendly. Use **bold**, _italic_, and line breaks for emphasis."
      rows={6}
      className="w-full bg-secondary/30 border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neon-purple resize-y"
    />
  );
}

function YouTubeBlockEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  const [url, setUrl] = useState(data.url || "");
  const [caption, setCaption] = useState(data.caption || "");
  const id = extractYouTubeId(url);
  return (
    <div className="space-y-2">
      <input
        value={url}
        onChange={e => setUrl(e.target.value)}
        onBlur={() => url !== data.url && onChange({ ...data, url })}
        placeholder="Paste YouTube URL or video ID…"
        className="w-full bg-secondary/30 border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neon-purple"
      />
      {id ? (
        <div className="aspect-video bg-black/40 border border-border">
          <iframe
            src={`https://www.youtube.com/embed/${id}`}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Video preview"
          />
        </div>
      ) : url ? (
        <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" /> Couldn't detect a YouTube video ID.</p>
      ) : null}
      <input
        value={caption}
        onChange={e => setCaption(e.target.value)}
        onBlur={() => caption !== data.caption && onChange({ ...data, caption })}
        placeholder="Optional caption…"
        className="w-full bg-secondary/20 border border-input px-3 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-neon-purple"
      />
    </div>
  );
}

function ImageBlockEditor({ data, onChange, userId }: { data: any; onChange: (d: any) => void; userId: string }) {
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState(data.caption || "");

  const upload = async (file: File) => {
    if (file.size > 4 * 1024 * 1024) return toast.error("Max 4 MB");
    if (!file.type.startsWith("image/")) return toast.error("Image files only");
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("course-images").upload(path, file, {
      cacheControl: "3600", upsert: false, contentType: file.type,
    });
    setUploading(false);
    if (error) return toast.error(error.message);
    const { data: pub } = supabase.storage.from("course-images").getPublicUrl(path);
    onChange({ ...data, url: pub.publicUrl });
    toast.success("Image uploaded");
  };

  return (
    <div className="space-y-2">
      {data.url ? (
        <div className="relative">
          <img src={data.url} alt={caption || "Course image"} className="w-full max-h-96 object-contain bg-black/20 border border-border" />
          <button
            onClick={() => onChange({ ...data, url: "" })}
            className="absolute top-2 right-2 px-2 py-1 text-[10px] font-bold tracking-widest bg-background/80 border border-border hover:border-destructive hover:text-destructive transition-colors"
          >
            REPLACE
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed border-border hover:border-neon-purple/60 cursor-pointer transition-colors">
          {uploading ? <Loader2 className="w-5 h-5 animate-spin text-neon-purple" /> : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
          <span className="text-xs font-bold tracking-widest text-muted-foreground">{uploading ? "UPLOADING…" : "CLICK TO UPLOAD IMAGE"}</span>
          <span className="text-[10px] text-muted-foreground">PNG, JPG, WEBP up to 4 MB</span>
          <input
            type="file" accept="image/*" className="sr-only"
            onChange={e => e.target.files?.[0] && upload(e.target.files[0])}
            disabled={uploading}
          />
        </label>
      )}
      <input
        value={caption}
        onChange={e => setCaption(e.target.value)}
        onBlur={() => caption !== data.caption && onChange({ ...data, caption })}
        placeholder="Optional caption…"
        className="w-full bg-secondary/20 border border-input px-3 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-neon-purple"
      />
    </div>
  );
}

function QuizBlockEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  const [question, setQuestion] = useState(data.question || "");
  const [options, setOptions] = useState<string[]>(data.options || ["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState<number>(typeof data.correctIndex === "number" ? data.correctIndex : 0);

  const commit = (next: Partial<{ question: string; options: string[]; correctIndex: number }>) => {
    const merged = {
      question: next.question ?? question,
      options: next.options ?? options,
      correctIndex: next.correctIndex ?? correctIndex,
    };
    onChange({ ...data, ...merged });
  };

  return (
    <div className="space-y-3">
      <input
        value={question}
        onChange={e => setQuestion(e.target.value)}
        onBlur={() => question !== data.question && commit({ question })}
        placeholder="Question…"
        className="w-full bg-secondary/30 border border-input px-3 py-2 text-sm font-display font-bold focus:outline-none focus:ring-1 focus:ring-neon-purple"
      />
      <div className="space-y-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              onClick={() => { setCorrectIndex(i); commit({ correctIndex: i }); }}
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                correctIndex === i ? "border-neon-cyan bg-neon-cyan/20" : "border-border hover:border-neon-cyan/40"
              }`}
              title={correctIndex === i ? "Correct answer" : "Mark as correct"}
            >
              {correctIndex === i && <Check className="w-3 h-3 text-neon-cyan" />}
            </button>
            <input
              value={opt}
              onChange={e => {
                const next = [...options]; next[i] = e.target.value; setOptions(next);
              }}
              onBlur={() => commit({ options })}
              placeholder={`Option ${i + 1}`}
              className="flex-1 bg-secondary/30 border border-input px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-neon-purple"
            />
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground tracking-widest">CLICK A CIRCLE TO MARK THE CORRECT ANSWER</p>
    </div>
  );
}