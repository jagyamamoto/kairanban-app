// 「誰が見られるか」の複数選択(オーナー指示 2026-07-30)。
// ⚠ 「会員以上」は会員登録が自動承認のため**登録すれば誰でも見られる**。
//    その警告(LEVEL_WARNINGS)を必ず出す。消さないこと。
import { LEVEL_LABELS, LEVEL_NOTES, LEVEL_WARNINGS, warningsFor } from "../shared/levels";

export function LevelPicker({
  options,
  value,
  onChange,
  label = "誰が見られるようにしますか(いくつでも選べます)",
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  label?: string;
}) {
  const toggle = (l: string) =>
    onChange(value.includes(l) ? value.filter((x) => x !== l) : [...value, l]);
  const warns = warningsFor(value);

  return (
    <div className="recommend-box">
      <p className="group-label" style={{ marginTop: 0 }}>{label}</p>
      {options.map((l) => (
        <label className="checkbox-row level-row" key={l}>
          <input type="checkbox" checked={value.includes(l)} onChange={() => toggle(l)} />
          <span>
            <strong>{LEVEL_LABELS[l] ?? l}</strong>
            <br />
            <span className="field-note">{LEVEL_NOTES[l] ?? ""}</span>
          </span>
        </label>
      ))}
      {value.length === 0 && <p className="error">1つ以上選んでください。</p>}
      {warns.map((w) => (
        <p className="error level-warn" key={w}>
          {w}
        </p>
      ))}
      {value.length > 0 && warns.length === 0 && (
        <p className="field-note">
          選んだ範囲の方だけが見られます。あとから変えられます。
        </p>
      )}
    </div>
  );
}

/** 一覧のチップ表示用。複数あれば「＋n」でまとめる */
export function LevelChips({ levels }: { levels: string[] }) {
  if (!levels.length) return <span className="chip chip-red">公開先なし</span>;
  const CHIP: Record<string, string> = {
    admin_only: "chip-red",
    senior: "chip-red",
    officers: "chip-orange",
    kodomo: "chip-orange",
    seniors: "chip-orange",
    members: "chip-gray",
    public: "chip-green",
  };
  return (
    <span className="row" style={{ gap: 4 }}>
      {levels.map((l) => (
        <span className={`chip ${CHIP[l] ?? "chip-gray"}`} key={l}>
          {LEVEL_LABELS[l] ?? l}
        </span>
      ))}
      {levels.includes("members") && (
        <span className="chip chip-red" title={LEVEL_WARNINGS.members}>
          登録者は誰でも
        </span>
      )}
    </span>
  );
}
