import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/hooks/use-theme";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      position="top-center"
      closeButton
      expand
      visibleToasts={4}
      duration={4500}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:!bg-popover group-[.toaster]:!text-popover-foreground group-[.toaster]:!border-border group-[.toaster]:elev-3 group-[.toaster]:font-display",
          title: "group-[.toast]:!text-popover-foreground group-[.toast]:font-semibold",
          description: "group-[.toast]:!text-muted-foreground",
          success: "group-[.toaster]:!border-l-4 group-[.toaster]:!border-l-emerald-400",
          error: "group-[.toaster]:!border-l-4 group-[.toaster]:!border-l-destructive",
          warning: "group-[.toaster]:!border-l-4 group-[.toaster]:!border-l-amber-400",
          info: "group-[.toaster]:!border-l-4 group-[.toaster]:!border-l-neon-cyan",
          icon: "group-[.toast]:!text-current",
          closeButton:
            "group-[.toast]:!bg-popover group-[.toast]:!text-popover-foreground group-[.toast]:!border-border hover:group-[.toast]:!bg-muted",
          actionButton:
            "group-[.toast]:bg-neon-purple group-[.toast]:text-primary-foreground group-[.toast]:font-bold group-[.toast]:tracking-widest group-[.toast]:text-[10px]",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
