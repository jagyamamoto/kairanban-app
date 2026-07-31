// ⚠ このファイルは**全て架空のサンプルデータ**。
//   ごみの日・避難所・リンク先は、導入する地域の実際の内容に書き換えること。
//   リンクの https://www.example.com/ は自治体の該当ページに差し替える。
// 生活情報(公開・多言語): みどり町三丁目のごみ収集日・分別・防災
// 出典(2026-07-29時点のみどり区公式サイト):
//   ごみ収集日 https://www.example.com/ (令和8年度 第2地区=みどり町4〜9丁目)
//   分別       https://www.example.com/
//   避難場所   https://www.example.com/ (町名→広域避難場所)
//   避難所     https://www.example.com/
//   防災マップ https://www.example.com/
import type { PubLang } from "./i18n";

export const LIFE_LINKS = {
  gomiSchedule: "https://www.example.com/",
  gomiSortPdf: "https://www.example.com/",
  // 「ごみ分別ナビ(サンプル)」(AI分別検索・6言語)は**LINE専用**。以前リンクしていた
  // 自治体によってはチャットボット等の別サービスがある。使い分けは導入地域に合わせる。
  gomiNaviLine: "https://www.example.com/@area_gominavi",
  gomiChatbotJa: "https://www.example.com/",
  sodaiTel: "03-6431-9997",
  kadenTel: "0570-087200",
  bosaiMap: "https://www.example.com/",
  hazardMap: "https://www.example.com/",
  hinanjo: "https://www.example.com/",
};

// 水害ハザードマップ(洪水/大雨浸水/高潮)の言語別PDF。
// 出典: https://www.example.com/ (2026-07-29に全URL実取得で確認)
// ※ 区の防災PDFに**ベトナム語版は存在しない**ため、viは英語版を案内する。
const HZ = "https://www.example.com/";
type HazardSet = { flood: string; rain: string; surge: string; booklet: string; isFallback?: boolean };
export const HAZARD_PDF: Record<PubLang, HazardSet> = {
  ja: { flood: `${HZ}/hm_flood_japanese.pdf`, rain: `${HZ}/hm_rain_japanese.pdf`, surge: `${HZ}/hm_stormsurge_japanese.pdf`, booklet: `${HZ}/booklet_japanese.pdf` },
  "ja-easy": { flood: `${HZ}/hm_flood_japanese.pdf`, rain: `${HZ}/hm_rain_japanese.pdf`, surge: `${HZ}/hm_stormsurge_japanese.pdf`, booklet: `${HZ}/booklet_japanese.pdf` },
  en: { flood: `${HZ}/hm_flood_english.pdf`, rain: `${HZ}/hm_rain_english.pdf`, surge: `${HZ}/hm_stormsurge_english.pdf`, booklet: `${HZ}/booklet_english.pdf` },
  zh: { flood: `${HZ}/hm_flood_chinese.pdf`, rain: `${HZ}/hm_rain_chinese.pdf`, surge: `${HZ}/hm_stormsurge_chinese.pdf`, booklet: `${HZ}/booklet_chinese.pdf` },
  vi: { flood: `${HZ}/hm_flood_english.pdf`, rain: `${HZ}/hm_rain_english.pdf`, surge: `${HZ}/hm_stormsurge_english.pdf`, booklet: `${HZ}/booklet_english.pdf`, isFallback: true },
};

// みどり区防災マップ(避難場所の地図)の言語別PDF。日本語の解説面は区のアップロードミスで
// 拡張子が .crdownload のため、日本語は地図面のみ案内する。
const BM = "https://www.example.com/";
export const BOSAI_MAP_PDF: Record<PubLang, { map: string; guide?: string; isFallback?: boolean }> = {
  ja: { map: `${BM}/20250815142906.pdf` },
  "ja-easy": { map: `${BM}/20250815142906.pdf` },
  en: { map: `${BM}/20250815143747.pdf`, guide: `${BM}/20250815143811.pdf` },
  zh: { map: `${BM}/20250815143832.pdf`, guide: `${BM}/20250815143852.pdf` },
  vi: { map: `${BM}/20250815143747.pdf`, guide: `${BM}/20250815143811.pdf`, isFallback: true },
};

// メール以外の受け取り方(オーナー指摘: 高齢者はメールを見ない/外国語版が弱い)。
// みどり区の安全安心メールは日英中韓のみ・ベトナム語なし。Safety tips は15言語でプッシュ通知あり。
export const ALERT_LINKS = {
  areaBosaiX: "https://www.example.com/",
  areaBosaiPortal: "https://www.example.com/",
  areaBosaiRss: "https://www.example.com/",
  anshinMail: "https://www.example.com/",
  bosaiAppIos: "https://www.example.com/",
  bosaiAppAndroid: "https://www.example.com/",
  safetyTipsIos: "https://apps.apple.com/jp/app/safety-tips/id858357174",
  safetyTipsAndroid: "https://www.example.com/",
  jmaMultiVi: "https://www.example.com/",
  jmaMultiEn: "https://www.example.com/",
  radioNote: "こうとう安心ラジオ885 (FM 88.5MHz)",
};

// みどり区が出している「資源とごみの分け方・出し方」パンフレットの言語別PDF。
// 出典: https://www.example.com/ (2026-07-29確認)
// ※ 分別チャート裏面(8ura.pdf)そのものの外国語版は無く、これが実質的な外国語版チャート。
export const GOMI_GUIDE_PDF: Record<PubLang, { url: string; note?: string }> = {
  ja: { url: "https://www.example.com/" },
  "ja-easy": {
    // やさしい日本語の解説は動画で提供されている(各多言語PDFのQRコードもこの動画を指す)
    url: "https://www.example.com/",
  },
  en: { url: "https://www.example.com/" },
  zh: { url: "https://www.example.com/" },
  vi: {
    url: "https://www.example.com/",
    note: "2025年3月版(最新の日本語版より古い場合があります)",
  },
};

