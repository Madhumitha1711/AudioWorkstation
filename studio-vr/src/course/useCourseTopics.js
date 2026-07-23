import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";

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
 * `/courses` now requires sign-in (studio-backend guards every route by
 * default — see JwtAuthGuard/AuthModule), so this reads the token from the
 * session slice and sends it as a Bearer header. CoursePage sits behind
 * RequireAuth so a missing token here should only ever be momentary (right
 * around log-off); this hook just declines to fetch rather than erroring in
 * that case.
 *
 * Returns `{ topics, loading, error, refetch }`. `topics` is `null` until
 * the first request resolves; `error` is a plain string message rather than
 * an Error instance, since it's meant to be rendered directly.
 */
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
