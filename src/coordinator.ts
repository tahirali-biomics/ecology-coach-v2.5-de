/*
 * Ecology Coach
 * Copyright © 2026 Dr. Tahir Ali
 * All rights reserved. See LICENSE.
 */

import { supabase } from "./supabase";
// === PART Q: Import lesson coordinator types ===
import { loadCourseLessonSummary, type CourseLessonSummary } from "./lessonCoordinator";

export type Course={id:number;name:string;description:string|null;coordinator_id:string;active:boolean;created_at:string};
export type MemberSummary={userId:string;email:string;displayName:string;completed:number;turns:number;vocabulary:number;lastActivity:string|null};

export async function loadMyCourses():Promise<Course[]>{if(!supabase)return[];const{data,error}=await supabase.from("courses").select("id,name,description,coordinator_id,active,created_at").order("created_at",{ascending:false});if(error)throw error;return data??[];}

export async function createCourse(name:string,description:string){if(!supabase)throw new Error("Supabase not configured");const{data:{user}}=await supabase.auth.getUser();if(!user)throw new Error("Sign in required");const{data,error}=await supabase.from("courses").insert({name,description,coordinator_id:user.id}).select("*").single();if(error)throw error;await supabase.from("course_members").upsert({course_id:data.id,user_id:user.id,role:"coordinator"});await supabase.from("semesters").insert({course_id:data.id,name:new Date().getFullYear()+"",status:"active"});return data as Course;}

export async function createInvitation(courseId:number,email:string){if(!supabase)throw new Error("Supabase not configured");const{data:{user}}=await supabase.auth.getUser();if(!user)throw new Error("Sign in required");const{data,error}=await supabase.from("course_invitations").insert({course_id:courseId,email,created_by:user.id}).select("token,email,expires_at").single();if(error)throw error;return data as {token:string;email:string;expires_at:string};}

export async function acceptInvitation(token:string){if(!supabase)throw new Error("Supabase not configured");const{data,error}=await supabase.rpc("accept_course_invitation",{p_token:token});if(error)throw error;return Number(data);}

export async function loadCourseSummary(
  courseId: number
): Promise<MemberSummary[]> {
  if (!supabase) return [];

  /*
   * Load memberships without an embedded profiles join.
   * This avoids PostgREST relationship-resolution errors.
   */
  const {
    data: members,
    error: membersError,
  } = await supabase
    .from("course_members")
    .select("user_id,role")
    .eq("course_id", courseId)
    .eq("role", "student");

  if (membersError) {
    console.error(
      "Failed to load course members:",
      membersError
    );
    throw new Error(
      `Studierende konnten nicht geladen werden: ${membersError.message}`
    );
  }

  const studentIds = [
    ...new Set(
      (members ?? []).map(
        (member) => member.user_id
      )
    ),
  ];

  if (studentIds.length === 0) {
    return [];
  }

  /*
   * Load profiles and learning data independently.
   * Each request is checked explicitly for errors.
   */
  const [
    profilesResult,
    progressResult,
    turnsResult,
    vocabularyResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id,display_name,current_level"
      )
      .in("id", studentIds),

    supabase
      .from("lesson_progress")
      .select(
        "user_id,completed,updated_at"
      )
      .in("user_id", studentIds),

    supabase
      .from("conversation_turns")
      .select(
        "user_id,created_at"
      )
      .in("user_id", studentIds),

    supabase
      .from("user_vocabulary")
      .select(
        "user_id,updated_at"
      )
      .in("user_id", studentIds),
  ]);

  if (profilesResult.error) {
    throw new Error(
      `Profile konnten nicht geladen werden: ${profilesResult.error.message}`
    );
  }

  if (progressResult.error) {
    throw new Error(
      `Lernfortschritt konnte nicht geladen werden: ${progressResult.error.message}`
    );
  }

  if (turnsResult.error) {
    throw new Error(
      `KI-Aktivität konnte nicht geladen werden: ${turnsResult.error.message}`
    );
  }

  if (vocabularyResult.error) {
    throw new Error(
      `Fachwortschatz konnte nicht geladen werden: ${vocabularyResult.error.message}`
    );
  }

  const profiles =
    profilesResult.data ?? [];
  const progress =
    progressResult.data ?? [];
  const turns =
    turnsResult.data ?? [];
  const vocabulary =
    vocabularyResult.data ?? [];

  return studentIds.map((userId) => {
    const profile = profiles.find(
      (row) => row.id === userId
    );

    const studentProgress = progress.filter(
      (row) => row.user_id === userId
    );

    const studentTurns = turns.filter(
      (row) => row.user_id === userId
    );

    const studentVocabulary =
      vocabulary.filter(
        (row) => row.user_id === userId
      );

    const activityDates = [
      ...studentProgress.map(
        (row) => row.updated_at
      ),
      ...studentTurns.map(
        (row) => row.created_at
      ),
      ...studentVocabulary.map(
        (row) => row.updated_at
      ),
    ]
      .filter(
        (value): value is string =>
          typeof value === "string"
      )
      .sort();

    return {
      userId,
      email: "",
      displayName:
        profile?.display_name ??
        userId.slice(0, 8),
      completed: studentProgress.filter(
        (row) => row.completed
      ).length,
      turns: studentTurns.length,
      vocabulary:
        studentVocabulary.length,
      lastActivity:
        activityDates.at(-1) ?? null,
    };
  });
}

export async function archiveSemester(courseId:number,name:string,deleteLearningData=false){if(!supabase)throw new Error("Supabase not configured");const{error}=await supabase.rpc("archive_and_reset_course",{p_course_id:courseId,p_new_semester_name:name,p_delete_learning_data:deleteLearningData});if(error)throw error;}

export async function loadMyRole():Promise<string>{if(!supabase)return "student";const{data:{user}}=await supabase.auth.getUser();if(!user)return "student";const{data,error}=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();if(error)throw error;return data?.role??"student";}

// === PART Q: Re-export lesson coordinator functions for convenience ===
export { loadCourseLessonSummary, type CourseLessonSummary };