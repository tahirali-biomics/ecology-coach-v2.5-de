/*
 * Ecology Coach
 * Copyright © 2026 Dr. Tahir Ali
 * All rights reserved. See LICENSE.
 */

import type { AiFeedback, AiRequest } from "./ai";
import { supabase } from "./supabase";
export type SavedConversationTurn={id:number;mode:string;user_text:string;ai_reply:string|null;feedback:Record<string,unknown>|null;created_at:string};
export async function saveConversationTurn(req:AiRequest,result:AiFeedback){if(!supabase)return;const{data:{user}}=await supabase.auth.getUser();if(!user)return;const{error}=await supabase.from("conversation_turns").insert({user_id:user.id,mode:req.mode,user_text:req.message,ai_reply:result.reply,feedback:result});if(error)throw error;}
export async function loadConversationTurns(mode?:string,limit=30):Promise<SavedConversationTurn[]>{if(!supabase)return[];const{data:{user}}=await supabase.auth.getUser();if(!user)return[];let q=supabase.from("conversation_turns").select("id,mode,user_text,ai_reply,feedback,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(limit);if(mode)q=q.eq("mode",mode);const{data,error}=await q;if(error)throw error;return(data??[])as SavedConversationTurn[];}
export function turnsToHistory(rows:SavedConversationTurn[]){return[...rows].reverse().flatMap(r=>[{role:"user" as const,content:r.user_text},{role:"assistant" as const,content:r.ai_reply??""}]).slice(-10);}
