export const AVATAR_COLORS = [
  "#7c3aed",
  "#db2777",
  "#e11d48",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0d9488",
  "#0891b2",
  "#2563eb",
  "#4f46e5",
  "#9333ea",
  "#c026d3",
]

export const pickColor = () =>
  AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] ?? "#7c3aed"
