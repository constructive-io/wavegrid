export function transformMixedFormat(code: string): string | null {
  const trimmed = code.trim();
  if (!/^\(\{(?:\s|\/\/[^\n]*(?:\n|$))*(?:var|let|const|function)\s/.test(trimmed) || !trimmed.endsWith('})')) return null;

  // Extract the inner content (between ({ and }))
  const inner = trimmed.slice(2, -2);

  // Find where the object properties start by scanning for the first line
  // that looks like an object property key (e.g. "render:" or "meta:")
  // while skipping lines that are part of var/function declarations
  const lines = inner.split('\n');
  let splitIdx = -1;
  let inDecl = false;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimLine = lines[i].trim();

    if (inDecl) {
      bracketDepth += (lines[i].match(/\[/g) || []).length;
      bracketDepth -= (lines[i].match(/\]/g) || []).length;
      braceDepth += (lines[i].match(/\{/g) || []).length;
      braceDepth -= (lines[i].match(/\}/g) || []).length;
      if (bracketDepth <= 0 && braceDepth <= 0) {
        inDecl = false;
      }
      continue;
    }

    if (!trimLine || trimLine.startsWith('//')) continue;

    if (trimLine.startsWith('var ') || trimLine.startsWith('let ') ||
        trimLine.startsWith('const ') || trimLine.startsWith('function ')) {
      // Start of a declaration — track depth
      bracketDepth = (lines[i].match(/\[/g) || []).length - (lines[i].match(/\]/g) || []).length;
      braceDepth = (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
      if (bracketDepth > 0 || braceDepth > 0) {
        inDecl = true;
      }
      continue;
    }

    // This line is not a declaration start and not inside one — it's the first property
    // Verify it looks like an object property (word: or word()  pattern)
    if (/^[a-zA-Z_$]/.test(trimLine)) {
      splitIdx = i;
      break;
    }
  }

  if (splitIdx <= 0) return null;

  const declCode = lines.slice(0, splitIdx).join('\n');
  const propCode = lines.slice(splitIdx).join('\n');
  return `(function(){\n${declCode}\nreturn {${propCode}};\n})()`;
}
