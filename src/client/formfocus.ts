import { useRef, useState } from "react";

/**
 * 入力もれのときに「どの欄が問題なのか」をはっきり見せるための仕組み。
 *
 * これまではフォームの一番下に赤い文字が1行出るだけだったので、
 * 上のほうの欄が空でも、どこを直せばよいのか分からなかった。
 * ここでは
 *   1) その欄まで自動でスクロールし
 *   2) カーソルを入れて(キーボードが出る)
 *   3) 枠を赤くする
 * の3つをまとめて行う。
 *
 * 使い方:
 *   const { formRef, bad, err, fail, clear, fieldProps } = useFormErrors();
 *   <div ref={formRef}>
 *     <input {...fieldProps("phone")} value={...} />
 *     {err && <p className="error" role="alert">{err}</p>}
 *     <Btn onClick={() => { if (!phone) return fail("phone", "電話番号を入れてください"); ... }}>
 */
export function useFormErrors() {
  const formRef = useRef<HTMLDivElement>(null);
  const [bad, setBad] = useState("");
  const [err, setErr] = useState("");

  const fail = (field: string, msg: string) => {
    setBad(field);
    setErr(msg);
    const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    // スクロールとフォーカスが競合して画面が飛ぶのを防ぐ
    el?.focus({ preventScroll: true });
  };

  const clear = () => {
    setBad("");
    setErr("");
  };

  /** 入力欄に付ける属性。どの欄かを覚えておき、問題のある欄は赤枠にする */
  const fieldProps = (field: string) => ({
    "data-field": field,
    "aria-invalid": bad === field || undefined,
    className: bad === field ? "field-bad" : undefined,
  });

  return { formRef, bad, err, setErr, fail, clear, fieldProps };
}
