import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export function useCourseTopics() {
  const token = useSelector((state) => state.session.token);
  const [topics, setTopics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!token) {
        setTopics(null);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/courses`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Your session has expired — please sign in again."
              : `studio-backend responded with ${response.status}`,
          );
        }
        const data = await response.json();
        if (!cancelled) setTopics(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load course content.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken, token]);

  const refetch = useCallback(() => setReloadToken((n) => n + 1), []);

  return { topics, loading, error, refetch };
}
