import type { RegistrationQuestion } from "@/lib/types";
export function parseQuestions(json: string): RegistrationQuestion[] { return JSON.parse(json); }
