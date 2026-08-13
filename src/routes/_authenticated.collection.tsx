import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Lock, Check, Zap, Sparkles, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ECLIPTARS,
  getEcliptarsByArchetype,
  ecliptarSpriteUrl,
  type Ecliptar,
} from "@/lib/ecliptars";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ARCHETYPES } from "@/components/battles/archetypes";
import {
  getUnlockedArchetypes,
  ROAD_NODES,
  type MonsterArchetypeKey,
} from "@/lib/trophy-road-data";
import { usePlayerXp, useOwnedEcliptars } from "@/hooks/use-player-xp";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/collection")({
  head: () => ({
    meta: [
      { title: "Collection - Eclipta" },
      {
        name: "description",
        content: "Your Ecliptar collection - every creature you've claimed across the Trophy Road.",
      },
    ],
  }),
  component: CollectionPage,
});

const ARCH_ORDER = Object.keys(ARCHETYPES) as MonsterArchetypeKey[];

/** XP at which an archetype's first Ecliptars unlock (its monster node). */
function unlockXp(arch: MonsterArchetypeKey): number | null {
  const node = ROAD_NODES.find((n) => n.archetype === arch);
  return node ? node.xp : null;
}

function EcliptarCell({
  e,
  owned,
  archUnlocked,
  equipped,
  onOpen,
}: {
  e: Ecliptar;
  owned: boolean;
  archUnlocked: boolean;
  equipped: boolean;
  onOpen: (e: Ecliptar) => void;
}) {
  const Icon = e.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(e)}
      className={cn(
        "relative rounded-xl border p-4 flex flex-col items-center text-center transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        owned ? "border-primary/40 bg-primary/[0.06]" : "border-white/10 bg-white/[0.02]",
      )}
    >
      {equipped && (
        <span className="absolute top-2 right-2 text-[8px] font-bold tracking-widest text-primary border border-primary/40 rounded-full px-1.5 py-0.5">
          EQUIPPED
        </span>
      )}
      <Icon
        size={34}
        className={cn("mb-2", owned ? "text-primary" : "text-muted-foreground/30")}
        style={
          owned ? { filter: "drop-shadow(0 0 12px oklch(0.78 0.13 88 / 0.45))" } : { opacity: 0.45 }
        }
      />
      <div
        className={cn(
          "font-display text-sm font-semibold leading-tight",
          owned ? "text-foreground" : "text-muted-foreground/60",
        )}
      >
        {e.name}
      </div>
      <div className="mt-2 w-full">
        {owned ? (
          equipped ? (
            <div className="text-[10px] font-bold tracking-widest text-primary inline-flex items-center gap-1 justify-center w-full">
              <Check className="w-3 h-3" /> ACTIVE
            </div>
          ) : (
            <div className="text-[10px] font-bold tracking-widest text-muted-foreground/70 w-full">
              VIEW
            </div>
          )
        ) : archUnlocked ? (
          <div className="text-[10px] font-bold tracking-widest text-muted-foreground inline-flex items-center gap-1 justify-center w-full">
            <Sparkles className="w-3 h-3" /> UNCLAIMED
          </div>
        ) : (
          <div className="text-[10px] font-bold tracking-widest text-muted-foreground/50 inline-flex items-center gap-1 justify-center w-full">
            <Lock className="w-3 h-3" /> LOCKED
          </div>
        )}
      </div>
    </button>
  );
}

