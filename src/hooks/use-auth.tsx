import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { bindLunaContextToUser } from "@/lib/luna-context";

interface AuthState {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null,
  session: null,
  isAuthenticated: false,
  isLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      bindLunaContextToUser(session?.user?.id ?? null);
      setState({
        user: session?.user ?? null,
        session,
        isAuthenticated: !!session?.user,
        isLoading: false,
      });
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      bindLunaContextToUser(session?.user?.id ?? null);
      setState({
        user: session?.user ?? null,
        session,
        isAuthenticated: !!session?.user,
        isLoading: false,
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext value={state}>{children}</AuthContext>;
}

export function useAuth() {
  return useContext(AuthContext);
}
