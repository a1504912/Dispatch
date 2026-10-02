// 金額欄計算機：可輸入算式（120+80），安全地只允許數字與運算子後計算。
export function evalExpr(s) {
  const str = String(s ?? "").trim();
  if (str === "") return 0;
  if (!/^[0-9+\-*/×÷.()\s]+$/.test(str)) return 0;
  const norm = str.replace(/×/g, "*").replace(/÷/g, "/");
  try {
    // eslint-disable-next-line no-new-func
    const v = Function('"use strict";return (' + norm + ")")();
    return typeof v === "number" && isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

export const hasOperator = (s) =>
  /[+*/×÷]/.test(String(s || "")) || /\d\s*-/.test(String(s || ""));
