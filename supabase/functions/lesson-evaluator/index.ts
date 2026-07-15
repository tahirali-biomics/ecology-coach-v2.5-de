import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(
  body: unknown,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      );

    const geminiApiKey =
      Deno.env.get("GEMINI_API_KEY");

    const geminiModel =
      Deno.env.get("GEMINI_MODEL") ??
      "gemini-2.5-flash";

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !geminiApiKey
    ) {
      throw new Error(
        "Required server secrets are missing."
      );
    }

    const authorization =
      request.headers.get("Authorization") ?? "";

    const jwt = authorization.replace(
      /^Bearer\s+/i,
      ""
    );

    if (!jwt) {
      return jsonResponse(
        {
          error:
            "Authentication required.",
        },
        401
      );
    }

    const admin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const {
      data: userData,
      error: userError,
    } = await admin.auth.getUser(jwt);

    if (
      userError ||
      !userData.user
    ) {
      return jsonResponse(
        {
          error:
            "Invalid or expired session.",
        },
        401
      );
    }

    const user = userData.user;

    const {
      attemptId,
      questionId,
      response,
    } = await request.json();

    const normalizedResponse =
      String(response ?? "").trim();

    if (!normalizedResponse) {
      return jsonResponse(
        {
          error:
            "A written response is required.",
        },
        400
      );
    }

    const {
      data: attempt,
      error: attemptError,
    } = await admin
      .from("lesson_attempts")
      .select(
        "id,user_id,lesson_id"
      )
      .eq("id", Number(attemptId))
      .eq("user_id", user.id)
      .maybeSingle();

    if (attemptError) {
      throw attemptError;
    }

    if (!attempt) {
      return jsonResponse(
        {
          error:
            "Lesson attempt not found.",
        },
        404
      );
    }

    const {
      data: question,
      error: questionError,
    } = await admin
      .from("lesson_questions")
      .select(
        "id,lesson_id,question_type,prompt,points"
      )
      .eq("id", Number(questionId))
      .eq("lesson_id", attempt.lesson_id)
      .eq(
        "question_type",
        "short_answer"
      )
      .eq("active", true)
      .maybeSingle();

    if (questionError) {
      throw questionError;
    }

    if (!question) {
      return jsonResponse(
        {
          error:
            "Written question not found.",
        },
        404
      );
    }

    const {
      data: lesson,
      error: lessonError,
    } = await admin
      .from("lesson_content")
      .select(
        "title,learning_objective,summary,key_concepts,common_mistakes"
      )
      .eq(
        "lesson_id",
        attempt.lesson_id
      )
      .eq("active", true)
      .maybeSingle();

    if (lessonError) {
      throw lessonError;
    }

    const evaluationPrompt = {
      language: "German",
      domain:
        "University-level ecology",
      task:
        "Evaluate the student's short written response using the lesson objective and expected ecological concepts.",
      lesson,
      question:
        question.prompt,
      studentResponse:
        normalizedResponse,
      scoringScale:
        "Each numerical score must be an integer from 0 to 4.",
      evaluationRules: [
        "Evaluate ecological correctness before stylistic elegance.",
        "Identify substantive misconceptions explicitly.",
        "Do not penalize minor language errors when the ecological meaning is clear.",
        "Set satisfactory to true only when the central ecological reasoning is correct.",
        "Provide concise, constructive feedback in German.",
      ],
    };

    const geminiResponse =
      await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text:
                      JSON.stringify(
                        evaluationPrompt
                      ),
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType:
                "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  conceptualAccuracy: {
                    type: "INTEGER",
                  },
                  completeness: {
                    type: "INTEGER",
                  },
                  scientificLanguage: {
                    type: "INTEGER",
                  },
                  majorMisconceptions: {
                    type: "ARRAY",
                    items: {
                      type: "STRING",
                    },
                  },
                  feedback: {
                    type: "STRING",
                  },
                  satisfactory: {
                    type: "BOOLEAN",
                  },
                },
                required: [
                  "conceptualAccuracy",
                  "completeness",
                  "scientificLanguage",
                  "majorMisconceptions",
                  "feedback",
                  "satisfactory",
                ],
              },
            },
          }),
        }
      );

    if (!geminiResponse.ok) {
      throw new Error(
        `Gemini ${geminiResponse.status}: ${await geminiResponse.text()}`
      );
    }

    const geminiData =
      await geminiResponse.json();

    const rawText =
      geminiData?.candidates?.[0]
        ?.content?.parts
        ?.map(
          (part: { text?: string }) =>
            part.text ?? ""
        )
        .join("") ?? "";

    if (!rawText) {
      throw new Error(
        "Gemini returned no evaluation."
      );
    }

    const evaluation =
      JSON.parse(rawText);

    const pointsAwarded =
      evaluation.satisfactory
        ? Number(question.points)
        : 0;

    const {
      error: responseError,
    } = await admin
      .from("lesson_responses")
      .upsert(
        {
          attempt_id:
            Number(attemptId),
          question_id:
            Number(questionId),
          user_id:
            user.id,
          response: {
            text:
              normalizedResponse,
          },
          correct:
            Boolean(
              evaluation.satisfactory
            ),
          points_awarded:
            pointsAwarded,
          ai_feedback:
            evaluation,
          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict:
            "attempt_id,question_id",
        }
      );

    if (responseError) {
      throw responseError;
    }

    await admin
      .from("lesson_attempts")
      .update({
        written_submitted: true,
        last_activity_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        Number(attemptId)
      )
      .eq("user_id", user.id);

    return jsonResponse({
      evaluation,
    });
  } catch (error) {
    console.error(
      "lesson-evaluator error:",
      error
    );

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      400
    );
  }
});
