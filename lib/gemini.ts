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
