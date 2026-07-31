// 公開レベル(資料・写真アルバム共通)。オーナー指示 2026-07-30。
//
//   「投稿者と投稿者より上のレベルしか閲覧できないレベルに基本設定にしておき、
//     投稿時および後から公開レベルを変更できるようにしてください」
//
// ⚠ サーバとクライアントで判定がズレると「見えているのに開けない/見えないのに漏れる」に
//   なるので、レベルの定義と判定は必ずこのファイルに1本化する。
// ⚠ 写真アルバムは肖像権・個人情報の問題があるため **public を選べない**
//   (POST_LEVELS に public を入れない)。ここを緩めないこと。

import { ORG } from "./org";
export type Level =
  | "admin_only"
  | "senior"
  | "officers"
  | "members"
  | "public"
  | "kodomo"
  | "seniors";

/**
 * 役割の「高さ」。数字が大きいほど上。
 * 上の人は下のレベルのものを見られる、という考え方で使う。
 */
const ROLE_RANK: Record<string, number> = {
  hall_user: 0, // 会館予約者(町会の外の人)
  member: 10,
  kodomo_parent: 10,
  seniors_member: 10,
  observer: 10,
  officer: 20,
  pr: 20,
  circular_manager: 20,
  hall_manager: 20,
  kodomo_officer: 20,
  senior_officer: 30,
  admin: 40,
};

/** その人の一番高い役割の高さ。役割が無ければ会員扱い(10)。 */
export function rankOf(roles: string[]): number {
  if (!roles.length) return 10;
  return Math.max(...roles.map((r) => ROLE_RANK[r] ?? 10));
}

/** レベルを見るのに必要な高さ。グループ限定(kodomo/seniors)は別扱い。 */
const LEVEL_RANK: Record<Level, number> = {
  public: -1, // 誰でも
  members: 10,
  officers: 20,
  senior: 30,
  admin_only: 40,
  kodomo: 10, // 高さではなく所属で判定する
  seniors: 10,
};

/** グループ限定レベルと、それを見られる役割 */
const GROUP_LEVELS: Record<string, string[]> = {
  kodomo: ["kodomo_parent", "kodomo_officer"],
  seniors: ["seniors_member"],
};

// 未知の値が来ても落ちないよう Record<string,...> にしている(DBの値は文字列)
export const LEVEL_LABELS: Record<string, string> = {
  public: "どなたでも(一般公開)",
  members: "会員全員(登録した人は誰でも)",
  officers: "役員以上",
  senior: "上級役員以上",
  admin_only: "管理者のみ",
  kodomo: "子ども会のみ",
  seniors: `${ORG.roleLabels.seniors}のみ`,
};

export const LEVEL_NOTES: Record<string, string> = {
  public: "ログインしていない方にも見えます。写真には選べません。",
  members:
    "町会に登録している全員が見られます。会員登録は電話番号だけで自動的に通るため、実質「登録した人は誰でも」です。",
  officers: "町内会役員・子ども会役員・会館係から上が見られます。",
  senior: "上級役員と管理者だけが見られます。",
  admin_only: "管理者だけが見られます。",
  kodomo: "子ども会の保護者・役員だけが見られます(役員以上も見られます)。",
  seniors: `${ORG.roleLabels.seniors}の方だけが見られます(役員以上も見られます)。`,
};

/**
 * そのレベルを選ぶ前に**必ず読ませたい警告**。無ければ空文字。
 *
 * ⚠ 会員登録は自動承認(電話番号を入れればその場で会員になれる)。
 *   つまり「会員以上」は実質「登録した人は誰でも」になる。オーナーの指摘により明示する。
 *   この警告を消さないこと。
 */
export const LEVEL_WARNINGS: Record<string, string> = {
  public:
    "⚠ 誰でも見られます。ログインも不要で、検索エンジンに載る可能性もあります。個人が写った写真や名簿には選ばないでください。",

  // ⚠ ここはHTMLとしてそのまま表示される。Markdownの ** は使わないこと(文字のまま出てしまう)。
  members:
    "⚠⚠ これは「町会のほぼ全員に見せる」設定です。会員登録は電話番号を入れるだけでその場で通り、役員の確認はありません。つまり、この地域の人なら誰でも登録して見られると考えてください。名簿・住所・電話番号・お子様が写った写真・お金の話などには、絶対に選ばないでください。迷ったら「役員以上」にしてください。",
};

/** そのレベルの組み合わせに、警告が必要なものが含まれるか */
export function warningsFor(levels: string[]): string[] {
  return levels.map((l) => LEVEL_WARNINGS[l]).filter((w): w is string => !!w);
}

