import { normalizeUrl } from "../utils/url";

export function renderInlineMarkdown(text, keyPrefix = "inline") {
  const nodes = [];
  const pattern = /(!\[([^\]]*)\]\((https?:\/\/[^\s)]+|file:\/\/[^\s)]+|(?:\/|\\)[^\s)]+|\/?[a-zA-Z]:[\\/][^\s)]+|data:image\/[^)]+)\)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[2] !== undefined && match[3]) {
      const imageSrc = normalizeUrl(match[3]);
      nodes.push(
        <img
          key={`${keyPrefix}-${match.index}`}
          src={imageSrc}
          alt={match[2] || ""}
          className="note-inline-image"
          loading="lazy"
        />
      );
    } else if (match[4] && match[5]) {
      nodes.push(
        <a key={`${keyPrefix}-${match.index}`} href={match[5]} target="_blank" rel="noreferrer">
          {match[4]}
        </a>
      );
    } else if (match[6]) {
      nodes.push(<strong key={`${keyPrefix}-${match.index}`}>{match[6]}</strong>);
    } else if (match[7]) {
      nodes.push(<em key={`${keyPrefix}-${match.index}`}>{match[7]}</em>);
    } else if (match[8]) {
      nodes.push(<code key={`${keyPrefix}-${match.index}`}>{match[8]}</code>);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
