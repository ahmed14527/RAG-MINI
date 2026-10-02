"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { ApiClient, ApiError } from "@/lib/api";
import type { Health, User } from "@/lib/types";

import AuthScreen from "./AuthScreen";
import Workspace from "./Workspace";

export type HealthState = { status: "checking" } | { status: "ok"; health: Health } | { status: "down"; error: ApiError };

const subscribeNoop = () => () => {};

export default function App({ apiUrl }: { apiUrl: string }) {
  const [api] = useState(() => new ApiClient(apiUrl));
  // The session lives in localStorage, so it is only known on the client.
  const isClient = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const [user, setUser] = useState<User | null>(() => api.user);
  const [health, setHealth] = useState<HealthState>({ status: "checking" });

  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(
    () =>
      api.subscribe((nextUser, expired) => {
        setUser(nextUser);
        setSessionExpired(expired);
      }),
    [api],
  );

  const checkHealth = useCallback(async () => {
    setHealth({ status: "checking" });
    try {
      setHealth({ status: "ok", health: await api.health() });
    } catch (error) {
      setHealth({ status: "down", error: error as ApiError });
    }
  }, [api]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- probe backend on load
    checkHealth();
  }, [checkHealth]);

  if (!isClient) return <div className="h-full bg-bg" />;
  if (!user) return <AuthScreen api={api} health={health} sessionExpired={sessionExpired} onRetryHealth={checkHealth} />;
  return <Workspace api={api} user={user} health={health} onRetryHealth={checkHealth} />;
}
