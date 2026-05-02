export function getTagColor(tag, theme = "dark") {
  let hash = 0;
  for (let index = 0; index < tag.length; index += 1) {
    hash = tag.charCodeAt(index) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;
  const isLightTheme = theme === "light";
  const background = isLightTheme
    ? `hsl(${hue}, 55%, 92%)`
    : `hsla(${hue}, 70%, 35%, 0.35)`;
  const color = isLightTheme
    ? `hsl(${hue}, 60%, 25%)`
    : `hsl(${hue}, 75%, 82%)`;

  return [background, color];
}
