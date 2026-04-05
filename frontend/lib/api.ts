/**
 * =============================================================================
 * API SERVICE LAYER (FINAL PRODUCTION VERSION)
 * =============================================================================
 * 
 * This file connects Frontend (Next.js) ↔ Backend (FastAPI)
 * 
 * FLOW:
 * User → Form → API (this file) → Backend → AI Algorithms → Response → UI
 * 
 * Algorithms used in backend:
 * - BFS → symptom relation
 * - A* → therapy prioritization
 * - CSP → scheduling plan
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * IMPORTANT:
 * - Uses deployed backend URL
 * - Fallback ensures app still works locally if needed
 */
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://autismind-ai-y8ol.onrender.com"; // ✅ YOUR LIVE BACKEND

// =============================================================================
// TYPES
// =============================================================================

export interface ScreeningPayload {
  eye_contact: number;
  name_response: number;
  vocalization: number;
  gestures: number;
  repetitive_behavior: number;
}

/**
 * IMPORTANT:
 * Backend returns MODULES like:
 * social_attention, communication etc.
 * NOT eye_contact etc.
 */
export interface ScreeningResult {
  session_id: string;
  risk_score: number;
  risk_band: "low" | "moderate" | "high";

  module_scores: {
    social_attention: number;
    communication: number;
    motor_expression: number;
    behavioral_regulation: number;
  };

  explanation: string;
  therapy_plan: string[];

  // Optional (backend doesn't send it)
  created_at?: string;
}

export interface SessionSummary {
  session_id: string;
  risk_score: number;
  risk_band: "low" | "moderate" | "high";
  created_at?: string;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Submit screening to backend
 */
export async function submitScreening(
  payload: ScreeningPayload
): Promise<ScreeningResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("❌ submitScreening ERROR:", error);
    throw new Error("Backend not reachable. Please try again.");
  }
}

/**
 * Fetch result using session ID
 */
export async function getResults(
  sessionId: string
): Promise<ScreeningResult> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/results/${sessionId}`
    );

    if (!response.ok) {
      throw new Error("Session not found");
    }

    return await response.json();
  } catch (error) {
    console.error("❌ getResults ERROR:", error);
    throw new Error("Failed to fetch results");
  }
}

/**
 * NOTE:
 * You DON'T have /api/sessions in backend
 * So keep this OPTIONAL or remove if unused
 */
export async function getSessionHistory(): Promise<SessionSummary[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/sessions`);

    if (!response.ok) {
      throw new Error("No session history API available");
    }

    return await response.json();
  } catch (error) {
    console.warn("⚠️ Session history not implemented");
    return [];
  }
}

// =============================================================================
// MAPPING FUNCTIONS
// =============================================================================

export function mapNameResponse(value: string): number {
  return {
    always: 100,
    usually: 80,
    sometimes: 50,
    rarely: 30,
    never: 10,
  }[value] ?? 50;
}

export function mapVocalization(value: string): number {
  return {
    advanced: 100,
    developing: 75,
    limited: 40,
    echolalia: 30,
    nonverbal: 20,
  }[value] ?? 50;
}

/**
 * IMPORTANT:
 * Higher = more concern (inverted scale)
 */
export function mapRepetitiveBehavior(value: string): number {
  return {
    none: 10,
    occasional: 30,
    frequent: 60,
    intense: 80,
    distress: 100,
  }[value] ?? 50;
}

// =============================================================================
// PAYLOAD PREPARATION
// =============================================================================

/**
 * Converts UI input → Backend numeric format
 */
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
    repetitive_behavior: mapRepetitiveBehavior(
      responses.repetitive_behavior
    ),
  };
}