import { skills, type LearnerContext } from "./learning-memory";

export function learnerGuidance(learner?: LearnerContext) {
  if (!learner) return "";
  const support = {
    supported:
      "Use very short N5 questions, one concrete task at a time. Teach new patterns in spoken French and offer a usable construction. Do not assume prior knowledge.",
    guided:
      "Keep N5 Japanese but let the learner try before providing a model. Use French for new patterns and help requests. Reuse known constructions with a small variation.",
    light:
      "The learner has recalled several basic constructions independently on spaced days. Stay within N5. Use Japanese first for known constructions; coaching should be null for those unless help is requested. Introduce one small variation at a time, with French help for genuinely new patterns. Never declare a CEFR or JLPT level.",
  }[learner.support];
  return `Personal learning context, based on local recall evidence: ${support}
Constructions needing practice: ${learner.weak.map((skill) => skills[skill].title).join(", ") || "none recorded"}.
Previously recalled constructions: ${learner.stable.map((skill) => skills[skill].title).join(", ") || "none verified yet"}.
Use this context within the current situation and objective. Do not invent learner facts, dates or past conversations. Pronunciation has not been assessed.`;
}
