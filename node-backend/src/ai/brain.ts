import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";

const client = new Anthropic({ apiKey: config.anthropicKey });

export type Intent =
  | "LOG_EXPENSE"
  | "SET_GOAL"
  | "QUERY_GOALS"
  | "QUERY_SPENDING"
  | "QUERY_NET_WORTH"
  | "SET_REMINDER"
  | "CASUAL_CHAT"
  | "UNKNOWN";

export interface ParsedMessage {
  intent: Intent;
  amount?: number;
  merchant?: string;
  category?: string;
  note?: string;
  goalTitle?: string;
  goalType?: string;
  goalTarget?: number;
  goalDeadline?: string;
  reminderText?: string;
  replyText: string;
}

const SYSTEM_PROMPT = `You are MonoxBot, a personal finance AI assistant for a South African user named Itu.
You help track spending, set financial goals, check net worth, and keep Itu on track.
Be concise, friendly, and slightly gamified in tone (mention XP, streaks where relevant).
Always respond in JSON matching the ParsedMessage schema.

ParsedMessage schema:
{
  "intent": one of LOG_EXPENSE | SET_GOAL | QUERY_GOALS | QUERY_SPENDING | QUERY_NET_WORTH | SET_REMINDER | CASUAL_CHAT | UNKNOWN,
  "amount": number (ZAR, positive = expense, negative = income),
  "merchant": string,
  "category": string (Groceries | Transport | Dining Out | Subscriptions | Utilities | Shopping | Health | Other),
  "note": string,
  "goalTitle": string,
  "goalType": string (SAVINGS | SPENDING_LIMIT | NET_WORTH | TRADE_TARGET | CUSTOM),
  "goalTarget": number,
  "goalDeadline": ISO date string or null,
  "reminderText": string,
  "replyText": string (what to send back to the user, max 2 sentences, conversational)
}

Examples:
- "log R250 uber" → intent: LOG_EXPENSE, amount: 250, merchant: "Uber", category: "Transport"
- "I want to save R10000 by December" → intent: SET_GOAL, goalTitle: "Save R10000", goalType: "SAVINGS", goalTarget: 10000
- "how am I doing this month?" → intent: QUERY_SPENDING
- "remind me to pay rent on the 1st" → intent: SET_REMINDER
- "hey" → intent: CASUAL_CHAT

Amounts in ZAR. No currency symbol needed in the number field.
Return ONLY valid JSON, no markdown, no explanation.`;

export async function parseMessage(
  userMessage: string,
  recentContext: string = ""
): Promise<ParsedMessage> {
  const messages: Anthropic.MessageParam[] = [];

  if (recentContext) {
    messages.push({
      role: "user",
      content: `Recent context:\n${recentContext}`,
    });
    messages.push({
      role: "assistant",
      content: "Got it, I have that context.",
    });
  }

  messages.push({ role: "user", content: userMessage });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages,
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim()) as ParsedMessage;
  } catch {
    // Fallback if Claude returns something unexpected
    return {
      intent: "UNKNOWN",
      replyText: "I didn't quite catch that. Try: 'log R150 groceries' or 'show my goals'.",
    };
  }
}