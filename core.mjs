import { randomUUID } from 'node:crypto';

export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function textField(value, name, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new AppError(`${name} must contain 1–${max} characters.`);
  return value.trim();
}
export function validateEvent(input) {
  const title = textField(input.title, 'Title');
  const start = new Date(input.start), end = new Date(input.end);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start) throw new AppError('Choose a valid end time after the start.');
  if (end - start > 7 * 86400000) throw new AppError('Keep a draft under seven days.');
  return { id: randomUUID(), title, start: start.toISOString(), end: end.toISOString(), location: typeof input.location === 'string' ? input.location.slice(0,300) : '', status: 'draft', created: new Date().toISOString() };
}
export function validateReminder(input) {
  const title = textField(input.title, 'Reminder');
  const due = new Date(input.due);
  if (!Number.isFinite(+due) || due <= new Date()) throw new AppError('Choose a reminder time in the future.');
  return { id: randomUUID(), title, due: due.toISOString(), done: false };
}
export function icsEscape(value) { return value.replace(/\\/g, '\\\\').replace(/\r\n|\n|\r/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
function foldLine(line) {
  const lines = []; let part = '', size = 0;
  for (const char of line) { const n = Buffer.byteLength(char); if (size + n > 75) { lines.push(part); part = ' '; size = 1; } part += char; size += n; }
  lines.push(part); return lines.join('\r\n');
}
export function makeICS(event) {
  const stamp = value => new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Jarvis//Local Draft//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${event.id}@jarvis.local`,`DTSTAMP:${stamp(event.created)}`,`DTSTART:${stamp(event.start)}`,`DTEND:${stamp(event.end)}`,`SUMMARY:${icsEscape(event.title)}`,`LOCATION:${icsEscape(event.location)}`,'DESCRIPTION:Exported from a local Jarvis draft. No invitation has been sent.','END:VEVENT','END:VCALENDAR'].map(foldLine).join('\r\n') + '\r\n';
}
export function validateMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 20) throw new AppError('Send 1–20 conversation messages.');
  let total = 0;
  const result = messages.map(m => {
    if (!m || !['user','assistant'].includes(m.role)) throw new AppError('Invalid message role.');
    const content = textField(m.content,'Message',6000); total += content.length;
    return { role:m.role, content };
  });
  if (total > 24000) throw new AppError('Conversation is too long. Start a new conversation.');
  if (result.at(-1).role !== 'user') throw new AppError('The final message must be from you.');
  return result;
}
export const SYSTEM = `You are Jarvis, a calm, warm personal voice assistant. Speak naturally and briefly, normally in one to three sentences. You can converse and explain things, but have no web search, email, calendar, computer-control tools, or persistent memory. Never claim to perform actions. Ask when important information is missing. Never request API keys in conversation.`;
export function demoReply(content) {
  if (/^(hi|hello|hey)\b/i.test(content.trim())) return 'Hello. I’m Jarvis. Your voice core is ready. I’m using demo replies until an AI brain is connected.';
  if (/who are you|your name/i.test(content)) return 'I’m Jarvis, your personal voice companion. Right now this is a voice preview, with Fish Audio doing the talking.';
  if (/can you hear|test|voice/i.test(content)) return 'Your message reached me. This is a scripted voice test. Connect one AI provider in settings for a real conversation.';
  return 'I received your message. My voice works, but I need a Google, Grok, or OpenAI key to think and reply freely. For now, you’re hearing a scripted preview.';
}
