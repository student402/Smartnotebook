// Curated palette of perceptually distinct, vivid hues
// Each entry: [lightBg, lightText, darkBg, darkText]
const PALETTE = [
  [
    "hsl(350,80%,93%)",
    "hsl(350,65%,28%)",
    "hsla(350,75%,45%,0.28)",
    "hsl(350,85%,80%)",
  ], // rose
  [
    "hsl(28,90%,91%)",
    "hsl(28,75%,28%)",
    "hsla(28,80%,50%,0.28)",
    "hsl(28,90%,78%)",
  ], // orange
  [
    "hsl(45,90%,90%)",
    "hsl(45,70%,28%)",
    "hsla(45,80%,50%,0.28)",
    "hsl(45,90%,76%)",
  ], // amber
  [
    "hsl(88,70%,89%)",
    "hsl(88,60%,22%)",
    "hsla(88,65%,45%,0.28)",
    "hsl(88,70%,72%)",
  ], // lime
  [
    "hsl(152,65%,89%)",
    "hsl(152,60%,22%)",
    "hsla(152,65%,42%,0.28)",
    "hsl(152,70%,72%)",
  ], // emerald
  [
    "hsl(192,75%,89%)",
    "hsl(192,65%,22%)",
    "hsla(192,70%,45%,0.28)",
    "hsl(192,80%,74%)",
  ], // cyan
  [
    "hsl(205,80%,91%)",
    "hsl(205,70%,25%)",
    "hsla(205,75%,50%,0.28)",
    "hsl(205,85%,78%)",
  ], // sky
  [
    "hsl(225,80%,92%)",
    "hsl(225,65%,28%)",
    "hsla(225,75%,55%,0.28)",
    "hsl(225,85%,80%)",
  ], // blue
  [
    "hsl(260,75%,93%)",
    "hsl(260,60%,28%)",
    "hsla(260,70%,55%,0.30)",
    "hsl(260,80%,82%)",
  ], // violet
  [
    "hsl(280,70%,93%)",
    "hsl(280,60%,28%)",
    "hsla(280,65%,50%,0.30)",
    "hsl(280,75%,82%)",
  ], // purple
  [
    "hsl(320,70%,92%)",
    "hsl(320,60%,28%)",
    "hsla(320,65%,48%,0.28)",
    "hsl(320,75%,80%)",
  ], // pink
  [
    "hsl(172,60%,88%)",
    "hsl(172,55%,22%)",
    "hsla(172,60%,42%,0.28)",
    "hsl(172,65%,72%)",
  ], // teal
  [
    "hsl(240,75%,93%)",
    "hsl(240,60%,28%)",
    "hsla(240,70%,55%,0.30)",
    "hsl(240,80%,82%)",
  ], // indigo
  [
    "hsl(300,70%,93%)",
    "hsl(300,58%,28%)",
    "hsla(300,65%,50%,0.28)",
    "hsl(300,75%,82%)",
  ], // fuchsia
  [
    "hsl(4,80%,92%)",
    "hsl(4,65%,28%)",
    "hsla(4,75%,48%,0.28)",
    "hsl(4,85%,80%)",
  ], // red
  [
    "hsl(70,72%,88%)",
    "hsl(70,60%,22%)",
    "hsla(70,65%,44%,0.28)",
    "hsl(70,72%,72%)",
  ], // yellow-green
];

export function getTagColor(tag, theme = "dark") {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % PALETTE.length;
  const [lightBg, lightText, darkBg, darkText] = PALETTE[idx];
  const isLight = theme === "light";
  return [isLight ? lightBg : darkBg, isLight ? lightText : darkText];
}
