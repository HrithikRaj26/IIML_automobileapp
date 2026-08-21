// Nirnay — Gemini client wrapper (server-side only, PRD §6.3/§6.4/§15)

import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-3.6-flash"; // free-tier eligible; gemini-2.5-flash was retired for new API users

let client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export const GEMINI_MODEL = MODEL;

/**
 * Strips markdown code fences if the model wraps JSON in them despite
 * responseMimeType instructions. Defensive — per PRD §15's own failure table,
 * "Claude wrapped JSON in fences" (renamed here to Gemini) is the #1 cause of
 * an empty allocation screen.
 */
export function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

/**
 * Repairs the one malformed-JSON pattern we've actually seen in practice:
 * a bare numeric value written with thousands-separator commas (e.g.
 * "exposure_protected": 1,40,665.81), which the model can lapse into since
 * the whole UI displays money in that Indian-grouped style. Only touches
 * numbers immediately after a colon (bare JSON values) — a comma-grouped
 * number mentioned inside a quoted string is untouched, since string values
 * start with a quote, not a digit, right after the colon.
 */
export function repairCommaGroupedNumbers(text: string): string {
  return text.replace(/:(\s*)(-?\d[\d,]*\.?\d*)(?=\s*[,}\]])/g, (_match, ws, num) => {
    return `:${ws}${num.replace(/,/g, "")}`;
  });
}
