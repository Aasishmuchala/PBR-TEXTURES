"use client";

// BYOK: keys live only in the user's browser (localStorage) and are sent per
// request to our API routes, which forward them to fal and never persist them.

const FAL = "tf_fal_key";
const OR = "tf_openrouter_key";
const REP = "tf_replicate_key";
const CO = "tf_claudeopus_key";

export function getFalKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(FAL) || "";
}
export function setFalKey(v: string): void {
  localStorage.setItem(FAL, v.trim());
}
export function getOpenRouterKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(OR) || "";
}
export function setOpenRouterKey(v: string): void {
  localStorage.setItem(OR, v.trim());
}
export function hasFalKey(): boolean {
  return getFalKey().length > 0;
}
export function getReplicateKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(REP) || "";
}
export function setReplicateKey(v: string): void {
  localStorage.setItem(REP, v.trim());
}
export function getClaudeOpusKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(CO) || "";
}
export function setClaudeOpusKey(v: string): void {
  localStorage.setItem(CO, v.trim());
}
