// Nirnay — /api/classify (PRD §6.4)
// Technician free-text note in, structured failure-mode extraction out.
// This is the tribal-knowledge capture — what makes the app improve, not
// just run.

import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { getGeminiClient, GEMINI_MODEL, stripJsonFences, repairCommaGroupedNumbers } from "@/lib/gemini";
import { FAILURE_MODE_TAXONOMY, ClassificationResult } from "@/lib/types";

export const maxDuration = 30;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    failure_mode: { type: Type.STRING, enum: [...FAILURE_MODE_TAXONOMY] },
    root_cause: { type: Type.STRING },
    prediction_was_correct: { type: Type.BOOLEAN },
    unlogged_symptom: { type: Type.STRING },
  },
  required: ["failure_mode", "root_cause", "prediction_was_correct", "unlogged_symptom"],
};

function fallbackClassification(): ClassificationResult {
  return {
    failure_mode: "other",
    root_cause: "Unable to classify — classifier unavailable.",
    prediction_was_correct: true,
    unlogged_symptom: "",
  };
}

export async function POST(req: NextRequest) {
  let technicianNote: string;
  let assetId: string;
  try {
    const body = await req.json();
    technicianNote = String(body.technician_note ?? "").trim();
    assetId = String(body.asset_id ?? "");
    if (!technicianNote) {
      return NextResponse.json({ error: "technician_note is required" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(fallbackClassification());
  }

  const prompt = `A technician completed a maintenance job on asset ${assetId} and wrote this free-text note:

"${technicianNote}"

Classify it against this fixed 12-item failure-mode taxonomy (choose exactly one): ${FAILURE_MODE_TAXONOMY.join(", ")}.

Also extract:
- root_cause: a short phrase describing the actual root cause, in the technician's own terms where possible.
- prediction_was_correct: true if the note confirms a real fault was found and addressed; false if the technician found the asset healthy (a false positive on the original risk flag) or found no fault.
- unlogged_symptom: any symptom or detail the technician mentions that isn't captured by the failure_mode taxonomy alone (e.g. an unusual noise, a specific part, a timing detail). Empty string if nothing extra is worth logging.

Return only the JSON object matching the schema. Do not invent details not present in the note.`;

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens: 512,
      },
    });

    const text = response.text;
    if (!text) {
      return NextResponse.json(fallbackClassification());
    }

    const parsed = (() => {
      try {
        return JSON.parse(stripJsonFences(text)) as ClassificationResult;
      } catch {
        return JSON.parse(repairCommaGroupedNumbers(stripJsonFences(text))) as ClassificationResult;
      }
    })();
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Gemini classification failed:", err);
    return NextResponse.json(fallbackClassification());
  }
}
