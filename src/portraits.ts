export const portraitClients = {
  henryk: "Henryk",
  anna: "Anna",
  robert: "Robert",
  kasia: "Kasia",
  marek: "Marek",
  wiktor: "Wiktor",
} as const;
export const portraitExpressions = ["neutral", "happy", "worried"] as const;
export type PortraitExpression = (typeof portraitExpressions)[number];
export type PortraitSize = "portrait" | "avatar";

export function publicAsset(path: string) {
  return new URL(`./${path}`, document.baseURI).href;
}

export function portraitPath(
  client: string,
  size: PortraitSize,
  expression: PortraitExpression,
) {
  if (!Object.hasOwn(portraitClients, client)) {
    return publicAsset(
      `assets/clients/placeholder${size === "avatar" ? "-avatar" : ""}.png`,
    );
  }
  const suffix = size === "avatar" ? "" : `_${expression}`;
  return publicAsset(
    `assets/characters/clients/${client}/${client}_${size}${suffix}.png`,
  );
}

export function clientImage(
  client: string,
  name: string,
  size: PortraitSize,
  expression: PortraitExpression,
) {
  const image = document.createElement("img");
  image.className = `client-${size}`;
  image.alt = `${size === "avatar" ? "Awatar" : "Portret"}: ${name}`;
  image.width = image.height = size === "portrait" ? 72 : 48;
  image.decoding = "async";
  image.onerror = () => {
    const neutral = portraitPath(client, size, "neutral");
    const placeholder = portraitPath("", size, "neutral");
    if (image.src !== neutral && image.src !== placeholder) image.src = neutral;
    else if (image.src !== placeholder) image.src = placeholder;
    else image.onerror = null;
  };
  image.src = portraitPath(client, size, expression);
  return image;
}
