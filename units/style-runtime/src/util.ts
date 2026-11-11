import { toHex } from "./color";
export const oklchHex = (l: number, c: number, h: number) => toHex({ l, c, h });
