// Picks the sentences of a conversation worth remembering (work, intros, hiring, follow-ups).
// Used when no AI key is configured, or as the fallback if the AI call fails.
export function splitSentences(text: string) {
  // written without a "look-behind" pattern, which iPhones before iOS 16.4 can't read at all
  return text
    .replace(/([.!?])\s+/g, "$1\n")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const STRONG =
  /\b(work|works|working|engineer|developer|designer|manager|founder|ceo|cto|cfo|intern|interns|internship|hiring|hire|job|jobs|role|team|company|startup|project|building|launch|introduce|intro|introduction|connect|meet|coffee|follow|email|call|next week|tomorrow|looking for|interested|help|offer|offered|recommend|university|study|studying|research|invest|investor|funding|apply|deadline)\b/gi;
const FILLER = /\b(um+|uh+|you know|i mean|like,)\s*/gi;

export function keyPoints(text: string, max = 4) {
  const scored = splitSentences(text)
    .map((s, i) => {
      const clean = s.replace(FILLER, "").replace(/\s+/g, " ").trim();
      const words = clean.split(" ").length;
      const hits = (clean.match(STRONG) || []).length;
      const names = (clean.slice(1).match(/\b[A-Z][a-z]+/g) || []).length;
      const numbers = /\d/.test(clean) ? 1 : 0;
      return { i, clean, score: words < 4 ? -1 : hits * 3 + names + numbers };
    })
    .filter((x) => x.clean);
  let pick = scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
  if (!pick.length) pick = scored.slice(0, max);
  return pick
    .sort((a, b) => a.i - b.i)
    .map((x) => {
      const s = x.clean.charAt(0).toUpperCase() + x.clean.slice(1);
      return s.length > 140 ? s.slice(0, 137).replace(/\s+\S*$/, "") + "…" : s;
    });
}
