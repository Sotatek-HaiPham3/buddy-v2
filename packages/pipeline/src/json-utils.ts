export function extractJson<T = unknown>(text: string): T {
  let s = text.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence?.[1]) s = fence[1].trim();
  try { return JSON.parse(s) as T; } catch { /* fallback */ }
  const startObj = s.indexOf('{');
  const startArr = s.indexOf('[');
  const start = startArr === -1 ? startObj
    : startObj === -1 ? startArr
    : Math.min(startObj, startArr);
  if (start === -1) throw new Error('extractJson: no JSON start found');
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false, lastValid = -1;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close) { depth--; if (depth === 0) lastValid = i; }
    }
  }
  if (lastValid === -1) throw new Error('extractJson: no balanced close');
  return JSON.parse(s.slice(start, lastValid + 1)) as T;
}
