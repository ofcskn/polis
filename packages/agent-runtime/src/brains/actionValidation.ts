import type { Action } from '../types.js';

type ActionShape = { kind: unknown; [key: string]: unknown };

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const validators: Record<Action['kind'], (a: ActionShape) => string | undefined> = {
  chat: (a) => (typeof a.text === 'string' ? undefined : '"chat" requires a string "text" field'),
  moveTo: (a) =>
    isFiniteNumber(a.x) && isFiniteNumber(a.y) && isFiniteNumber(a.z)
      ? undefined
      : '"moveTo" requires numeric "x", "y", "z" fields',
  dig: (a) =>
    isFiniteNumber(a.x) && isFiniteNumber(a.y) && isFiniteNumber(a.z)
      ? undefined
      : '"dig" requires numeric "x", "y", "z" fields',
  registerAgent: (a) =>
    a.role === undefined || typeof a.role === 'string'
      ? undefined
      : '"registerAgent" role must be a string when present',
  proposeLaw: (a) =>
    typeof a.description === 'string'
      ? undefined
      : '"proposeLaw" requires a string "description" field',
  vote: (a) =>
    typeof a.proposalId === 'string' && (a.choice === 'yes' || a.choice === 'no')
      ? undefined
      : '"vote" requires a string "proposalId" and choice "yes" | "no"',
  transferCurrency: (a) =>
    typeof a.toAgentId === 'string' && isFiniteNumber(a.amount)
      ? undefined
      : '"transferCurrency" requires a string "toAgentId" and numeric "amount"',
  idle: () => undefined,
};

export interface ActionValidationResult {
  actions: Action[];
  errors: string[];
}

/** Validates one candidate action object. Returns the rejection reason, or undefined if valid. */
export function validateAction(candidate: unknown): string | undefined {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return 'action must be a JSON object';
  }
  const shape = candidate as ActionShape;
  if (typeof shape.kind !== 'string' || !(shape.kind in validators)) {
    return `unknown or missing "kind" (got ${JSON.stringify(shape.kind)})`;
  }
  return validators[shape.kind as Action['kind']](shape);
}

/**
 * Parses an LLM's raw text response into validated Actions. Tolerates the model wrapping its
 * JSON array in prose or a markdown code fence; anything that still doesn't parse as an array of
 * valid actions is reported in `errors` rather than thrown, so a malformed response degrades to
 * an empty action list instead of crashing the tick.
 */
export function parseActionsFromResponse(raw: string): ActionValidationResult {
  const errors: string[] = [];
  const jsonText = extractJsonArray(raw);
  if (jsonText === undefined) {
    return { actions: [], errors: ['response did not contain a JSON array'] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    return { actions: [], errors: [`invalid JSON: ${(error as Error).message}`] };
  }

  if (!Array.isArray(parsed)) {
    return { actions: [], errors: ['parsed JSON was not an array'] };
  }

  const actions: Action[] = [];
  for (const candidate of parsed) {
    const rejection = validateAction(candidate);
    if (rejection) {
      errors.push(`rejected ${JSON.stringify(candidate)}: ${rejection}`);
    } else {
      actions.push(candidate as Action);
    }
  }
  return { actions, errors };
}

function extractJsonArray(raw: string): string | undefined {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return undefined;
  return raw.slice(start, end + 1);
}
