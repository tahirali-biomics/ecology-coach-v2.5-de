/*
 * Ecology Coach
 * Copyright © 2026 Dr. Tahir Ali
 * All rights reserved. See LICENSE.
 */

import { supabase } from "./supabase";

export async function loadActiveCourseId(): Promise<number | null> {
  if (!supabase) return null;

  const {
    data: authData,
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!authData.user) return null;

  const { data, error } = await supabase
    .from("course_members")
    .select(
      "course_id,courses!inner(active)"
    )
    .eq("user_id", authData.user.id)
    .eq("role", "student")
    .eq("courses.active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data?.course_id ?? null;
}