// 収集日カレンダーの言語別PDF(隔週の日付入り)。ベトナム語版は無いため英語版を案内する。
// 出典: https://www.example.com/
export const GOMI_CALENDAR_PDF: Record<PubLang, string> = {
  ja: "https://www.example.com/",
  "ja-easy": "https://www.example.com/",
  en: "https://www.example.com/",
  zh: "https://www.example.com/",
  vi: "https://www.example.com/",
};

// みどり町三丁目は「第2地区」(みどり町4〜9丁目)
export type GomiRow = { kind: string; day: string; note: string };

export type LifeInfoDict = {
  tab: string;
  intro: string;
  sourceNote: string;

  gomiTitle: string;
  gomiArea: string;
  gomiHeadKind: string;
  gomiHeadDay: string;
  gomiRows: GomiRow[];
  gomiCaution: string;
  gomiTimeNote: string;
  gomiScheduleLink: string;

  sortTitle: string;
  sortIntro: string;
  sortGroups: { name: string; items: string }[];
  sortPdfLink: string;
  sortCalendarLink: string;
  sortPdfOldNote: string;

  rulesTitle: string;
  rulesIntro: string;
  rules: { point: string; detail: string }[];
  naviTitle: string;
  naviDesc: string;
  naviLineLink: string;
  naviChatbotLink: string;
  sodaiNote: string;

  bosaiTitle: string;
  hinanbashoLabel: string;
  hinanbashoValue: string;
  kyotenNote: string;
  openMap: string;
  hinanbashoNote: string;
  hinanjoLabel: string;
  hinanjoNote: string;
  hinanjoNear: Shelter[];
  hazardLabel: string;
  hazardNote: string;
  hazardMapLink: string;
  bosaiMapLink: string;
  hinanjoLink: string;
  hzFlood: string;
  hzRain: string;
  hzSurge: string;
  hzBooklet: string;
  hzFallbackNote: string;
  alertTitle: string;
  alertDesc: string;
  alertX: string;
  alertPortal: string;
  alertMail: string;
  alertApp: string;
  alertSafetyTips: string;
  alertSafetyTipsNote: string;
  alertJma: string;
};

// 施設は固有名詞なので全言語共通(日本語表記)。地図はGoogleマップ検索リンクで開く
// (住所と施設名で検索するため、言語設定に関わらず端末の地図アプリで開ける)
export type Shelter = { name: string; address: string; kyoten?: boolean };

export function mapUrl(query: string): string {
  return `https://www.example.com/${encodeURIComponent(query)}`;
}

const NEAR_SHELTERS: Shelter[] = [
  // ⚠ すべて架空のサンプル。導入する地域の実際の避難所に書き換えること。
  { name: "みどり町第一小学校", address: "みどり区みどり町1-1-1", kyoten: true },
  { name: "みどり町第二小学校", address: "みどり区みどり町3-2-2", kyoten: true },
  { name: "みどり町中学校", address: "みどり区みどり町5-3-3" },
  { name: "みどり町区民館", address: "みどり区みどり町2-4-4" },
];

export const HINANBASHO = { name: "みどり中央公園", address: "みどり区みどり町9-9-9" };

