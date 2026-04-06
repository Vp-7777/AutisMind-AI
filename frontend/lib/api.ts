/**
 * Centralized API layer for Next.js -> FastAPI integration.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type RiskBand = "low" | "moderate" | "high";

export interface ScreeningPayload {
  eye_contact: number;
  name_response: number;
  vocalization: number;
  gestures: number;
  repetitive_behavior: number;
}

export interface BackendModuleScores {
  social_attention: number;
  communication: number;
  motor_expression: number;
  behavioral_regulation: number;
}

export interface ScreeningResult {
  session_id: string;
  risk_score: number;
  risk_band: RiskBand;
  module_scores: BackendModuleScores;
  explanation: string;
  therapy_plan: string[];
  created_at: string;
}

export interface SessionSummary {
  session_id: string;
  risk_score: number;
  risk_band: RiskBand;
  created_at: string;
}

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { detail?: string; message?: string };
      message = body.detail || body.message || message;
    } catch {
      // Keep fallback message when response body is not JSON.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function submitScreening(
  payload: ScreeningPayload,
  signal?: AbortSignal
): Promise<ScreeningResult> {
  return fetchJson<ScreeningResult>(
    "/api/analyze",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    signal
  );
}

export async function getResults(
  sessionId: string,
  signal?: AbortSignal
): Promise<ScreeningResult> {
  return fetchJson<ScreeningResult>(
    `/api/results/${encodeURIComponent(sessionId)}`,
    { method: "GET" },
    signal
  );
}

export async function getSessionHistory(
  signal?: AbortSignal
): Promise<SessionSummary[]> {
  return fetchJson<SessionSummary[]>("/api/history", { method: "GET" }, signal);
}

export function mapNameResponse(value: string): number {
  return { always: 100, usually: 80, sometimes: 50, rarely: 30, never: 10 }[value] ?? 50;
}

export function mapVocalization(value: string): number {
  return { advanced: 100, developing: 75, limited: 40, echolalia: 30, nonverbal: 20 }[value] ?? 50;
}

export function mapRepetitiveBehavior(value: string): number {
  return { none: 10, occasional: 30, frequent: 60, intense: 80, distress: 100 }[value] ?? 50;
}

export function prepareScreeningPayload(responses: {
  eye_contact: number;
  response_to_name: string;
  vocalization: string;
  gestures: number;
  repetitive_behavior: string;
}): ScreeningPayload {
  return {
    eye_contact: responses.eye_contact,
    name_response: mapNameResponse(responses.response_to_name),
    vocalization: mapVocalization(responses.vocalization),
    gestures: responses.gestures,
    repetitive_behavior: mapRepetitiveBehavior(responses.repetitive_behavior),
  };
}