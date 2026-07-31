// ログイン状態の共有コンテキスト
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, type Me } from "./api";

const MeContext = createContext<{
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
}>({ me: null, loading: true, refresh: async () => {} });

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>("/api/me"));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return <MeContext.Provider value={{ me, loading, refresh }}>{children}</MeContext.Provider>;
}

export const useMe = () => useContext(MeContext);
