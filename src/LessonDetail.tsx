import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CheckCircle2,
  CircleAlert,
  RotateCcw,
  Send,
  Volume2,
} from "lucide-react";

import {
  evaluateWrittenResponse,
  finalizeLessonAttempt,
  loadLatestLessonAttempt,
  loadLessonContent,
  loadLessonQuestions,
  startLessonAttempt,
  submitObjectiveResponse,
  type LessonAttempt,
  type LessonContent,
  type LessonQuestion,
  type ObjectiveGrade,
  type WrittenEvaluation,
} from "./lessonAssessment";

import {
  speakGerman,
  type VoicePreferences,
} from "./voice";

type LessonDetailProps = {
  lessonId: string;
  courseId: number | null;
  voicePreferences: VoicePreferences;
  onBack: () => void;
  onProgressChanged?: () => void;
};

type AnswerState = Record<
  number,
  string | number | boolean
>;

type GradeState = Record<
  number,
  ObjectiveGrade
>;

type NormalizedAnswerOption = {
  label: string;
  value: string | number | boolean;
  key: string;
};

function hasAnswer(
  value: string | number | boolean | null | undefined
): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  return !(
    typeof value === "string" &&
    value.trim() === ""
  );
}

function normalizeAnswerOption(
  option: unknown,
  optionIndex: number
): NormalizedAnswerOption {
  if (
    typeof option === "string" ||
    typeof option === "number" ||
    typeof option === "boolean"
  ) {
    const label =
      typeof option === "boolean"
        ? option
          ? "Richtig"
          : "Falsch"
        : String(option);

    return {
      label,
      value: option,
      key: `${optionIndex}-${String(option)}`,
    };
  }

  if (
    option &&
    typeof option === "object"
  ) {
    const candidate = option as {
      label?: unknown;
      value?: unknown;
    };

    const rawValue =
      candidate.value ??
      candidate.label ??
      optionIndex;

    const value =
      typeof rawValue === "string" ||
      typeof rawValue === "number" ||
      typeof rawValue === "boolean"
        ? rawValue
        : String(rawValue);

    const label =
      candidate.label !== undefined
        ? String(candidate.label)
        : typeof value === "boolean"
          ? value
            ? "Richtig"
            : "Falsch"
          : String(value);

    return {
      label,
      value,
      key: `${optionIndex}-${String(value)}`,
    };
  }

  return {
    label: `Option ${optionIndex + 1}`,
    value: optionIndex,
    key: String(optionIndex),
  };
}

