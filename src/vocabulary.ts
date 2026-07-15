import { supabase } from "./supabase";

export type UserVocabularyEntry = {
  id: number;
  user_id: string;
  term: string;
  meaning: string;
  source_mode: string | null;
  source_turn_id: number | null;
  review_count: number;
  confidence: number;
  next_review_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function loadUserVocabulary(
  limit = 50
): Promise<UserVocabularyEntry[]> {
  if (!supabase) return [];

  const {
    data: authData,
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!authData.user) return [];

  const {
    data,
    error,
  } = await supabase
    .from("user_vocabulary")
    .select(
      "id,user_id,term,meaning,source_mode,source_turn_id,review_count,confidence,next_review_at,created_at,updated_at"
    )
    .eq("user_id", authData.user.id)
    .order("updated_at", {
      ascending: false,
    })
    .limit(limit);

  if (error) throw error;

  return data ?? [];
}

export async function markVocabularyReviewed(
  entry: UserVocabularyEntry
): Promise<UserVocabularyEntry> {
  if (!supabase) {
    throw new Error(
      "Supabase ist nicht konfiguriert."
    );
  }

  const {
    data: authData,
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;

  const user = authData.user;

  if (!user) {
    throw new Error(
      "Bitte melden Sie sich zuerst an."
    );
  }

  const nextReview = new Date();

  const delayDays =
    entry.confidence >= 4
      ? 14
      : entry.confidence === 3
        ? 7
        : entry.confidence === 2
          ? 3
          : 1;

  nextReview.setDate(
    nextReview.getDate() + delayDays
  );

  const {
    data,
    error,
  } = await supabase
    .from("user_vocabulary")
    .update({
      review_count:
        (entry.review_count ?? 0) + 1,
      next_review_at:
        nextReview.toISOString(),
      updated_at:
        new Date().toISOString(),
    })
    .eq("id", entry.id)
    .eq("user_id", user.id)
    .select(
      "id,user_id,term,meaning,source_mode,source_turn_id,review_count,confidence,next_review_at,created_at,updated_at"
    )
    .single();

  if (error) throw error;

  return data;
}


export type VocabularySuggestion = {
  term: string;
  meaning: string;
};

export async function saveVocabularySuggestions(
  suggestions: VocabularySuggestion[],
  sourceMode: string,
  sourceTurnId: number | null = null
): Promise<void> {
  if (!supabase || suggestions.length === 0) return;

  const {
    data: authData,
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!authData.user) return;

  const rows = suggestions
    .filter(
      (entry) =>
        typeof entry.term === "string" &&
        entry.term.trim().length > 0 &&
        typeof entry.meaning === "string" &&
        entry.meaning.trim().length > 0
    )
    .map((entry) => ({
      user_id: authData.user!.id,
      term: entry.term.trim(),
      meaning: entry.meaning.trim(),
      source_mode: sourceMode,
      source_turn_id: sourceTurnId,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("user_vocabulary")
    .upsert(rows, {
      onConflict: "user_id,term",
    });

  if (error) throw error;
}