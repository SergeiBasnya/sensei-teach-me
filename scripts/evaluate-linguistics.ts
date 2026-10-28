// Real local outputs + narrow observations. This runner never assigns a linguistic grade.
import { randomBytes, createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createApp } from "../server/app";
import { createLocalTutor } from "../server/local-tutor";
import {
  tutorReplySchema,
  turnRequestSchema,
  type TutorReply,
} from "../shared/contracts";
import {
  linguisticCases,
  type LinguisticAutomaticCheck,
} from "./linguistic-cases";
function observations(
  tutor: TutorReply,
  checks: readonly LinguisticAutomaticCheck[],
) {
  return checks.map((check) => {
    if (check.kind === "correction-absent")
      return {
        check,
        status: tutor.correction === null ? "satisfied" : "inspect",
      };
    if (check.kind === "boolean-field")
      return {
        check,
        status: !!tutor[check.field] === check.value ? "satisfied" : "inspect",
        observed: tutor[check.field] ?? false,
      };
    const text =
      check.field === "reply.japanese"
        ? tutor.reply.japanese
        : tutor.correction?.corrected;
    return {
      check,
      status:
        !text && check.onlyWhenPresent
          ? "not-applicable"
          : check.alternatives.some((value) => text?.includes(value))
            ? "satisfied"
            : "inspect",
      observed: text ?? null,
    };
  });
}
async function main() {
  const destination = process.argv[2];
  if (!destination) throw new Error("Output path required");
  const provider = createLocalTutor();
  if (!provider) throw new Error("Local engines unavailable");
  const sourceHash = createHash("sha256")
    .update(
      [
        "server/app.ts",
        "server/conversation_worker.py",
        "server/conversation_feedback.py",
        "server/pedagogic_romaji.py",
        "server/linguistic_support.py",
        "server/conversation_context.py",
      ]
        .map((path) => readFileSync(path))
        .join("\n"),
    )
    .digest("hex");
  const token = randomBytes(32).toString("hex"),
    server = createApp({
      token,
      provider,
      mode: "local",
      isReady: provider.ready,
    }).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Address unavailable");
  const results: unknown[] = [];
  let lastStart = 0;
  try {
    const startup = performance.now();
    while (!provider.ready()) {
      if (performance.now() - startup > 120_000)
        throw new Error("Startup timeout");
      await new Promise((r) => setTimeout(r, 100));
    }
    for (const item of linguisticCases) {
      let history = [...item.body.history];
      const turns = [
        {
          body: item.body,
          automaticChecks: item.automaticChecks,
          manualChecks: item.manualChecks,
          precondition: undefined,
        },
        ...(item.continuations || []),
      ];
      for (let step = 0; step < turns.length; step++) {
        const turn = turns[step]!;
        const input = turnRequestSchema.parse({
          ...turn.body,
          history: step === 0 ? item.body.history : history.slice(-16),
        });
        await new Promise((r) =>
          setTimeout(r, Math.max(0, 2050 - (performance.now() - lastStart))),
        );
        lastStart = performance.now();
        const response = await fetch(
          `http://127.0.0.1:${address.port}/api/turn`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(input),
          },
        );
        const data = await response.json(),
          ms = Math.round(performance.now() - lastStart);
        const parsed = tutorReplySchema.safeParse(data);
        const record = {
          id: item.id,
          kind: item.kind,
          step,
          status: response.status,
          requestMs: ms,
          input,
          output: data,
          automaticObservations: parsed.success
            ? observations(parsed.data, turn.automaticChecks)
            : [],
          manualChecks: turn.manualChecks,
          precondition: turn.precondition,
          humanReview: "pending",
        };
        results.push(record);
        if (parsed.success)
          history = [
            ...input.history,
            { role: "user", content: input.text },
            {
              role: "assistant",
              content: [parsed.data.coaching, parsed.data.reply.japanese]
                .filter(Boolean)
                .join("\n"),
            },
          ];
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(
          destination,
          JSON.stringify(
            {
              date: new Date().toISOString(),
              sourceHash,
              scope:
                "Fictitious text corpus; actual local model; no human language review or phone test",
              humanReview: "pending",
              results,
            },
            null,
            2,
          ) + "\n",
        );
        process.stdout.write(
          `${item.id} step=${step} status=${response.status} ms=${ms}\n`,
        );
      }
    }
  } finally {
    provider.close();
    server.close();
  }
}
void main().catch((error) => {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});
