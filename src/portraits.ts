export type PortraitExpression = "neutral" | "happy" | "worried";
export type PortraitSize = "portrait" | "avatar";
const available: Partial<Record<string, readonly string[]>> = {};

export function portraitPath(
  client: string,
  size: PortraitSize,
  expression: PortraitExpression,
) {
  const variant = `${size}-${expression}`;
  const file = available[client]?.includes(variant)
    ? `${client}/${variant}.png`
    : size === "avatar"
      ? "placeholder-avatar.png"
      : "placeholder.png";
  return "./assets/clients/" + file;
}