function EcliptarDetail({
  e,
  owned,
  archUnlocked,
  equipped,
  onEquip,
  onClose,
}: {
  e: Ecliptar | null;
  owned: boolean;
  archUnlocked: boolean;
  equipped: boolean;
  onEquip: (e: Ecliptar) => void;
  onClose: () => void;
}) {
  const [spriteFailed, setSpriteFailed] = useState(false);
  useEffect(() => setSpriteFailed(false), [e?.slug]);
  if (!e) return null;
  const Icon = e.icon;
  const arch = ARCHETYPES[e.archetype];

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="max-w-3xl p-0 overflow-hidden border-white/10"
        style={{ background: "var(--brand-bg, #0B1020)" }}
      >
        <div className="grid sm:grid-cols-2">
          <div className="p-7 flex flex-col justify-center order-2 sm:order-1">
            <p className="font-mono text-[10px] tracking-[0.32em] uppercase text-primary mb-2">
              {arch.name}
            </p>
            <DialogTitle className="font-display text-3xl font-bold leading-none">
              {e.name}
            </DialogTitle>
            <p className="text-muted-foreground text-sm mt-4 min-h-[4.5rem] leading-relaxed">
              {e.description ?? ""}
            </p>
            <div className="mt-6">
              {owned ? (
                equipped ? (
                  <div className="text-[11px] font-bold tracking-widest text-primary inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" /> EQUIPPED
                  </div>
                ) : (
                  <button
                    onClick={() => onEquip(e)}
                    className="text-[11px] font-bold tracking-widest text-primary/80 hover:text-primary border border-primary/30 hover:border-primary/60 rounded-full px-5 py-2 transition-colors"
                  >
                    EQUIP
                  </button>
                )
              ) : archUnlocked ? (
                <Link
                  to="/progress"
                  className="text-[11px] font-bold tracking-widest text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" /> CLAIM ON TROPHY ROAD
                </Link>
              ) : (
                <div className="text-[11px] font-bold tracking-widest text-muted-foreground/50 inline-flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" /> LOCKED
                </div>
              )}
            </div>
          </div>

          <div className="relative order-1 sm:order-2 min-h-[220px] sm:min-h-[340px] flex items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.10),transparent_70%)]">
            {spriteFailed ? (
              <Icon size={96} className={cn(owned ? "text-primary" : "text-muted-foreground/30")} />
            ) : (
              <img
                src={ecliptarSpriteUrl(e.slug)}
                alt={e.name}
                onError={() => setSpriteFailed(true)}
                className={cn(
                  "h-full w-full object-contain p-6 drop-shadow-[0_10px_22px_rgba(0,0,0,0.65)]",
                  !owned && "grayscale opacity-40",
                )}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ArchStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-widest text-muted-foreground/70 uppercase">
        {label}
      </div>
      <div className="font-display text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}

function CollectionPage() {
  const { xp } = usePlayerXp();
  const { slugs: owned } = useOwnedEcliptars();
  const unlocked = new Set(getUnlockedArchetypes(xp));
  const [equipped, setEquipped] = useState<string | null>(null);
  const [selected, setSelected] = useState<Ecliptar | null>(null);
  const [expandedArch, setExpandedArch] = useState<MonsterArchetypeKey | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_profiles")
        .select("equipped_ecliptar")
        .eq("user_id", user.id)
        .maybeSingle();
      setEquipped((data as { equipped_ecliptar?: string } | null)?.equipped_ecliptar ?? null);
    })();
  }, []);

  const equip = async (e: Ecliptar) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("user_profiles")
      .update({ equipped_ecliptar: e.slug })
      .eq("user_id", user.id);
    if (error) {
      toast.error("Couldn't equip that Ecliptar");
      return;
    }
    setEquipped(e.slug);
    toast.success(`${e.name} equipped`, {
      description: "It'll represent you in your next battle.",
    });
  };

  const total = ECLIPTARS.length;
  const ownedCount = ECLIPTARS.filter((e) => owned.has(e.slug)).length;
  const pct = total ? Math.round((ownedCount / total) * 100) : 0;

  return (
    <div
      className="min-h-screen pt-24 pb-16 px-5"
      style={{ background: "var(--brand-bg, #0B1020)", color: "var(--brand-ink, #F4F1EA)" }}
    >
      <div className="max-w-4xl mx-auto">
        <header className="mb-7">
          <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-primary mb-2">
            Collection
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold leading-none">
            Your <em className="not-italic text-primary">Ecliptars</em>
          </h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-prose">
            Every creature you've claimed across the Trophy Road. Equip one to represent you in
            battle, and chase the rest.
          </p>

          {/* Completion meter */}
          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-mono tracking-widest uppercase text-muted-foreground">
                Collected
              </span>
              <span className="font-display font-bold tabular-nums">
                {ownedCount} / {total}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-white/8 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-neon-cyan to-primary"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        </header>

        <div className="space-y-8">
          {ARCH_ORDER.map((arch) => {
            const meta = ARCHETYPES[arch];
            const eclips = getEcliptarsByArchetype(arch);
            const archUnlocked = unlocked.has(arch);
            const archOwned = eclips.filter((e) => owned.has(e.slug)).length;
            const need = unlockXp(arch);
            const ArchIcon = meta.icon;
            const isExpanded = expandedArch === arch;
            return (
              <section key={arch}>
                <button
                  type="button"
                  onClick={() => setExpandedArch(isExpanded ? null : arch)}
                  aria-expanded={isExpanded}
                  className="w-full flex items-center justify-between gap-3 mb-3 text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ArchIcon
                      className={cn(
                        "w-5 h-5 shrink-0",
                        archUnlocked ? meta.color : "text-muted-foreground/40",
                      )}
                    />
                    <div className="min-w-0">
                      <h2 className="font-display text-lg font-bold leading-tight">{meta.name}</h2>
                      <p className="text-[11px] text-muted-foreground truncate">{meta.passive}</p>
                    </div>
                    {!archUnlocked && need != null && (
                      <span className="font-mono text-[10px] tracking-widest text-muted-foreground/70 inline-flex items-center gap-1 shrink-0">
                        <Lock className="w-3 h-3" /> Unlock at {need.toLocaleString()} XP
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-[10px] tracking-widest text-muted-foreground tabular-nums">
                      {archOwned}/{eclips.length}
                    </span>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-muted-foreground transition-transform",
                        isExpanded && "rotate-180",
                      )}
                    />
                  </div>
                </button>

                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 overflow-hidden"
                  >
                    <p className="text-sm text-muted-foreground mb-3">{meta.description}</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      <ArchStat label="HP" value={meta.maxHp} />
                      <ArchStat label="DMG" value={meta.baseDamage} />
                      <ArchStat label="DEF" value={`${Math.round(meta.defense * 100)}%`} />
                      <ArchStat label="CRIT" value={`+${Math.round(meta.critBonus * 100)}%`} />
                      <ArchStat label="HEAL" value={meta.healAmount ?? "-"} />
                      <ArchStat label="TIME" value={`${meta.timeSeconds}s`} />
                      <ArchStat label="DIFF" value={`${meta.diffMin}-${meta.diffMax}`} />
                    </div>
                  </motion.div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {eclips.map((e) => (
                    <EcliptarCell
                      key={e.slug}
                      e={e}
                      owned={owned.has(e.slug)}
                      archUnlocked={archUnlocked}
                      equipped={equipped === e.slug}
                      onOpen={setSelected}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/progress"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-[oklch(0.68_0.12_70)] px-5 py-2.5 text-sm font-bold text-[color:var(--brand-bg)] hover:opacity-90 transition-opacity"
          >
            <Zap className="w-4 h-4" /> Claim more on the Trophy Road
          </Link>
        </div>
      </div>

      <EcliptarDetail
        e={selected}
        owned={!!selected && owned.has(selected.slug)}
        archUnlocked={!!selected && unlocked.has(selected.archetype)}
        equipped={!!selected && equipped === selected.slug}
        onEquip={equip}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
