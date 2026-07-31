// 画面表示用の日本語ラベル(コードへの直書きを避け、ここに集約)
import { ORG } from "./org";

// 会員の区分の表示名。⚠ 変えるときは src/shared/org.ts の roleLabels を書き換える
export const ROLE_LABELS: Record<string, string> = ORG.roleLabels;

export const ASSIGNABLE_ROLES = [
  "member",
  "kodomo_parent",
  "kodomo_officer",
  "seniors_member",
  "officer",
  "hall_manager",
  "circular_manager",
  "pr",
  "senior_officer",
  "hall_user",
  "observer",
  "admin",
];

export const RESERVATION_STATUS_LABELS: Record<string, string> = {
  received: "受付",
  checking: "確認中",
  approved: "承認済み",
  rejected: "差戻し",
  cancelled: "取消",
  done: "利用済み",
};

export const CIRCULAR_STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  pending_approval: "承認待ち",
  published: "公開中",
  archived: "アーカイブ",
};

export const AUDIENCE_LABELS: Record<string, string> = {
  all: "全員",
  officers: "役員",
  kodomo: "子ども会",
  seniors: ORG.roleLabels.seniors,
};

export function audienceLabel(audience: string): string {
  if (audience.startsWith("group:")) return "グループ配信";
  return AUDIENCE_LABELS[audience] ?? audience;
}

// 回覧の公開レベル: 会員のみ(会員アプリだけ)/ 非会員(公開ページのみ、会員アプリには出さない) / 両方
export const VISIBILITY_LABELS: Record<string, string> = {
  members: "会員のみ",
  public: "非会員(公開ページのみ)",
  both: "両方(会員+公開ページ)",
};

export const MEMBER_STATUS_LABELS: Record<string, string> = {
  pending: "承認待ち",
  active: "有効",
  left: "退会",
};

export const MEETING_STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  open: "受付中",
  closed: "締切",
  done: "終了",
};

export const MEETING_ANSWER_LABELS: Record<string, string> = {
  yes: "出席",
  no: "欠席",
  undecided: "未定",
};

export const SPONSOR_STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  active: "掲載中",
  archived: "終了",
};

export const AD_SECTION_TITLE = "地域の広告(PR)";

// 資料置き場
// 公開レベルのラベルは shared/levels.ts に移した(資料と写真アルバムで共通)。
// 互換のため名前だけ残す。新しいコードは LEVEL_LABELS を直接使うこと。
export { LEVEL_LABELS as DOC_LEVEL_LABELS } from "./levels";
export const DOC_CATEGORY_LABELS: Record<string, string> = {
  rules: "規約・きまり",
  minutes: "総会・集会の報告",
  budget: "予算・決算",
  form: "書式・申込書",
  other: "その他",
};
