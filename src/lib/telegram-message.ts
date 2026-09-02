export const TELEGRAM_MESSAGE_UNITS = 3800;

export function splitTelegramMessage(text: string, limit = TELEGRAM_MESSAGE_UNITS) {
  const chunks: string[] = [];
  let current = "";

  for (const character of text) {
    if (current.length + character.length > limit) {
      chunks.push(current);
      current = character;
    } else {
      current += character;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

export function toTelegramHtml(text: string) {
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  return escaped.replace(/\*\*([\s\S]+?)\*\*/g, "<b>$1</b>");
}
