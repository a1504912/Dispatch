import { evalExpr } from "../calc";

// 金額欄下方的計算機按鈕列，操作傳入的字串（value）。
export default function CalcButtons({ value, onChange }) {
  const append = (ch) => onChange((value || "") + ch);
  const back = () => onChange(String(value || "").slice(0, -1));
  const equals = () => onChange(String(evalExpr(value)));
  const btn =
    "flex-1 rounded-lg bg-slate-100 py-1.5 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-95";
  return (
    <div className="flex gap-1.5">
      {["+", "−", "×", "÷"].map((op) => (
        <button key={op} type="button" onClick={() => append(op === "−" ? "-" : op)} className={btn}>
          {op}
        </button>
      ))}
      <button type="button" onClick={back} className={btn} title="退格">⌫</button>
      <button type="button" onClick={equals} className="flex-1 rounded-lg bg-slate-700 py-1.5 text-sm font-bold text-white transition hover:bg-slate-600 active:scale-95" title="算出結果">
        ＝
      </button>
    </div>
  );
}
