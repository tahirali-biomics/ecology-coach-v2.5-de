import { supabase } from "./supabase";

export type KeyConcept = {
  term: string;
  definition: string;
};

export type LessonVocabularyTerm = {
  term: string;
  meaning: string;
};

export type LessonContent = {
  id: number;
  lesson_id: string;
  title: string;
  learning_objective: string;
  summary: string;
  key_concepts: KeyConcept[];
  example: string | null;
  common_mistakes: string[];
  vocabulary: LessonVocabularyTerm[];
  version: number;
  active: boolean;
};

export type LessonQuestionType =
  | "multiple_choice"
  | "true_false"
  | "ordering"
  | "short_answer";

export type LessonQuestionOption =
  | string
  | number
  | boolean
  | {
      value: string | boolean | number;
      label: string;
    };

export type LessonQuestion = {
  id: number;
  lesson_id: string;
  question_type: LessonQuestionType;
  prompt: string;
  options: LessonQuestionOption[] | null;
  points: number;
  position: number;
};

export type LessonAttempt = {
  id: number;
  user_id: string;
  course_id: number | null;
  lesson_id: string;
  attempt_number: number;
  started_at: string;
  submitted_at: string | null;
  objective_score: number | null;
  maximum_score: number | null;
  written_submitted: boolean;
  completed: boolean;
  mastered: boolean;
  last_activity_at: string;
};

export type ObjectiveGrade = {
  correct: boolean;
  points_awarded: number;
  explanation: string | null;
  objective_score: number;
  maximum_score: number;
};

export type WrittenEvaluation = {
  conceptualAccuracy: number;
  completeness: number;
  scientificLanguage: number;
  majorMisconceptions: string[];
  feedback: string;
  satisfactory: boolean;
};

// === Normalization functions for objective responses ===

function normalizeTrueFalseValue(
  value: unknown
): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const normalized = value
      .trim()
      .toLowerCase();

    if (
      normalized === "true" ||
      normalized === "richtig" ||
      normalized === "1"
    ) {
      return true;
    }

    if (
      normalized === "false" ||
      normalized === "falsch" ||
      normalized === "0"
    ) {
      return false;
    }
  }

  return undefined;
}

function optionComparableValue(
  option: LessonQuestionOption
): string | number | boolean {
  if (
    typeof option === "string" ||
    typeof option === "number" ||
    typeof option === "boolean"
  ) {
    return option;
  }

  return option.value;
}

function normalizeObjectiveResponse(
  question: LessonQuestion,
  value: unknown
): unknown {
  if (
    question.question_type ===
    "true_false"
  ) {
    return normalizeTrueFalseValue(
      value
    );
  }

  if (
    question.question_type ===
    "multiple_choice"
  ) {
    const options = Array.isArray(
      question.options
    )
      ? question.options
      : [];

    /*
     * Multiple-choice answer keys are stored as zero-based option
     * indexes. The UI stores the selected option value, so convert
     * that value back to its index before calling the grading RPC.
     */
    if (
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value < options.length
    ) {
      return value;
    }

    const selectedText =
      String(value).trim();

    const selectedIndex =
      options.findIndex(
        (option) =>
          String(
            optionComparableValue(
              option
            )
          ).trim() === selectedText
      );

    if (selectedIndex >= 0) {
      return selectedIndex;
    }

    throw new Error(
      "Die ausgewählte Antwort konnte keiner Antwortoption zugeordnet werden."
    );
  }

  return value;
}

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase ist nicht konfiguriert.");
  }

  return supabase;
}

export async function loadLessonContent(
  lessonId: string
): Promise<LessonContent | null> {
  const client = requireSupabase();

  const { data, error } = await client
    .from("lesson_content")
    .select(
      "id,lesson_id,title,learning_objective,summary,key_concepts,example,common_mistakes,vocabulary,version,active"
    )
    .eq("lesson_id", lessonId)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;

  return (data as LessonContent | null) ?? null;
}

export async function loadLessonQuestions(
  lessonId: string
): Promise<LessonQuestion[]> {
  const client = requireSupabase();

  const { data, error } = await client.rpc(
    "get_lesson_questions",
    {
      p_lesson_id: lessonId,
    }
  );

  if (error) throw error;

  return (data ?? []) as LessonQuestion[];
}

