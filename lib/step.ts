/**
 * An error written for the person who built or ran the workflow.
 * Workflow Builder shows the message as is, so it must say what to fix.
 */
export class StepError extends Error {}

export async function runStep<O>(
  body: () => Promise<O>,
): Promise<{ outputs: O } | { error: string }> {
  try {
    return { outputs: await body() };
  } catch (e) {
    if (e instanceof StepError) return { error: e.message };
    console.error(e);
    const message = e instanceof Error ? e.message : String(e);
    return {
      error:
        `Unexpected error: ${message}. Run \`slack activity\` for details.`,
    };
  }
}

/** Workflow Builder can pass "" or spaces for an input left empty; both mean unset. */
export function trimmed(input: string | undefined): string | undefined {
  return input?.trim() || undefined;
}