export const LIFE_INFO: Record<PubLang, LifeInfoDict> = {
  ja: {
    tab: "生活情報",
    intro:
      "みどり町三丁目にお住まいの方向けの、ごみの出し方と防災の基本情報です。みどり区の公式情報をもとにまとめています。",
    sourceNote: "出典: みどり区公式サイト(2026年7月時点)。最新情報は各リンク先をご確認ください。",

    gomiTitle: "ごみ・資源の収集日",
    gomiArea: "みどり町三丁目は「第2地区」(みどり町4〜9丁目)です。",
    gomiHeadKind: "種類",
    gomiHeadDay: "収集日",
    gomiRows: [
      { kind: "燃やすごみ", day: "水曜日・土曜日", note: "週2回" },
      { kind: "資源(新聞・雑がみ・段ボール・びん・かん・ペットボトルなど)", day: "月曜日", note: "週1回" },
      { kind: "プラスチック", day: "金曜日", note: "週1回" },
      { kind: "燃やさないごみ", day: "火曜日(隔週)", note: "2週に1回。日付は区の一覧でご確認ください" },
    ],
    gomiCaution:
      "一部の集合住宅・地域では曜日が異なる場合があります。集積所の看板でもご確認ください。",
    gomiTimeNote: "収集日の朝8時までに集積所に出してください。台風など荒天の日は排出をお控えください。",
    gomiScheduleLink: "収集日一覧(みどり区・隔週の日付入り)",

    sortTitle: "ごみの分け方",
    sortIntro: "みどり区では次の4つに分けます。",
    sortGroups: [
      {
        name: "燃やすごみ(水・土)",
        items: "生ごみ、紙おむつ、ゴム製品、皮革製品、貝がら・卵のから、少量の枝葉、汚れの落ちないプラスチック",
      },
      {
        name: "資源(月)",
        items:
          "新聞、雑誌・雑がみ、段ボール、びん、かん、ペットボトル、発泡トレイ・発泡スチロール。※種類ごとに分けて出す。びん・かんは中身を空にしてすすぐ",
      },
      {
        name: "プラスチック(金)",
        items:
          "100%プラスチック素材の製品、プラマークがついているもの(レジ袋、外袋、キャップ、ラベル、弁当の容器など)。※汚れや油分は落とす",
      },
      {
        name: "燃やさないごみ(隔週 火)",
        items:
          "①電池・蛍光管・水銀製品等 ②発火性の製品(カセットボンベ・スプレー缶・ライター) ③陶磁器・小型家電・ガラス・やかん等。※3種類に分けて、それぞれ透明な袋に入れる",
      },
    ],
    sortPdfLink: "分け方・出し方の詳しい表(みどり区PDF)",
    sortCalendarLink: "収集日カレンダー(隔週の日付入り・みどり区PDF)",
    sortPdfOldNote: "",

    rulesTitle: "ご近所トラブルを防ぐ7つのポイント",
    rulesIntro:
      "みどり町三丁目は集合住宅が多く、集積所を大勢で共用しています。この7つを守っていただければ、ほとんどのトラブルは防げます。",
    rules: [
      {
        point: "① 朝8時までに出す。前の晩は出さない",
        detail:
          "夜に出すとカラスや猫に荒らされ、道路に散らかります。放火の原因にもなります。台風など荒天の日は出さないでください。",
      },
      {
        point: "② 中身の見える袋(透明・半透明)で、90リットルまで",
        detail:
          "黒い袋やレジ袋の二重包みは中身が確認できず、収集されません。ふた付きの容器でも構いません。",
      },
      {
        point: "③ 燃やさないごみは3つに分けて、それぞれ透明な袋に",
        detail:
          "①電池・蛍光管・水銀のもの ②スプレー缶・カセットボンベ・ライター ③陶器・ガラス・小型金属。混ぜると収集車の火災事故につながり危険です。スプレー缶は中身を使い切り、穴は開けないでください。",
      },
      {
        point: "④ びん・かん・ペットボトルは軽くすすぐ。プラは汚れを落とす",
        detail:
          "中身が残っていると臭い・虫の原因になります。油汚れが落ちないプラスチックは燃やすごみに出してください。",
      },
      {
        point: "⑤ 一辺30cm以上は「粗大ごみ」。申し込みと有料券が必要",
        detail:
          "掛け布団・カーペット・ベッドパッドも粗大ごみです。集積所にそのまま置くと収集されず残ります。事前に電話かインターネットで申し込んでください。",
      },
      {
        point: "⑥ みどり町三丁目は「第2地区」。曜日は地区ごとに違います",
        detail:
          "同じみどり区でも、丁目が違えば収集日が違います。前に住んでいた場所の曜日で出すと収集されません。",
      },
      {
        point: "⑦ エアコン・テレビ・冷蔵庫・洗濯機・衣類乾燥機は区では回収しません",
        detail:
          "家電リサイクル法の対象です。家電リサイクル受付センター(0570-087200)へ。刃物・割れたガラスは紙に包み「キケン」と書いてください。",
      },
    ],
    naviTitle: "迷ったときは(6言語対応)",
    naviDesc:
      "「これは何ごみ?」と迷ったら、LINEの「ごみ分別ナビ(サンプル)」が便利です。日本語・英語・中国語・韓国語・タガログ語・ベトナム語に対応し、品目名の検索のほか、写真を送るとAIが判定してくれます。友だち追加後、メニューの「言語設定」「地域設定」で言語と地区を選んでください。",
    naviLineLink: "LINEで「ごみ分別ナビ(サンプル)」を友だち追加",
    naviChatbotLink: "ウェブ版チャットボット(日本語のみ)",
    sodaiNote: "粗大ごみの申し込み: 03-6431-9997(月〜土 8:00〜19:00)",

    bosaiTitle: "防災・避難情報",
    hinanbashoLabel: "避難場所(大地震のあとの大規模火災から逃げる場所)",
    hinanbashoValue: "みどり中央公園",
    kyotenNote: "拠点避難所(区立小中学校)",
    openMap: "地図で見る",
    hinanbashoNote:
      "みどり町4・5・7・8・9丁目は「みどり町中央公園」が割り当てられています(東京都指定)。まず身の安全を確保し、火災が広がるおそれがあるときに向かってください。",
    hinanjoLabel: "避難所(自宅で生活できなくなったときに滞在する場所)",
    hinanjoNote:
      "区は最寄りの区立小中学校(拠点避難所)を第一候補にすることを推奨しています。町会であらかじめ決めている場合はそちらに従ってください。みどり町三丁目の近くには次の施設があります。",
    hinanjoNear: NEAR_SHELTERS,
    hazardLabel: "ハザードマップ(水害の危険を知る地図)",
    hazardNote:
      "みどり区は海抜が低く、大雨や高潮による浸水の可能性があります。お住まいの場所がどのくらい浸水するおそれがあるか、事前にご確認ください。",
    hazardMapLink: "みどり区水害ハザードマップ",
    bosaiMapLink: "みどり区防災マップ(多言語版あり)",
    hinanjoLink: "避難所の一覧(みどり区)",
    hzFlood: "洪水(荒川の氾濫)ハザードマップ",
    hzRain: "大雨浸水(内水)ハザードマップ",
    hzSurge: "高潮ハザードマップ",
    hzBooklet: "洪水・高潮ブックレット(避難の考え方)",
    hzFallbackNote: "",
    alertTitle: "災害情報の受け取り方(メール以外も)",
    alertDesc:
      "区の「安全安心メール」に加えて、メールを見ない方でも受け取れる方法があります。ご家族の状況に合うものをお選びください。",
    alertX: "X(旧Twitter) @area_bosai — 登録不要で読めます",
    alertPortal: "みどり区防災ポータル(アプリ不要・地図で見る)",
    alertMail: "こうとう安全安心メールに登録する",
    alertApp: "みどり区防災アプリ(iPhone / Android)",
    alertSafetyTips: "Safety tips(15言語・無料アプリ)",
    alertSafetyTipsNote:
      "観光庁監修の無料アプリ。地震・津波・気象警報・避難情報を15言語でプッシュ通知します。日本語が読めないご家族・ご近所の方に おすすめです。",
    alertJma: "気象庁 多言語の警報ページ",
  },

  "ja-easy": {
    tab: "せいかつの じょうほう",
    intro:
      "みどり町三丁目(かめいど ななちょうめ)に すんでいる人の ための、ごみの だしかたと ぼうさいの じょうほうです。",
    sourceNote: "みどり区(こうとうく)の ホームページの じょうほうです(2026年7月)。",

    gomiTitle: "ごみを だす日",
    gomiArea: "みどり町三丁目は「第2地区(だい2ちく)」です。",
    gomiHeadKind: "しゅるい",
    gomiHeadDay: "だす日",
    gomiRows: [
      { kind: "もやす ごみ", day: "水よう日・土よう日", note: "1週に 2かい" },
      { kind: "しげん(新聞・かみ・ダンボール・びん・かん・ペットボトル)", day: "月よう日", note: "1週に 1かい" },
      { kind: "プラスチック", day: "金よう日", note: "1週に 1かい" },
      { kind: "もやさない ごみ", day: "火よう日(2週に 1かい)", note: "日づけは 区の ひょうを 見てください" },
    ],
    gomiCaution: "マンションに よって ちがう ことが あります。ごみおきばの かんばんを 見てください。",
    gomiTimeNote: "ごみを だす日の あさ 8時までに ごみおきばに だしてください。",
    gomiScheduleLink: "ごみを だす日の ひょう(みどり区)",

    sortTitle: "ごみの わけかた",
    sortIntro: "4つに わけます。",
    sortGroups: [
      { name: "もやす ごみ(水・土)", items: "たべもののごみ、紙おむつ、ゴム、かわ製品、たまごのから" },
      { name: "しげん(月)", items: "新聞、雑誌、ダンボール、びん、かん、ペットボトル。※中を あらってください" },
      { name: "プラスチック(金)", items: "レジぶくろ、ふた、ラベル、おべんとうの ようき。※よごれを おとしてください" },
      { name: "もやさない ごみ(2週に1かい 火)", items: "でんち、けいこうとう、スプレーかん、ライター、せともの、小さい かでん" },
    ],
    sortPdfLink: "やさしい日本語の どうが(ごみの わけかた)",
    sortCalendarLink: "ごみの カレンダー(みどり区・PDF)",
    sortPdfOldNote: "",

    rulesTitle: "ごきんじょと なかよく するための 7つの こと",
    rulesIntro: "この 7つを まもれば、だいたい だいじょうぶです。",
    rules: [
      { point: "① あさ 8時までに だす。まえの日の よるは だめ", detail: "よるに だすと、カラスが あらして 道が よごれます。" },
      { point: "② 中が 見える ふくろ(とうめい)で、90リットルまで", detail: "くろい ふくろは だめです。中が 見えないと もっていって もらえません。" },
      { point: "③ もやさない ごみは 3つに わけて、とうめいな ふくろに", detail: "①でんち・けいこうとう ②スプレーかん・ライター ③せともの・ガラス・小さい 金ぞく。まぜると 火事に なります。" },
      { point: "④ びん・かん・ペットボトルは 水で あらう", detail: "中が よごれていると、虫が きます。あぶらが とれない プラスチックは もやす ごみです。" },
      { point: "⑤ 30cmより 大きい ものは「そだいごみ」。もうしこみが いります", detail: "ふとん・カーペットも そだいごみです。おかねが かかります。そのまま だすと もっていって もらえません。" },
      { point: "⑥ みどり町三丁目は「第2地区」。ばしょで 曜日が ちがいます", detail: "まえに すんでいた ところの 曜日で だすと、もっていって もらえません。" },
      { point: "⑦ エアコン・テレビ・れいぞうこ・せんたくきは 区では とりません", detail: "でんわ(0570-087200)して ください。はもの・ガラスは 紙に つつんで「キケン」と 書いて ください。" },
    ],
    naviTitle: "こまった ときは(6つの ことば)",
    naviDesc:
      "「これは なにごみ?」と こまったら、LINEの「ごみ分別ナビ(サンプル)」が べんりです。日本語・英語・中国語・韓国語・タガログ語・ベトナム語が つかえます。しゃしんを おくると AIが おしえて くれます。",
    naviLineLink: "LINEで「ごみ分別ナビ(サンプル)」を ともだちに ついかする",
    naviChatbotLink: "ウェブの チャットボット(日本語だけ)",
    sodaiNote: "そだいごみの もうしこみ: 03-6431-9997(月〜土 8:00〜19:00)",

    bosaiTitle: "ひなんの じょうほう",
    hinanbashoLabel: "ひなん場所(ばしょ)= 大きな 火事から にげる ところ",
    hinanbashoValue: "みどり町中央公園(かめいど ちゅうおう こうえん)",
    kyotenNote: "きょてん ひなん所(小学校・中学校)",
    openMap: "ちずで 見る",
    hinanbashoNote: "みどり町4・5・7・8・9丁目の 人は みどり町中央公園に にげます。",
    hinanjoLabel: "ひなん所(じょ)= いえに すめなく なったとき とまる ところ",
    hinanjoNote: "近くの 小学校・中学校が 第一(だいいち)の ひなん所です。近くには つぎの ところが あります。",
    hinanjoNear: NEAR_SHELTERS,
    hazardLabel: "ハザードマップ(水が くる きけんの ちず)",
    hazardNote: "みどり区は 土地が ひくいので、大あめの とき 水が くる ことが あります。まえに しらべて ください。",
    hazardMapLink: "水害(すいがい)ハザードマップ",
    bosaiMapLink: "ぼうさいマップ(いろいろな ことば)",
    hinanjoLink: "ひなん所の ひょう(みどり区)",
    hzFlood: "こうずい(川の 水が あふれる)の ちず",
    hzRain: "大あめで 水が たまる ちず",
    hzSurge: "たかしお(海の 水が くる)の ちず",
    hzBooklet: "にげかたの 本(ブックレット)",
    hzFallbackNote: "",
    alertTitle: "さいがいの おしらせの うけとりかた",
    alertDesc: "メールを 見ない人でも うけとれる ほうほうが あります。",
    alertX: "X(ツイッター) @area_bosai — とうろく しなくても 読めます",
    alertPortal: "みどり区 ぼうさいポータル(アプリ なしで 見られます)",
    alertMail: "こうとう安全安心メールに とうろくする",
    alertApp: "みどり区 ぼうさいアプリ(iPhone / Android)",
    alertSafetyTips: "Safety tips(15の ことば・むりょうの アプリ)",
    alertSafetyTipsNote: "地しん・つなみ・大あめの おしらせを 15の ことばで しらせて くれます。",
    alertJma: "気象庁(きしょうちょう)の いろいろな ことばの ページ",
  },

  en: {
    tab: "Living Guide",
    intro:
      "Garbage disposal and disaster-preparedness basics for residents of Kairanban 7-chome, based on official Area City information.",
    sourceNote: "Source: Area City official website (as of July 2026). Please check the links for the latest details.",

    gomiTitle: "Garbage & Recycling Collection Days",
    gomiArea: "Kairanban 7-chome is in District 2 (Kairanban 4–9 chome).",
    gomiHeadKind: "Type",
    gomiHeadDay: "Collection day",
    gomiRows: [
      { kind: "Burnable garbage", day: "Wednesday & Saturday", note: "Twice a week" },
      {
        kind: "Recyclables (newspaper, paper, cardboard, bottles, cans, PET bottles)",
        day: "Monday",
        note: "Once a week",
      },
      { kind: "Plastics", day: "Friday", note: "Once a week" },
      { kind: "Non-burnable garbage", day: "Tuesday (every other week)", note: "Check the city list for exact dates" },
    ],
    gomiCaution:
      "Some apartment buildings and areas have different days. Please also check the sign at your collection point.",
    gomiTimeNote:
      "Put your garbage out at the collection point by 8:00 a.m. on collection day. Please avoid putting garbage out during typhoons or severe weather.",
    gomiScheduleLink: "Full collection calendar (Area City, with bi-weekly dates)",

    sortTitle: "How to Sort Your Garbage",
    sortIntro: "Area City uses four categories.",
    sortGroups: [
      {
        name: "Burnable (Wed & Sat)",
        items: "Food waste, paper diapers, rubber, leather, shells and eggshells, small branches, dirty plastics",
      },
      {
        name: "Recyclables (Mon)",
        items:
          "Newspaper, magazines and mixed paper, cardboard, glass bottles, cans, PET bottles, foam trays. Separate by type; rinse bottles and cans.",
      },
      {
        name: "Plastics (Fri)",
        items:
          "100% plastic items and anything with the 'pura' mark (shopping bags, caps, labels, bento containers). Rinse off dirt and oil.",
      },
      {
        name: "Non-burnable (every other Tue)",
        items:
          "(1) Batteries, fluorescent tubes, mercury products (2) Flammable items (aerosol cans, lighters) (3) Ceramics, small appliances, glass, kettles. Separate into these 3 groups in clear bags.",
      },
    ],
    sortPdfLink: "Full sorting guide in English (Area City PDF)",
    sortCalendarLink: "Collection calendar in English (Area City PDF)",
    sortPdfOldNote: "",

    rulesTitle: "7 points that prevent almost every neighbour complaint",
    rulesIntro:
      "Kairanban 7-chome has many apartment buildings sharing the same collection points. Follow these seven and you will avoid nearly all problems.",
    rules: [
      {
        point: "1. Put it out by 8:00 a.m. — never the night before",
        detail:
          "Garbage left overnight gets torn open by crows and cats and scatters across the street. It is also a fire risk. Do not put garbage out on typhoon or severe-weather days.",
      },
      {
        point: "2. Use a see-through (clear or translucent) bag, 90 litres maximum",
        detail:
          "Black bags and opaque shopping bags will not be collected because the contents cannot be checked. A container with a lid is also fine. (The 90-litre limit appears only in the Japanese leaflet, but it applies to everyone.)",
      },
      {
        point: "3. Split non-burnables into 3 groups, each in its own clear bag",
        detail:
          "(1) batteries, fluorescent tubes, mercury items (2) aerosol cans, gas cartridges, lighters (3) ceramics, glass, small metal. Mixing them causes fires in the collection truck. Use up aerosol cans completely — do NOT pierce them.",
      },
      {
        point: "4. Rinse bottles and cans; wash dirt and oil off plastics",
        detail:
          "Leftover contents cause smell and insects. If oil will not come off the plastic, put it in burnable garbage instead.",
      },
      {
        point: "5. Anything about 30 cm or larger is 'oversized' — booking and a paid sticker are required",
        detail:
          "Duvets, carpets and bed pads count as oversized too. If you just leave them at the collection point they will not be taken. Book by phone or online first.",
      },
      {
        point: "6. Kairanban 7-chome is District 2 — days differ by district",
        detail:
          "Even within Area City, a different chome means different collection days. Using the schedule from where you lived before means your garbage will not be collected.",
      },
      {
        point: "7. Air conditioners, TVs, fridges, washing machines and dryers are NOT collected by the city",
        detail:
          "These fall under the Home Appliance Recycling Act — call the recycling centre on 0570-087200. Wrap knives and broken glass in paper and write 'キケン' (danger) on it.",
      },
    ],
    naviTitle: "Not sure which category? (6 languages)",
    naviDesc:
      "The city's AI sorting assistant 'Area Gomi Navi' runs on LINE and supports Japanese, English, Chinese, Korean, Tagalog and Vietnamese. Search by item name, or just send a photo and the AI will tell you. After adding it, set your language and district from the menu.",
    naviLineLink: "Add 'Area Gomi Navi' on LINE",
    naviChatbotLink: "Web chatbot (Japanese only)",
    sodaiNote: "Oversized waste booking: 03-6431-9997 (Mon–Sat 8:00–19:00)",

    bosaiTitle: "Disaster Preparedness & Evacuation",
    hinanbashoLabel: "Evacuation Area (refuge from large fires after a major earthquake)",
    hinanbashoValue: "Kairanban Chuo Park (みどり町中央公園)",
    kyotenNote: "Main shelter (municipal school)",
    openMap: "Open in Maps",
    hinanbashoNote:
      "Kairanban 4, 5, 7, 8 and 9 chome are assigned to Kairanban Chuo Park (designated by Tokyo Metropolitan Government). Secure your safety first, and head there if fire is spreading.",
    hinanjoLabel: "Evacuation Shelter (where to stay if your home becomes unlivable)",
    hinanjoNote:
      "The city recommends your nearest municipal elementary or junior high school as first choice. Follow your neighborhood association's designation if one exists. Facilities near Kairanban 7-chome:",
    hinanjoNear: NEAR_SHELTERS,
    hazardLabel: "Hazard Map (flood risk)",
    hazardNote:
      "Area City sits at low elevation and can flood during heavy rain or storm surge. Please check in advance how deeply your area could flood.",
    hazardMapLink: "Area City Flood Hazard Map",
    bosaiMapLink: "Area City Disaster Map (multilingual versions available)",
    hinanjoLink: "Full shelter list (Area City)",
    hzFlood: "Flood hazard map (Arakawa river overflow)",
    hzRain: "Heavy-rain / inland flooding hazard map",
    hzSurge: "Storm surge hazard map",
    hzBooklet: "Flood & storm surge booklet (how to evacuate)",
    hzFallbackNote: "",
    alertTitle: "How to receive disaster alerts",
    alertDesc:
      "Area City's email alert service supports Japanese, English, Chinese and Korean. Other options below work without email.",
    alertX: "X (Twitter) @area_bosai — readable without signing up (Japanese)",
    alertPortal: "Area City Disaster Portal (map view, no app needed)",
    alertMail: "Register for Area Safety and Security Mail",
    alertApp: "Area City Disaster App (iPhone / Android)",
    alertSafetyTips: "Safety tips (15 languages, free app)",
    alertSafetyTipsNote:
      "Free app supervised by the Japan Tourism Agency. Push alerts for earthquakes, tsunami, weather warnings and evacuation orders in 15 languages.",
    alertJma: "Japan Meteorological Agency multilingual warnings",
  },

  zh: {
    tab: "生活信息",
    intro: "面向龟户七丁目居民的垃圾投放与防灾基本信息,依据江东区官方资料整理。",
    sourceNote: "来源:江东区官方网站(2026年7月)。最新信息请查看各链接。",

    gomiTitle: "垃圾・资源回收日",
    gomiArea: "龟户七丁目属于「第2地区」(龟户4〜9丁目)。",
    gomiHeadKind: "种类",
    gomiHeadDay: "回收日",
    gomiRows: [
      { kind: "可燃垃圾", day: "周三・周六", note: "每周2次" },
      { kind: "资源(报纸・杂纸・纸箱・瓶・罐・塑料瓶等)", day: "周一", note: "每周1次" },
      { kind: "塑料", day: "周五", note: "每周1次" },
      { kind: "不可燃垃圾", day: "周二(隔周)", note: "每两周1次,具体日期请查看区的一览表" },
    ],
    gomiCaution: "部分公寓和地区的回收日可能不同,请同时确认垃圾集中点的告示牌。",
    gomiTimeNote: "请在回收日早上8点前投放到垃圾集中点。台风等恶劣天气时请勿投放。",
    gomiScheduleLink: "回收日一览(江东区・含隔周日期)",

    sortTitle: "垃圾分类方法",
    sortIntro: "江东区分为以下4类。",
    sortGroups: [
      { name: "可燃垃圾(三・六)", items: "厨余垃圾、纸尿裤、橡胶制品、皮革制品、贝壳蛋壳、少量枝叶、洗不净的塑料" },
      { name: "资源(一)", items: "报纸、杂志杂纸、纸箱、玻璃瓶、罐、塑料瓶、泡沫托盘。※分类投放,瓶罐请清空冲洗" },
      { name: "塑料(五)", items: "100%塑料制品、带有塑料标识的物品(购物袋、瓶盖、标签、便当盒)。※请去除污渍油分" },
      { name: "不可燃垃圾(隔周二)", items: "①电池・荧光灯・含汞制品 ②易燃品(卡式罐・喷雾罐・打火机) ③陶瓷・小型家电・玻璃・水壶。※分3类装入透明袋" },
    ],
    sortPdfLink: "中文版分类指南(江东区PDF・中韩对照)",
    sortCalendarLink: "中文版收集日历(江东区PDF)",
    sortPdfOldNote: "",

    rulesTitle: "避免邻里纠纷的7个要点",
    rulesIntro: "龟户七丁目公寓较多,大家共用垃圾集中点。遵守这7点,基本可以避免所有纠纷。",
    rules: [
      { point: "① 当天早上8点前投放,前一晚不要放", detail: "夜间投放会被乌鸦和猫抓破,散落一地,也有引发纵火的风险。台风等恶劣天气请勿投放。" },
      { point: "② 使用可看见内容物的透明/半透明袋,最多90升", detail: "黑色袋子无法确认内容物,不会被收走。带盖容器也可以。(90升的限制仅记载于日文版,但同样适用。)" },
      { point: "③ 不可燃垃圾分成3类,分别装入透明袋", detail: "①电池・荧光灯・含汞物品 ②喷雾罐・卡式气罐・打火机 ③陶瓷・玻璃・小型金属。混装会导致垃圾车起火。喷雾罐请用尽内容物,切勿穿孔。" },
      { point: "④ 瓶罐请冲洗,塑料请去除污渍油分", detail: "残留内容物会产生异味和虫害。油污洗不掉的塑料请作为可燃垃圾投放。" },
      { point: "⑤ 边长约30cm以上为「大型垃圾」,需预约并购买处理券", detail: "被子、地毯、床垫也属于大型垃圾。直接放在集中点不会被收走,请先电话或网上预约。" },
      { point: "⑥ 龟户七丁目属于「第2地区」,各地区收集日不同", detail: "即使同在江东区,丁目不同收集日也不同。按以前住处的日子投放不会被收走。" },
      { point: "⑦ 空调・电视・冰箱・洗衣机・干衣机区里不回收", detail: "属于家电回收法对象,请致电家电回收受理中心(0570-087200)。刀具和碎玻璃请用纸包好并注明「キケン」(危险)。" },
    ],
    naviTitle: "不确定时(支持6种语言)",
    naviDesc:
      "江东区的AI分类助手「江东垃圾导航」在LINE上提供服务,支持日语、英语、中文、韩语、他加禄语、越南语。可按物品名称检索,也可以发送照片由AI判断。添加好友后,请在菜单中设置语言和地区。",
    naviLineLink: "在LINE上添加「江东垃圾导航」",
    naviChatbotLink: "网页版聊天机器人(仅日语)",
    sodaiNote: "大型垃圾预约: 03-6431-9997(周一〜周六 8:00〜19:00)",

    bosaiTitle: "防灾・避难信息",
    hinanbashoLabel: "避难场所(大地震后躲避大规模火灾的地方)",
    hinanbashoValue: "龟户中央公园(みどり町中央公園)",
    kyotenNote: "重点避难所(区立中小学)",
    openMap: "在地图中查看",
    hinanbashoNote: "龟户4・5・7・8・9丁目被指定前往龟户中央公园(东京都指定)。请先确保自身安全,火势蔓延时再前往。",
    hinanjoLabel: "避难所(住宅无法居住时的停留场所)",
    hinanjoNote: "区推荐以最近的区立中小学为第一选择。若町会已事先指定,请遵照其安排。龟户七丁目附近有以下设施:",
    hinanjoNear: NEAR_SHELTERS,
    hazardLabel: "灾害风险地图(了解水灾危险)",
    hazardNote: "江东区地势较低,暴雨或风暴潮时可能积水。请提前确认您所在位置的浸水风险。",
    hazardMapLink: "江东区水灾风险地图",
    bosaiMapLink: "江东区防灾地图(有多语言版)",
    hinanjoLink: "避难所一览(江东区)",
    hzFlood: "洪水(荒川泛滥)风险地图",
    hzRain: "暴雨内涝风险地图",
    hzSurge: "风暴潮风险地图",
    hzBooklet: "洪水・风暴潮手册(避难方法)",
    hzFallbackNote: "",
    alertTitle: "灾害信息的接收方式",
    alertDesc: "除了区里的邮件服务,还有不用邮件也能接收的方式。",
    alertX: "X(推特)@area_bosai — 无需注册即可阅读(日语)",
    alertPortal: "江东区防灾门户(地图显示・无需安装应用)",
    alertMail: "注册area安全安心邮件",
    alertApp: "江东区防灾应用(iPhone / Android)",
    alertSafetyTips: "Safety tips(15种语言・免费应用)",
    alertSafetyTipsNote:
      "由日本观光厅监制的免费应用。以15种语言推送地震、海啸、气象警报和避难信息。",
    alertJma: "气象厅多语言警报页面",
  },

  vi: {
    tab: "Thông tin đời sống",
    intro:
      "Thông tin cơ bản về cách đổ rác và phòng chống thiên tai dành cho cư dân Kairanban 7-chome, dựa trên thông tin chính thức của quận Area.",
    sourceNote: "Nguồn: trang chính thức quận Area (tháng 7/2026). Vui lòng xem các liên kết để biết thông tin mới nhất.",

    gomiTitle: "Ngày thu gom rác và tài nguyên tái chế",
    gomiArea: "Kairanban 7-chome thuộc «Khu vực 2» (Kairanban 4–9 chome).",
    gomiHeadKind: "Loại",
    gomiHeadDay: "Ngày thu gom",
    gomiRows: [
      { kind: "Rác cháy được", day: "Thứ Tư & Thứ Bảy", note: "2 lần/tuần" },
      { kind: "Tài nguyên (báo, giấy, bìa carton, chai lọ, lon, chai nhựa PET)", day: "Thứ Hai", note: "1 lần/tuần" },
      { kind: "Nhựa", day: "Thứ Sáu", note: "1 lần/tuần" },
      { kind: "Rác không cháy được", day: "Thứ Ba (2 tuần 1 lần)", note: "Xem lịch của quận để biết ngày cụ thể" },
    ],
    gomiCaution:
      "Một số chung cư và khu vực có ngày khác. Vui lòng kiểm tra bảng thông báo tại điểm tập kết rác.",
    gomiTimeNote:
      "Hãy mang rác ra điểm tập kết trước 8 giờ sáng ngày thu gom. Không đổ rác vào ngày bão hoặc thời tiết xấu.",
    gomiScheduleLink: "Lịch thu gom đầy đủ (quận Area)",

    sortTitle: "Cách phân loại rác",
    sortIntro: "Quận Area phân thành 4 loại.",
    sortGroups: [
      { name: "Rác cháy được (Tư & Bảy)", items: "Rác thực phẩm, tã giấy, cao su, da, vỏ sò vỏ trứng, cành lá nhỏ, nhựa bẩn" },
      {
        name: "Tài nguyên (Thứ Hai)",
        items: "Báo, tạp chí và giấy hỗn hợp, bìa carton, chai thủy tinh, lon, chai PET, khay xốp. Phân loại riêng, rửa sạch chai lon.",
      },
      {
        name: "Nhựa (Thứ Sáu)",
        items: "Sản phẩm nhựa 100% và đồ có ký hiệu «pura» (túi nilon, nắp, nhãn, hộp cơm). Rửa sạch dầu mỡ.",
      },
      {
        name: "Không cháy được (Thứ Ba cách tuần)",
        items:
          "(1) Pin, bóng đèn huỳnh quang, sản phẩm thủy ngân (2) Đồ dễ cháy nổ (bình xịt, bật lửa) (3) Gốm sứ, đồ điện nhỏ, thủy tinh, ấm. Chia 3 nhóm, đựng túi trong suốt.",
      },
    ],
    sortPdfLink: "Hướng dẫn phân loại tiếng Việt (PDF quận Area)",
    sortCalendarLink: "Lịch thu gom (PDF quận Area — bản tiếng Anh)",
    sortPdfOldNote:
      "※ Bản tiếng Việt là phiên bản tháng 3/2025, có thể cũ hơn bản tiếng Nhật mới nhất. Nếu khác nhau, hãy theo bản tiếng Nhật hoặc hỏi Area Gomi Navi.",

    rulesTitle: "7 điều giúp tránh mọi mâu thuẫn với hàng xóm",
    rulesIntro:
      "Kairanban 7-chome có nhiều chung cư dùng chung điểm tập kết rác. Chỉ cần làm đúng 7 điều này là hầu như không xảy ra vấn đề.",
    rules: [
      {
        point: "1. Mang rác ra trước 8 giờ sáng — tuyệt đối không để từ tối hôm trước",
        detail:
          "Rác để qua đêm sẽ bị quạ và mèo xé rách, vương vãi ra đường, và còn có nguy cơ bị phóng hỏa. Không đổ rác vào ngày bão hoặc thời tiết xấu.",
      },
      {
        point: "2. Dùng túi nhìn thấy được bên trong (trong suốt), tối đa 90 lít",
        detail:
          "Túi đen hoặc túi nilon đục sẽ không được thu gom vì không kiểm tra được bên trong. Thùng có nắp cũng được. (Giới hạn 90 lít chỉ ghi trong bản tiếng Nhật nhưng áp dụng cho tất cả.)",
      },
      {
        point: "3. Rác không cháy chia làm 3 nhóm, mỗi nhóm một túi trong suốt",
        detail:
          "(1) pin, bóng đèn huỳnh quang, đồ chứa thủy ngân (2) bình xịt, bình gas mini, bật lửa (3) gốm sứ, thủy tinh, kim loại nhỏ. Trộn lẫn sẽ gây cháy xe thu gom. Dùng hết bình xịt — KHÔNG đục lỗ.",
      },
      {
        point: "4. Rửa sạch chai lọ, lon; lau sạch dầu mỡ trên đồ nhựa",
        detail:
          "Còn sót thức ăn sẽ gây mùi và côn trùng. Nhựa không rửa sạch được dầu thì bỏ vào rác cháy được.",
      },
      {
        point: "5. Đồ lớn hơn khoảng 30cm là «rác cỡ lớn» — phải đăng ký trước và mua tem",
        detail:
          "Chăn, thảm, đệm cũng tính là rác cỡ lớn. Để nguyên ở điểm tập kết sẽ không được thu gom. Hãy đăng ký qua điện thoại hoặc mạng trước.",
      },
      {
        point: "6. Kairanban 7-chome thuộc «Khu vực 2» — mỗi khu vực có ngày khác nhau",
        detail:
          "Ngay trong quận Area, khác chome là khác ngày thu gom. Đổ theo lịch nơi ở cũ thì rác sẽ không được lấy đi.",
      },
      {
        point: "7. Máy lạnh, TV, tủ lạnh, máy giặt, máy sấy KHÔNG được quận thu gom",
        detail:
          "Thuộc Luật tái chế đồ điện gia dụng — gọi trung tâm tái chế 0570-087200. Dao và mảnh thủy tinh phải bọc giấy và ghi «キケン» (nguy hiểm).",
      },
    ],
    naviTitle: "Không chắc loại nào? (6 ngôn ngữ)",
    naviDesc:
      "Trợ lý AI phân loại rác «Area Gomi Navi» của quận hoạt động trên LINE, hỗ trợ tiếng Nhật, Anh, Trung, Hàn, Tagalog và Việt. Tra theo tên đồ vật, hoặc chỉ cần gửi ảnh để AI trả lời. Sau khi thêm bạn, hãy chọn ngôn ngữ và khu vực trong menu.",
    naviLineLink: "Thêm «Area Gomi Navi» trên LINE",
    naviChatbotLink: "Chatbot web (chỉ tiếng Nhật)",
    sodaiNote: "Đăng ký rác cỡ lớn: 03-6431-9997 (T2–T7, 8:00–19:00)",

    bosaiTitle: "Phòng chống thiên tai và sơ tán",
    hinanbashoLabel: "Khu vực lánh nạn (tránh hỏa hoạn lớn sau động đất mạnh)",
    hinanbashoValue: "Công viên Kairanban Chuo (みどり町中央公園)",
    kyotenNote: "Nơi trú ẩn chính (trường công lập)",
    openMap: "Mở bản đồ",
    hinanbashoNote:
      "Kairanban 4, 5, 7, 8, 9 chome được chỉ định đến công viên Kairanban Chuo (do Tokyo chỉ định). Hãy đảm bảo an toàn trước, và di chuyển khi hỏa hoạn lan rộng.",
    hinanjoLabel: "Nơi trú ẩn (khi nhà không thể ở được)",
    hinanjoNote:
      "Quận khuyến nghị chọn trường tiểu học/THCS công lập gần nhất. Nếu hội tự quản đã chỉ định, hãy theo đó. Các cơ sở gần Kairanban 7-chome:",
    hinanjoNear: NEAR_SHELTERS,
    hazardLabel: "Bản đồ nguy cơ (rủi ro ngập lụt)",
    hazardNote:
      "Quận Area có địa hình thấp, có thể ngập khi mưa lớn hoặc nước dâng do bão. Hãy kiểm tra trước mức ngập có thể xảy ra nơi bạn ở.",
    hazardMapLink: "Bản đồ nguy cơ ngập lụt quận Area",
    bosaiMapLink: "Bản đồ phòng chống thiên tai quận Area (có bản đa ngôn ngữ)",
    hinanjoLink: "Danh sách nơi trú ẩn (quận Area)",
    hzFlood: "Bản đồ nguy cơ lũ (sông Arakawa tràn bờ)",
    hzRain: "Bản đồ nguy cơ ngập do mưa lớn",
    hzSurge: "Bản đồ nguy cơ nước dâng do bão",
    hzBooklet: "Sổ tay lũ lụt & nước dâng (cách sơ tán)",
    hzFallbackNote:
      "※ Quận Area KHÔNG có bản đồ nguy cơ tiếng Việt. Các liên kết dưới đây là bản tiếng Anh. Để nhận cảnh báo bằng tiếng Việt, hãy dùng ứng dụng Safety tips bên dưới.",
    alertTitle: "Cách nhận thông tin thiên tai",
    alertDesc:
      "Dịch vụ email của quận chỉ có tiếng Nhật, Anh, Trung, Hàn — KHÔNG có tiếng Việt. Hãy dùng Safety tips để nhận cảnh báo bằng tiếng Việt.",
    alertX: "X (Twitter) @area_bosai — đọc được không cần đăng ký (tiếng Nhật)",
    alertPortal: "Cổng phòng chống thiên tai quận Area (bản đồ, không cần cài app)",
    alertMail: "Đăng ký Area Safety and Security Mail (không có tiếng Việt)",
    alertApp: "Ứng dụng phòng chống thiên tai quận Area (không có tiếng Việt)",
    alertSafetyTips: "⭐ Safety tips (15 ngôn ngữ, có tiếng Việt — MIỄN PHÍ)",
    alertSafetyTipsNote:
      "Ứng dụng miễn phí do Tổng cục Du lịch Nhật Bản giám sát. Thông báo đẩy về động đất, sóng thần, cảnh báo thời tiết và lệnh sơ tán BẰNG TIẾNG VIỆT. Đây là lựa chọn tốt nhất cho người Việt.",
    alertJma: "Cảnh báo thời tiết tiếng Việt (Cơ quan Khí tượng Nhật Bản)",
  },
};
