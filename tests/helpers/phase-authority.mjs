import assert from "node:assert/strict";

export function parseNearTermProgression(operationsMarkdown) {
  const match = /Near-term progression:\s*\n\s*```text\s*\n([\s\S]*?)\n```/u.exec(operationsMarkdown);
  assert.ok(match, "operations plan must publish one near-term progression block");

  const phases = match[1]
    .replace(/\s+/gu, " ")
    .split(/\s*->\s*/u)
    .map((phase) => phase.trim())
    .filter(Boolean);

  assert.ok(phases.length > 1, "near-term progression must contain at least two phases");
  assert.equal(new Set(phases).size, phases.length, "near-term progression must not repeat a phase");
  return phases;
}

export function roadmapPhaseHeadings(roadmapMarkdown) {
  return [...roadmapMarkdown.matchAll(/^## Phase ([0-9][0-9A-Z.]*)\s+—/gmu)].map((match) => ({
    phase: match[1],
    index: match.index
  }));
}

export function assertNearTermProgressionMatchesRoadmap(operationsMarkdown, roadmapMarkdown) {
  const phases = parseNearTermProgression(operationsMarkdown);
  const roadmapHeadings = roadmapPhaseHeadings(roadmapMarkdown);
  const indexes = phases.map((phase) => {
    const matches = roadmapHeadings.filter((heading) => heading.phase === phase);
    assert.equal(matches.length, 1, `roadmap must contain exactly one section for Phase ${phase}`);
    return matches[0].index;
  });

  assert.deepEqual(
    [...indexes].sort((left, right) => left - right),
    indexes,
    "roadmap phase sections must follow the published near-term progression"
  );
  return phases;
}

export function roadmapPhaseSection(roadmapMarkdown, phase) {
  const headings = roadmapPhaseHeadings(roadmapMarkdown);
  const headingIndex = headings.findIndex((heading) => heading.phase === phase);
  assert.notEqual(headingIndex, -1, `missing roadmap section for Phase ${phase}`);
  const start = headings[headingIndex].index;
  const end = headings[headingIndex + 1]?.index ?? roadmapMarkdown.length;
  return roadmapMarkdown.slice(start, end);
}
