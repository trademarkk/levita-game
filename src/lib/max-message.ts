export const MAX_MESSAGE_UNITS = 3800;

export function splitMaxMessage(text: string, limit = MAX_MESSAGE_UNITS) {
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
