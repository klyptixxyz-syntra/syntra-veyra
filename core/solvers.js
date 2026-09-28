"use strict";

function math(input) {
  const source = String(input).trim();
  if (!/\d/.test(source)) return null;

  let expression = source
    .replace(/,/g, "")
    .replace(/(\d+(?:\.\d+)?)\s*%\s+of\s+(\d+(?:\.\d+)?)/gi, "($1/100)*$2")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/\^/g, "**");

  if (!/%\s+of/i.test(source)) {
    const candidates = expression.match(/[0-9().+\-*/%\s]+/g) || [];
    expression = candidates.sort((a, b) => b.length - a.length)[0] || "";
  }

  expression = expression.trim();
  if (!expression || !/^[0-9().+\-*/%\s]+$/.test(expression)) return null;

  try {
    const value = Function(`"use strict";return (${expression})`)();
    if (!Number.isFinite(value)) return null;
    const pretty = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
    return { type: "math", value, text: pretty, confidence: 1 };
  } catch {
    return null;
  }
}

function coding(input) {
  const text = String(input);
  const fn = text.match(/function\s+(?:named\s+)?([A-Za-z_$][\w$]*)/i)?.[1];

  if (/\bjavascript\b/i.test(text) && /\bmultipl(y|ies|ication)\b/i.test(text)) {
    const name = fn || "multiply";
    return {
      type: "code",
      confidence: .99,
      text: `function ${name}(a, b) {\n  return a * b;\n}`
    };
  }

  if (/\bjavascript\b/i.test(text) && /\b(add|sum)\b/i.test(text) && /\bfunction\b/i.test(text)) {
    const name = fn || "add";
    return {
      type: "code",
      confidence: .98,
      text: `function ${name}(a, b) {\n  return a + b;\n}`
    };
  }

  return null;
}

function syntax(text) {
  const blocks = [...String(text).matchAll(/```(?:js|javascript)?\s*([\s\S]*?)```/gi)]
    .map(x => x[1].trim())
    .filter(Boolean);

  const issues = [];
  for (const code of blocks) {
    try { new Function(code); }
    catch (error) { issues.push(error.message); }
  }

  return { checked: blocks.length > 0, ok: issues.length === 0, issues };
}

function direct(input) {
  return math(input) || coding(input);
}

module.exports = { math, coding, syntax, direct };
