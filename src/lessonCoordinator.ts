import { supabase } from "./supabase";

export type CourseLessonSummary = {
  user_id: string;
  display_name: string;
  lessons_started: number;
  lessons_completed: number;
  lessons_mastered: number;
  objective_questions_answered: number;
  objective_questions_correct: number;
  total_attempts: number;
  last_activity: string | null;
};

export async function loadCourseLessonSummary(
  courseId: number
): Promise<CourseLessonSummary[]> {
  if (!supabase) return [];

  const { data, error } =
    await supabase.rpc(
      "get_course_lesson_summary",
      {
        p_course_id: courseId,
      }
    );

  if (error) throw error;

  return (data ??
    []) as CourseLessonSummary[];
}