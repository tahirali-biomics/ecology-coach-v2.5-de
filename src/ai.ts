/*
 * Ecology Coach
 * Copyright © 2026 Dr. Tahir Ali
 * All rights reserved. See LICENSE.
 */

import { supabase, supabaseConfigured } from "./supabase";

export type AiMode = "conversation" | "simulation" | "daily_lesson" | "report";
export type AiRequest = { mode: AiMode; message: string; context?: Record<string, unknown>; history?: { role: "user" | "assistant"; content: string }[] };
export type AiFeedback = {
  reply: string;
  corrections?: string[];
  vocabulary?: { term: string; meaning: string }[];
  scores?: Record<string, number>;
  nextQuestion?: string;
  citations?: { title: string; sourceName?: string; chunkId?: number; similarity?: number }[];
  lesson?: Record<string, unknown>;
  usage?: { used: number; limit: number; remaining: number };
};
const demo: Record<AiMode,string> = {
  conversation: "Sehr gut. Präzisieren Sie nun den ökologischen Mechanismus und nennen Sie ein konkretes Beispiel.",
  simulation: "Die Antwort ist plausibel. Trennen Sie Randomisierung klar von Replikation und erläutern Sie den Zweck der Blockbildung.",
  daily_lesson: "Tageslektion: Erklären Sie in drei Sätzen, warum Effektgröße und Unsicherheit gemeinsam berichtet werden sollten.",
  report: "Der Absatz ist verständlich. Trennen Sie Beobachtung, statistische Evidenz und biologische Interpretation.",
};
export async function askAi(payload: AiRequest): Promise<AiFeedback> {
  if (!supabaseConfigured || !supabase) return { reply: demo[payload.mode], corrections:["Demo-Modus: Supabase ist nicht konfiguriert."], scores:{sprache:82,fachlichkeit:84,natuerlichkeit:78,lehrklarheit:80} };
  const { data, error } = await supabase.functions.invoke("ai-tutor", { body: payload });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data as AiFeedback;
}
