import { createContext, useContext } from "react";

/**
 * Outer (page-level) step navigation that a <TabPager> can hand off to.
 *
 * Without this, a course lab showed TWO Prev/Next rows stacked on top of
 * each other: the lab's own TabPager (tab → tab) and CoursePage's bottom
 * Previous/Next (section → section). They looked the same, so students
 * couldn't tell which one did what.
 *
 * Now there's one pair. A page that has its own step sequence (CoursePage)
 * provides this context; any TabPager inside it:
 *   - walks its tabs as before, then
 *   - on the FIRST tab, Prev becomes "← Prev section" (goes to ctx.prev),
 *   - on the LAST tab,  Next becomes "Next section →" (goes to ctx.next),
 *   - registers itself while mounted, so the page can hide its own
 *     Previous/Next for that step (`register()` returns the unregister fn).
 *
 * Value shape:
 *   { prev: {label}|null, next: {label}|null,
 *     goPrev(), goNext(), register(): () => void }
 *
 * Outside a provider (tour hotspot labs, dev pages) TabPager behaves
 * exactly as it always did.
 */
export const StepNavContext = createContext(null);

export const useStepNav = () => useContext(StepNavContext);
