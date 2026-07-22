import { useCallback, useEffect, useState } from "react";

// studio-backend proxies studio-cms (Strapi) so the browser never needs the
// Strapi API token — see studio-backend/src/courses. Configure via
// VITE_API_BASE_URL (see .env.example); falls back to the local dev default.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

/**
 * Fetches course topics from studio-backend's `/courses` endpoint. Replaces
 * the hardcoded `TOPICS` array that used to live in courseData.js — that
 * file now only exports the `buildStepList`/`firstStepIdForTopic` helpers,
 * which still work the same way against whatever topics this hook returns.
 *
 * Returns `{ topics, loading, error, refetch }`. `topics` is `null` until
 * the first request resolves; `error` is a plain string message rather than
 * an Error instance, since it's meant to be rendered directly.
 */
export function useCourseTopics() {
  const [topics, setTopics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/courses`);
        if (!response.ok) {
          throw new Error(`studio-backend responded with ${response.status}`);
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
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((n) => n + 1), []);

  return { topics, loading, error, refetch };
}
