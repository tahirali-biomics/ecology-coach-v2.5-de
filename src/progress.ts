import { supabase } from "./supabase";
export type LessonProgress = { user_id: string; lesson_id: string; completed: boolean; score: number|null; updated_at: string };
export async function loadLessonProgress(): Promise<LessonProgress[]> {
  if (!supabase) return [];
  const { data:{user}, error:authError } = await supabase.auth.getUser();
  if (authError) throw authError; if (!user) return [];
  const { data,error } = await supabase.from("lesson_progress").select("user_id,lesson_id,completed,score,updated_at").eq("user_id",user.id).order("updated_at",{ascending:false});
  if(error) throw error; return (data??[]) as LessonProgress[];
}
export async function saveLessonProgress(lessonId:string, completed:boolean, score:number|null=null){
  if(!supabase) return; const {data:{user},error:authError}=await supabase.auth.getUser(); if(authError) throw authError; if(!user){localStorage.setItem(`lesson:${lessonId}`,JSON.stringify({completed,score}));return;}
  const {error}=await supabase.from("lesson_progress").upsert({user_id:user.id,lesson_id:lessonId,completed,score,updated_at:new Date().toISOString()},{onConflict:"user_id,lesson_id"}); if(error) throw error;
}
export async function migrateLocalProgress(){
  if(!supabase) return; const {data:{user}}=await supabase.auth.getUser(); if(!user)return;
  const entries=Object.keys(localStorage).filter(k=>k.startsWith("lesson:"));
  for(const key of entries){const lessonId=key.slice(7); try{const v=JSON.parse(localStorage.getItem(key)??"{}"); await saveLessonProgress(lessonId,Boolean(v.completed),v.score??null);localStorage.removeItem(key);}catch{/* ignore malformed cache */}}
}
