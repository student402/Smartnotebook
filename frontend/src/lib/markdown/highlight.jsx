export function normalizeCodeLanguage(language, code) {
  const explicit = (language || "").trim().toLowerCase();
  if (explicit) {
    return explicit;
  }

  const source = code.trim();
  if (/^\s*[{[]/.test(source)) {
    return "json";
  }
  if (/\b(def|print|import|from|class|self|None|True|False)\b/.test(source)) {
    return "python";
  }
  if (/\b(const|let|var|function|return|=>|import|export)\b/.test(source)) {
    return "javascript";
  }
  if (/\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|JOIN)\b/i.test(source)) {
    return "sql";
  }
  return "";
}

export function renderHighlightedCode(code, language = "") {
  const normalizedLanguage = normalizeCodeLanguage(language, code);
  const rulesByLanguage = {
    python: [
      { className: "code-token-comment", regex: /#.*/y },
      { className: "code-token-string", regex: /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/y },
      { className: "code-token-keyword", regex: /\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|False|finally|for|from|if|import|in|is|lambda|None|nonlocal|not|or|pass|print|raise|return|self|True|try|while|with|yield)\b/y },
      { className: "code-token-number", regex: /\b\d+(?:\.\d+)?\b/y },
    ],
    javascript: [
      { className: "code-token-comment", regex: /\/\/.*|\/\*[\s\S]*?\*\//y },
      { className: "code-token-string", regex: /(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/y },
      { className: "code-token-keyword", regex: /\b(?:async|await|break|case|catch|class|const|continue|default|delete|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|null|return|super|switch|this|throw|true|try|typeof|undefined|var|while)\b/y },
      { className: "code-token-number", regex: /\b\d+(?:\.\d+)?\b/y },
    ],
    json: [
      { className: "code-token-string", regex: /"(?:\\.|[^"\\])*"(?=\s*:)?/y },
      { className: "code-token-string", regex: /:\s*"(?:\\.|[^"\\])*"/y },
      { className: "code-token-number", regex: /\b-?\d+(?:\.\d+)?\b/y },
      { className: "code-token-keyword", regex: /\b(?:true|false|null)\b/y },
    ],
    sql: [
      { className: "code-token-comment", regex: /--.*/y },
      { className: "code-token-string", regex: /'(?:''|[^'])*'/y },
      { className: "code-token-keyword", regex: /\b(?:select|from|where|insert|into|update|delete|join|left|right|inner|outer|on|and|or|order|by|group|limit|as|distinct|values|set|create|table|drop|alter)\b/iy },
      { className: "code-token-number", regex: /\b\d+(?:\.\d+)?\b/y },
    ],
  };

  const rules = rulesByLanguage[normalizedLanguage] || [];
  if (rules.length === 0) {
    return code;
  }

  const nodes = [];
  let index = 0;

  while (index < code.length) {
    let matched = false;

    for (const rule of rules) {
      rule.regex.lastIndex = index;
      const match = rule.regex.exec(code);
      if (match && match.index === index) {
        nodes.push(
          <span key={`${rule.className}-${index}`} className={rule.className}>
            {match[0]}
          </span>
        );
        index += match[0].length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      nodes.push(code[index]);
      index += 1;
    }
  }

  return nodes;
}