/**
 * 資料で選べるレベル(上から順)。
 * ⚠ **`public`(一般公開)は入れない**(オーナー指示 2026-07-30)。
 *   町会の資料は町会の中だけで共有する。ここに public を足さないこと。
 */
export const DOC_LEVELS: Level[] = [
  "admin_only",
  "senior",
  "officers",
  "kodomo",
  "seniors",
  "members",
];

/**
 * ブログ(写真)で選べるレベル。
 * ⚠ **public は入れない**(肖像権・個人情報のため一般公開しない・オーナー指示)。
 */
export const POST_LEVELS: Level[] = [
  "admin_only",
  "senior",
  "officers",
  "kodomo",
  "seniors",
  "members",
];

/**
 * 複数の公開先のうち**どれか1つでも**当てはまれば見られる(オーナー指示: 複数選択)。
 * levels が空・壊れている場合は見せない(安全側)。
 */
export function canViewAny(roles: string[], levels: string[]): boolean {
  if (!Array.isArray(levels) || levels.length === 0) return false;
  return levels.some((l) => canViewLevel(roles, l));
}

/** DBに入っているJSON文字列を配列にする。壊れていても落ちない。 */
export function parseLevels(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** そのレベルを見られるか。roles は有効な役割の一覧。ログインしていなければ空配列。 */
export function canViewLevel(roles: string[], level: string): boolean {
  if (level === "public") return true;
  if (!roles.length) return false;
  // 会館予約者(町会の外の人)は public 以外を見られない
  if (roles.every((r) => r === "hall_user")) return false;

  const group = GROUP_LEVELS[level];
  if (group) {
    // その所属の人、または役員以上(運営として見る必要があるため)
    if (roles.some((r) => group.includes(r))) return true;
    return rankOf(roles) >= 20;
  }
  const need = LEVEL_RANK[level as Level];
  if (need === undefined) return false; // 知らないレベルは見せない(安全側)
  return rankOf(roles) >= need;
}

/** 見られるレベルの一覧(SQLのIN句に使う) */
export function viewableLevels(roles: string[]): string[] {
  return (Object.keys(LEVEL_LABELS) as Level[]).filter((l) => canViewLevel(roles, l));
}

/**
 * 投稿時の既定レベル = 「投稿者と同じ高さ以上の人だけが見られる」レベル。
 * 例: 町内会員が投稿 → members / 役員が投稿 → officers / 上級役員 → senior
 * 子ども会の役割しか持たない人は「子ども会のみ」を既定にする(そのほうが実態に合う)。
 */
/** 投稿時の既定(複数選択なので配列で返す) */
export function defaultLevelsFor(roles: string[]): Level[] {
  const d = defaultLevelFor(roles);
  // 既定が自分では選べないもの(会員の既定 members など)になる場合は、
  // 選べるうちで一番狭いものを既定にする。選べないものを初期値にすると保存できない。
  const ok = selectableLevels(roles, "doc");
  if (ok.includes(d)) return [d];
  return ok.length ? [ok[0]] : [];
}

export function defaultLevelFor(roles: string[]): Level {
  const kodomoOnly =
    roles.length > 0 && roles.every((r) => ["kodomo_parent", "kodomo_officer"].includes(r));
  if (kodomoOnly) return "kodomo";
  const seniorsOnly = roles.length > 0 && roles.every((r) => r === "seniors_member");
  if (seniorsOnly) return "seniors";
  const rank = rankOf(roles);
  if (rank >= 40) return "admin_only";
  if (rank >= 30) return "senior";
  if (rank >= 20) return "officers";
  return "members";
}

/**
 * その人が投稿時に選んでよいレベル。
 * ⚠ **自分より上のレベルしか選べない、という制限はかけない**が、
 *   自分が見られないレベル(自分より上)を選ぶと自分で開けなくなるため候補から外す。
 *   一般公開(public)は資料のみ、かつ役員以上だけが選べる。
 */
/**
 * その人が投稿時に選んでよいレベル。
 *
 * ⚠ **「会員全員」を選べるのは上級役員と管理者だけ**(オーナー指示 2026-07-30)。
 *   会員登録が自動承認なので、これは事実上「誰でも見られる」に等しい。
 *   一般の会員や役員が軽い気持ちで選べないようにしている。ここを緩めないこと。
 */
export function selectableLevels(roles: string[], kind: "doc" | "post"): Level[] {
  const all = kind === "post" ? POST_LEVELS : DOC_LEVELS;
  const rank = rankOf(roles);
  return all.filter((l) => {
    if (!canViewLevel(roles, l)) return false;
    if (l === "members" && rank < 30) return false; // 上級役員・管理者だけ
    if (l === "public" && rank < 30) return false; // 資料・写真では public は候補に無いが念のため
    return true;
  });
}