export async function startLessonAttempt(
  lessonId: string,
  courseId: number | null
): Promise<LessonAttempt> {
  const client = requireSupabase();

  const { data, error } = await client.rpc(
    "start_lesson_attempt",
    {
      p_lesson_id: lessonId,
      p_course_id: courseId,
    }
  );

  if (error) throw error;
  if (!data) {
    throw new Error(
      "Der Lernversuch konnte nicht gestartet werden."
    );
  }

  return data as LessonAttempt;
}

export async function submitObjectiveResponse(
  attemptId: number,
  question: LessonQuestion,
  response: unknown
): Promise<ObjectiveGrade> {
  const client = requireSupabase();

  /*
   * Normalise the learner response before it reaches PostgreSQL.
   *
   * In particular, the visible German labels "Richtig" and "Falsch"
   * must be stored as JSON booleans true and false. The database RPC
   * remains responsible for comparing the response with the protected
   * answer key and calculating the score.
   */
  const normalizedResponse =
    normalizeObjectiveResponse(
      question,
      response
    );

  if (
    question.question_type ===
      "true_false" &&
    typeof normalizedResponse !==
      "boolean"
  ) {
    throw new Error(
      "Die Wahr/Falsch-Antwort konnte nicht eindeutig verarbeitet werden."
    );
  }

  if (
    question.question_type ===
      "multiple_choice" &&
    (
      typeof normalizedResponse !==
        "number" ||
      !Number.isInteger(
        normalizedResponse
      )
    )
  ) {
    throw new Error(
      "Die Multiple-Choice-Antwort konnte nicht eindeutig verarbeitet werden."
    );
  }

  const { data, error } =
    await client.rpc(
      "submit_objective_response",
      {
        p_attempt_id: attemptId,
        p_question_id: question.id,
        p_response:
          normalizedResponse,
      }
    );

  if (error) throw error;

  const row = Array.isArray(data)
    ? data[0]
    : data;

  if (!row) {
    throw new Error(
      "Die Antwort konnte nicht ausgewertet werden."
    );
  }

  return row as ObjectiveGrade;
}

export async function evaluateWrittenResponse(
  attemptId: number,
  questionId: number,
  response: string
): Promise<WrittenEvaluation> {
  const client = requireSupabase();

  const { data, error } =
    await client.functions.invoke(
      "lesson-evaluator",
      {
        body: {
          attemptId,
          questionId,
          response,
        },
      }
    );

  if (error) throw error;

  if (!data?.evaluation) {
    throw new Error(
      data?.error ??
        "Die schriftliche Antwort konnte nicht ausgewertet werden."
    );
  }

  return data.evaluation as WrittenEvaluation;
}

export async function finalizeLessonAttempt(
  attemptId: number
): Promise<LessonAttempt> {
  const client = requireSupabase();

  const { data, error } = await client.rpc(
    "finalize_lesson_attempt",
    {
      p_attempt_id: attemptId,
    }
  );

  if (error) throw error;

  if (!data) {
    throw new Error(
      "Der Lernversuch konnte nicht abgeschlossen werden."
    );
  }

  // === PART P: Update lesson_progress when completed ===
  if (data.completed) {
    const {
      data: authData,
      error: authError,
    } = await client.auth.getUser();

    if (authError) throw authError;

    if (authData.user) {
      const { error: progressError } =
        await client
          .from("lesson_progress")
          .upsert(
            {
              user_id: authData.user.id,
              lesson_id: data.lesson_id,
              completed: true,
              score: data.maximum_score
                ? Math.round(
                    (data.objective_score /
                      data.maximum_score) *
                      100
                  )
                : null,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "user_id,lesson_id",
            }
          );

      if (progressError) {
        throw progressError;
      }
    }
  }

  return data as LessonAttempt;
}

export async function loadLatestLessonAttempt(
  lessonId: string
): Promise<LessonAttempt | null> {
  const client = requireSupabase();

  const {
    data: authData,
    error: authError,
  } = await client.auth.getUser();

  if (authError) throw authError;
  if (!authData.user) return null;

  const { data, error } = await client
    .from("lesson_attempts")
    .select(
      "id,user_id,course_id,lesson_id,attempt_number,started_at,submitted_at,objective_score,maximum_score,written_submitted,completed,mastered,last_activity_at"
    )
    .eq("user_id", authData.user.id)
    .eq("lesson_id", lessonId)
    .order("attempt_number", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return (data as LessonAttempt | null) ?? null;
}