export function LessonDetail({
  lessonId,
  courseId,
  voicePreferences,
  onBack,
  onProgressChanged,
}: LessonDetailProps) {
  const [
    content,
    setContent,
  ] = useState<LessonContent | null>(
    null
  );

  const [
    questions,
    setQuestions,
  ] = useState<LessonQuestion[]>([]);

  const [
    attempt,
    setAttempt,
  ] = useState<LessonAttempt | null>(
    null
  );

  const [
    answers,
    setAnswers,
  ] = useState<AnswerState>({});

  const [
    grades,
    setGrades,
  ] = useState<GradeState>({});

  const [
    writtenEvaluations,
    setWrittenEvaluations,
  ] = useState<
    Record<number, WrittenEvaluation>
  >({});

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      setContent(null);
      setQuestions([]);
      setAttempt(null);
      setAnswers({});
      setGrades({});
      setWrittenEvaluations({});

      try {
        const [
          lessonContent,
          lessonQuestions,
          latestAttempt,
        ] = await Promise.all([
          loadLessonContent(lessonId),
          loadLessonQuestions(lessonId),
          loadLatestLessonAttempt(
            lessonId
          ),
        ]);

        if (!active) return;

        setContent(lessonContent);
        setQuestions(
          lessonQuestions
        );

        if (
          latestAttempt &&
          !latestAttempt.completed
        ) {
          setAttempt(latestAttempt);
        }
      } catch (loadError) {
        if (!active) return;

        setError(
          loadError instanceof Error
            ? loadError.message
            : String(loadError)
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [lessonId]);

  const objectiveQuestions =
    useMemo(
      () =>
        questions.filter(
          (question) =>
            question.question_type !==
            "short_answer"
        ),
      [questions]
    );

  const shortQuestions = useMemo(
    () =>
      questions.filter(
        (question) =>
          question.question_type ===
          "short_answer"
      ),
    [questions]
  );

  async function ensureAttempt() {
    if (attempt) return attempt;

    const created =
      await startLessonAttempt(
        lessonId,
        courseId
      );

    setAttempt(created);

    return created;
  }

  async function submitObjective(
    question: LessonQuestion
  ) {
    const answer =
      answers[question.id];

    if (!hasAnswer(answer)) {
      setError(
        "Bitte wählen Sie zuerst eine Antwort."
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const currentAttempt =
        await ensureAttempt();

      const grade =
        await submitObjectiveResponse(
          currentAttempt.id,
          question,
          answer
        );

      setGrades((current) => ({
        ...current,
        [question.id]: grade,
      }));

      setAttempt((current) =>
        current
          ? {
              ...current,
              objective_score:
                grade.objective_score,
              maximum_score:
                grade.maximum_score,
            }
          : current
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : String(submitError)
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitWritten(
    question: LessonQuestion
  ) {
    const answer = String(
      answers[question.id] ?? ""
    ).trim();

    if (!answer) {
      setError(
        "Bitte schreiben Sie zuerst eine Antwort."
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const currentAttempt =
        await ensureAttempt();

      const evaluation =
        await evaluateWrittenResponse(
          currentAttempt.id,
          question.id,
          answer
        );

      setWrittenEvaluations(
        (current) => ({
          ...current,
          [question.id]:
            evaluation,
        })
      );

      const finalAttempt =
        await finalizeLessonAttempt(
          currentAttempt.id
        );

      setAttempt(finalAttempt);

      onProgressChanged?.();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : String(submitError)
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function finalize() {
    if (!attempt) return;

    setSubmitting(true);
    setError(null);

    try {
      const finalAttempt =
        await finalizeLessonAttempt(
          attempt.id
        );

      setAttempt(finalAttempt);
      onProgressChanged?.();
    } catch (finalizeError) {
      setError(
        finalizeError instanceof Error
          ? finalizeError.message
          : String(finalizeError)
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function startNewAttempt() {
    setSubmitting(true);
    setError(null);

    try {
      const created =
        await startLessonAttempt(
          lessonId,
          courseId
        );

      setAttempt(created);
      setAnswers({});
      setGrades({});
      setWrittenEvaluations({});
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : String(startError)
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section className="panel glass">
        <p>Lektion wird geladen …</p>
      </section>
    );
  }

  if (!content) {
    return (
      <section className="panel glass">
        <h2>Lektion nicht verfügbar</h2>
        <p>
          Für diese Lektion wurde noch
          kein vertiefter Inhalt
          veröffentlicht.
        </p>
        <button onClick={onBack}>
          Zurück zu den Lernpfaden
        </button>
      </section>
    );
  }

  const scorePercentage =
    attempt?.maximum_score
      ? Math.round(
          ((attempt.objective_score ??
            0) /
            attempt.maximum_score) *
            100
        )
      : 0;

  return (
    <article className="lesson-detail">
      <div className="lesson-detail-topbar">
        <button onClick={onBack}>
          ← Lernpfade
        </button>

        {attempt && (
          <span className="lesson-attempt-label">
            Versuch{" "}
            {attempt.attempt_number}
          </span>
        )}
      </div>

      <header className="page-head">
        <small>ECOLOGY COACH</small>
        <h1>{content.title}</h1>
        <p>
          {content.learning_objective}
        </p>
      </header>

      {error && (
        <div
          className="lesson-error"
          role="alert"
        >
          <CircleAlert size={20} />
          <span>{error}</span>
        </div>
      )}

      <section className="panel glass lesson-section">
        <div className="feedback-heading-row">
          <h2>Kurz erklärt</h2>

          <button
            className="compact"
            onClick={() =>
              void speakGerman(
                content.summary,
                voicePreferences
              )
            }
          >
            <Volume2 size={18} />
            Vorlesen
          </button>
        </div>

        <p className="lesson-summary">
          {content.summary}
        </p>
      </section>

      <section className="panel glass lesson-section">
        <h2>Schlüsselkonzepte</h2>

        <div className="concept-grid">
          {content.key_concepts.map(
            (concept) => (
              <div
                className="concept-card"
                key={concept.term}
              >
                <strong>
                  {concept.term}
                </strong>
                <p>
                  {concept.definition}
                </p>
              </div>
            )
          )}
        </div>
      </section>

      {content.example && (
        <section className="panel glass lesson-section">
          <h2>
            Beispiel aus der Ökologie
          </h2>
          <p>{content.example}</p>
        </section>
      )}

      <section className="panel glass lesson-section">
        <h2>Typische Fehler</h2>

        <ul>
          {content.common_mistakes.map(
            (mistake) => (
              <li key={mistake}>
                {mistake}
              </li>
            )
          )}
        </ul>
      </section>

      <section className="panel glass lesson-section">
        <h2>Selbstkontrolle</h2>

        <div className="lesson-questions">
          {objectiveQuestions.map(
            (question, index) => {
              const grade =
                grades[question.id];

              return (
                <div
                  className="lesson-question"
                  key={question.id}
                >
                  <h3>
                    {index + 1}.{" "}
                    {question.prompt}
                  </h3>

                  <div className="answer-options">
                    {question.options?.map(
                      (
                        option,
                        optionIndex
                      ) => {
                        const normalized =
                          normalizeAnswerOption(
                            option,
                            optionIndex
                          );

                        const selected =
                          Object.is(
                            answers[
                              question.id
                            ],
                            normalized.value
                          );

                        return (
                          <label
                            key={
                              normalized.key
                            }
                            className={
                              selected
                                ? "answer-option selected"
                                : "answer-option"
                            }
                          >
                            <input
                              type="radio"
                              name={`question-${question.id}`}
                              checked={
                                selected
                              }
                              onChange={() => {
                                setAnswers(
                                  (
                                    current
                                  ) => ({
                                    ...current,
                                    [question.id]:
                                      normalized.value,
                                  })
                                );

                                setGrades(
                                  (current) => {
                                    const next = {
                                      ...current,
                                    };

                                    delete next[
                                      question.id
                                    ];

                                    return next;
                                  }
                                );

                                setError(
                                  null
                                );
                              }}
                            />

                            <span>
                              {
                                normalized.label
                              }
                            </span>
                          </label>
                        );
                      }
                    )}
                  </div>

                  <button
                    className="primary"
                    disabled={submitting}
                    onClick={() =>
                      void submitObjective(
                        question
                      )
                    }
                  >
                    <Send size={18} />
                    Antwort prüfen
                  </button>

                  {grade && (
                    <div
                      className={
                        grade.correct
                          ? "answer-feedback correct"
                          : "answer-feedback incorrect"
                      }
                    >
                      <strong>
                        {grade.correct
                          ? "Richtig"
                          : "Noch nicht richtig"}
                      </strong>

                      {grade.explanation && (
                        <p>
                          {
                            grade.explanation
                          }
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            }
          )}
        </div>
      </section>

      {shortQuestions.map(
        (question, index) => {
          const evaluation =
            writtenEvaluations[
              question.id
            ];

          return (
            <section
              className="panel glass lesson-section"
              key={question.id}
            >
              <h2>Transferaufgabe</h2>

              <h3>
                {index + 1}.{" "}
                {question.prompt}
              </h3>

              <textarea
                className="lesson-written-answer"
                value={String(
                  answers[question.id] ??
                    ""
                )}
                placeholder="Formulieren Sie Ihre Antwort in zwei bis fünf Sätzen …"
                onChange={(event) =>
                  setAnswers(
                    (current) => ({
                      ...current,
                      [question.id]:
                        event.target.value,
                    })
                  )
                }
              />

              <button
                className="primary"
                disabled={submitting}
                onClick={() =>
                  void submitWritten(
                    question
                  )
                }
              >
                <Send size={18} />
                Antwort auswerten
              </button>

              {evaluation && (
                <div className="written-feedback">
                  <h3>
                    Individuelles Feedback
                  </h3>

                  <p>
                    {evaluation.feedback}
                  </p>

                  {evaluation
                    .majorMisconceptions
                    .length > 0 && (
                    <>
                      <strong>
                        Zu überprüfen:
                      </strong>
                      <ul>
                        {evaluation.majorMisconceptions.map(
                          (
                            misconception
                          ) => (
                            <li
                              key={
                                misconception
                              }
                            >
                              {
                                misconception
                              }
                            </li>
                          )
                        )}
                      </ul>
                    </>
                  )}

                  <div className="scores">
                    <div>
                      <span>
                        Fachliche
                        Richtigkeit
                      </span>
                      <b>
                        {
                          evaluation.conceptualAccuracy
                        }{" "}
                        / 4
                      </b>
                    </div>

                    <div>
                      <span>
                        Vollständigkeit
                      </span>
                      <b>
                        {
                          evaluation.completeness
                        }{" "}
                        / 4
                      </b>
                    </div>

                    <div>
                      <span>
                        Fachsprache
                      </span>
                      <b>
                        {
                          evaluation.scientificLanguage
                        }{" "}
                        / 4
                      </b>
                    </div>
                  </div>
                </div>
              )}
            </section>
          );
        }
      )}

      <section className="panel glass lesson-section">
        <h2>Fachwortschatz</h2>

        <div className="lesson-vocabulary-grid">
          {content.vocabulary.map(
            (entry) => (
              <div
                className="vocab lesson-vocab-card"
                key={entry.term}
              >
                <div>
                  <strong>
                    {entry.term}
                  </strong>
                  <p>
                    {entry.meaning}
                  </p>
                </div>

                <button
                  className="compact"
                  aria-label={`${entry.term} vorlesen`}
                  onClick={() =>
                    void speakGerman(
                      `${entry.term}. ${entry.meaning}`,
                      voicePreferences
                    )
                  }
                >
                  <Volume2
                    size={18}
                  />
                </button>
              </div>
            )
          )}
        </div>
      </section>

      <section className="panel glass lesson-section lesson-completion">
        <h2>Lernstatus</h2>

        {attempt ? (
          <>
            <div className="lesson-score-row">
              <span>
                Objektive Fragen
              </span>
              <strong>
                {attempt.objective_score ??
                  0}{" "}
                /{" "}
                {attempt.maximum_score ??
                  objectiveQuestions.reduce(
                    (
                      sum,
                      question
                    ) =>
                      sum +
                      question.points,
                    0
                  )}
              </strong>
            </div>

            <div className="lesson-score-row">
              <span>
                Ergebnis
              </span>
              <strong>
                {scorePercentage} %
              </strong>
            </div>

            <div className="lesson-status-badges">
              <span
                className={
                  attempt.completed
                    ? "status-badge complete"
                    : "status-badge"
                }
              >
                <CheckCircle2
                  size={17}
                />
                {attempt.completed
                  ? "Abgeschlossen"
                  : "In Bearbeitung"}
              </span>

              {attempt.mastered && (
                <span className="status-badge mastered">
                  Sicher beherrscht
                </span>
              )}
            </div>

            <div className="actions">
              {!attempt.completed && (
                <button
                  className="primary"
                  disabled={submitting}
                  onClick={() =>
                    void finalize()
                  }
                >
                  Abschluss prüfen
                </button>
              )}

              <button
                disabled={submitting}
                onClick={() =>
                  void startNewAttempt()
                }
              >
                <RotateCcw
                  size={18}
                />
                Neuer Versuch
              </button>
            </div>
          </>
        ) : (
          <p>
            Beantworten Sie die erste
            Frage, um einen Lernversuch
            zu beginnen.
          </p>
        )}
      </section>
    </article>
  );
}
