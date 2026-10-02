export const SECTION_EXTRAS = [
  {
    id: "resources",
    label: "Resources",
    empty: "Reading, references and downloads for this section will appear here.",
  },
  {
    id: "practice",
    label: "Practice",
    empty: "Practice exercises for this section will appear here.",
  },
];

const EXCLUDED_KINDS = new Set(["interactive"]);

export function sectionExtrasFor(step) {
  if (!step || EXCLUDED_KINDS.has(step.kind)) return [];
  return SECTION_EXTRAS;
}
