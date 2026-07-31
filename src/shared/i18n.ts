// 公開PWAの多言語辞書(日本語・やさしい日本語・英語・簡体字中国語・ベトナム語)
import { ORG } from "./org";
export type PubLang = "ja" | "ja-easy" | "en" | "zh" | "vi";

export const PUB_LANGS: { code: PubLang; label: string }[] = [
  { code: "ja", label: "日本語" },
  { code: "ja-easy", label: "やさしい日本語" },
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "vi", label: "Tiếng Việt" },
];

type Dict = {
  notices: string;
  noNotices: string;
  deadline: string;
  published: string;
  back: string;
  loading: string;
  machineNote: string;
  memberLink: string;
  publicNote: string;
  loggedInNote: string; // ログイン中に出す文言(公開ページの案内と入れ替える)
  ads: string;
  joinChonai: string;
  joinKodomo: string;
  formSubmit: string;
  formSubmitted: string;
  areaTitle: string;
  areaDesc: string;
  areaMapCaption: string;
  areaMapZoneLabel: string;
  alertsTitle: string;
  alertsNote: string;
  alertsSource: string;
  alertsNone: string;
  alertsMachine: string;
  scopeKairanban: string;
  scopeNearby: string;
  scopeWard: string;
  unreadTitle: string;
  unreadNone: string;
  openCircular: string;
  // 入会申込フォーム(町内会・子ども会)
  fName: string;
  fKana: string;
  fAddress: string;
  fHousehold: string;
  fPhone: string;
  fMessage: string;
  fOptional: string;
  fRequired: string;
  chonaiFee: string;
  kodomoFee: string;
  kodomoIntro: string;
  fChild: string;
  fChildName: string;
  fGender: string;
  fMale: string;
  fFemale: string;
  fGrade: string;
  fAge: string;
  fAddChild: string;
  fHelperParent: string;
  fAddParent: string;
  fLineId: string;
  fConsent: string;
  errName: string;
  errPhone: string;
  errChild: string;
  errParent: string;
  errConsent: string;
  errSend: string;
  grades: string[]; // 値は日本語のまま送るが、表示だけ各言語で補う
  safetyTitle: string;
  safetyDesc: string;
  safetyLinkLabel: string;
};

export const PUB_DICT: Record<PubLang, Dict> = {
  ja: {
    notices: "町会からのお知らせ",
    noNotices: "現在、お知らせはありません。",
    deadline: "確認期限",
    published: "掲載日",
    back: "もどる",
    loading: "読み込み中…",
    machineNote: "",
    memberLink: "会員の方はこちら(ログイン)",
    publicNote: "どなたでもご覧いただけるページです。",
    loggedInNote: "ログイン中の画面です。",
    ads: "地域の広告(PR)",
    joinChonai: "町内会に入会申込",
    joinKodomo: "子ども会に入会申込",
    formSubmit: "申し込む",
    formSubmitted: "申込を受け付けました。担当者よりご連絡いたします。",
    areaTitle: `ここが${ORG.name}のエリアです`,
    areaDesc:
      "対象エリアにお住まいなら、あなたも会員になれます。ぜひご参加ください。",
    areaMapCaption: "📍は町会館(集会所)の場所です",
    areaMapZoneLabel: "会員対象エリア",
    alertsTitle: "地域と近隣の安全・防災のお知らせ",
    alertsNote: "みどり町と近隣に関係するものだけを表示しています。",
    alertsSource: "出典: こうとう安全安心メール(みどり区)",
    alertsNone: "今、みどり町周辺に関係するお知らせはありません。",
    alertsMachine: "",
    scopeKairanban: "みどり町",
    scopeNearby: "近隣",
    scopeWard: "みどり区全体",
    unreadTitle: "未確認の回覧",
    unreadNone: "未確認の回覧はありません。",
    openCircular: "開いて確認する",
    fName: "お名前",
    fKana: "ふりがな",
    fAddress: "ご住所",
    fHousehold: "世帯人数",
    fPhone: "お電話番号",
    fMessage: "メッセージ",
    fOptional: "任意",
    fRequired: "必須",
    chonaiFee: "会費について: 月額300円×12ヶ月＝年会費3,600円",
    kodomoFee: "年会費600円/お子様1人",
    kodomoIntro:
      "会費をいただいてからの入会となります。全国子ども会連合の保険に加入するため、下記をご記入ください。",
    fChild: "お子様",
    fChildName: "お子様のお名前",
    fGender: "性別",
    fMale: "男",
    fFemale: "女",
    fGrade: "学年",
    fAge: "年齢",
    fAddChild: "＋ お子様を追加",
    fHelperParent: "お手伝いいただける保護者様",
    fAddParent: "＋ 保護者を追加",
    fLineId: "保護者様LINE ID",
    fConsent: "全国子ども会連合の保険加入について、上記の記入内容で同意します",
    errName: "お名前を入力してください",
    errPhone: "電話番号を、市外局番から入力してください",
    errChild: "お子様のお名前を1名以上入力してください",
    errParent: "お手伝いいただける保護者様のお名前を1名以上入力してください",
    errConsent: "保険加入についての同意にチェックしてください",
    errSend: "送信に失敗しました",
    grades: ["年少", "年中", "年長", "小学1年生", "小学2年生", "小学3年生", "小学4年生", "小学5年生", "小学6年生"],
    safetyTitle: "地域の防犯・防災情報",
    safetyDesc:
      "みどり区のこうとう安全安心メールに登録すると、みどり町周辺の防犯情報(不審者情報など)や防災情報(地震・水害・気象警報など)を無料でメールで受け取れます。",
    safetyLinkLabel: "登録方法を見る(みどり区公式サイト)",
  },
  "ja-easy": {
    notices: "町内会(ちょうないかい)からの おしらせ",
    noNotices: "いま、おしらせは ありません。",
    deadline: "いつまでに 読んでください",
    published: "のせた日",
    back: "もどる",
    loading: "よみこみ中…",
    machineNote: "これは きかいが やさしい日本語に なおした文です。ただしい内容は 日本語のページを 見てください。",
    memberLink: "会員(かいいん)の人は こちら",
    publicNote: "だれでも 見ることが できるページです。",
    loggedInNote: "ログイン ちゅうの がめんです。",
    ads: "この地いきの おみせの おしらせ(PR)",
    joinChonai: "町内会(ちょうないかい)に 入る もうしこみ",
    joinKodomo: "子ども会(こどもかい)に 入る もうしこみ",
    formSubmit: "もうしこむ",
    formSubmitted: "もうしこみを うけつけました。あとで れんらくします。",
    areaTitle: `ここが ${ORG.name}の ばしょです`,
    areaDesc:
      "たいしょうの エリアに すんでいる人は、会員(かいいん)に なれます。ぜひ さんかして ください。",
    areaMapCaption: "📍は 町会館(ちょうかいかん)の ばしょです",
    areaMapZoneLabel: "会員(かいいん)に なれる ところ",
    alertsTitle: "この ちいきと まわりの あんぜんの おしらせ",
    alertsNote: "みどり町と ちかくに かんけいする ものだけ 出しています。",
    alertsSource: "もとの じょうほう: こうとう安全安心メール(みどり区)",
    alertsNone: "いま、みどり町の ちかくに かんけいする おしらせは ありません。",
    alertsMachine: "これは きかいが やくした文です。",
    scopeKairanban: "みどり町",
    scopeNearby: "ちかく",
    scopeWard: "みどり区ぜんたい",
    unreadTitle: "まだ 見ていない 回覧(かいらん)",
    unreadNone: "まだ 見ていない 回覧は ありません。",
    openCircular: "ひらいて かくにんする",
    fName: "なまえ",
    fKana: "ふりがな",
    fAddress: "じゅうしょ",
    fHousehold: "いっしょに すむ 人の かず",
    fPhone: "でんわばんごう",
    fMessage: "つたえたいこと",
    fOptional: "書かなくても いいです",
    fRequired: "かならず 書いてください",
    chonaiFee: "おかね: 1か月 300円 × 12か月 = 1年で 3,600円",
    kodomoFee: "1年 600円(子ども 1人)",
    kodomoIntro: "おかねを はらってから 入れます。ほけんに 入るので 下を 書いてください。",
    fChild: "こども",
    fChildName: "こどもの なまえ",
    fGender: "せいべつ",
    fMale: "おとこ",
    fFemale: "おんな",
    fGrade: "がくねん",
    fAge: "ねんれい",
    fAddChild: "＋ こどもを ふやす",
    fHelperParent: "てつだって くれる おとなの人",
    fAddParent: "＋ おとなの人を ふやす",
    fLineId: "おとなの人の LINE ID",
    fConsent: "ほけんに 入ることに 同意(どうい)します",
    errName: "なまえを 書いてください",
    errPhone: "でんわ番号を さいしょから ぜんぶ 書いてください",
    errChild: "こどもの なまえを 1人いじょう 書いてください",
    errParent: "てつだう おとなの人を 1人いじょう 書いてください",
    errConsent: "ほけんの 同意に チェックを してください",
    errSend: "おくれませんでした",
    grades: ["年少(ようちえん 3〜4さい)", "年中(ようちえん 4〜5さい)", "年長(ようちえん 5〜6さい)", "小学1年生", "小学2年生", "小学3年生", "小学4年生", "小学5年生", "小学6年生"],
    safetyTitle: "この地いきの 安全(あんぜん)の おしらせ",
    safetyDesc:
      "みどり区(こうとうく)の こうとう安全安心(あんぜんあんしん)メールに とうろくすると、地しんや 台風(たいふう)などの おしらせを メールで もらえます。おかねは かかりません。",
    safetyLinkLabel: "とうろくの しかたを 見る",
  },
  en: {
    notices: "Notices from the Neighborhood Association",
    noNotices: "There are no notices at the moment.",
    deadline: "Please read by",
    published: "Posted",
    back: "Back",
    loading: "Loading…",
    machineNote:
      "This is a machine translation. Please refer to the Japanese page for the official text.",
    memberLink: "Members: log in here",
    publicNote: "This page is open to everyone.",
    loggedInNote: "You are signed in.",
    ads: "Local Ads (PR)",
    joinChonai: "Join the Neighborhood Association",
    joinKodomo: "Join the Children's Club",
    formSubmit: "Submit",
    formSubmitted: "Your application has been received. We will contact you.",
    areaTitle: "This is the area our association covers",
    areaDesc:
      "If you live in the covered area, you can become a member. We look forward to having you join us.",
    areaMapCaption: "📍 marks our community hall",
    areaMapZoneLabel: "Membership area",
    alertsTitle: "Safety & disaster notices for our area and nearby",
    alertsNote: "Only notices relevant to Kairanban and nearby areas are shown.",
    alertsSource: "Source: Area Safety and Security Mail (Area City)",
    alertsNone: "There are no current notices affecting the Kairanban area.",
    alertsMachine: "Machine-translated. The Japanese original is authoritative.",
    scopeKairanban: "Kairanban",
    scopeNearby: "Nearby",
    scopeWard: "Area City",
    unreadTitle: "Notices you have not confirmed",
    unreadNone: "You have confirmed everything. Thank you.",
    openCircular: "Open and confirm",
    fName: "Name",
    fKana: "Name in kana",
    fAddress: "Address",
    fHousehold: "Number of people in household",
    fPhone: "Phone number",
    fMessage: "Message",
    fOptional: "optional",
    fRequired: "required",
    chonaiFee: "Membership fee: 300 yen/month x 12 = 3,600 yen per year",
    kodomoFee: "600 yen per year, per child",
    kodomoIntro:
      "Membership starts once the fee is paid. Please fill in the details below so we can enroll your child in the national children's association insurance.",
    fChild: "Child",
    fChildName: "Child's name",
    fGender: "Gender",
    fMale: "Male",
    fFemale: "Female",
    fGrade: "School year",
    fAge: "Age",
    fAddChild: "+ Add a child",
    fHelperParent: "Parent who can help out",
    fAddParent: "+ Add a parent",
    fLineId: "Parent's LINE ID",
    fConsent:
      "I agree to enrollment in the national children's association insurance with the details above.",
    errName: "Please enter your name",
    errPhone: "Please enter the full phone number, including the area code",
    errChild: "Please enter at least one child's name",
    errParent: "Please enter at least one parent who can help",
    errConsent: "Please tick the insurance consent box",
    errSend: "Failed to send. Please try again.",
    grades: ["Nursery (age 3-4)", "Nursery (age 4-5)", "Kindergarten (age 5-6)", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
    safetyTitle: "Local Safety & Disaster Alerts",
    safetyDesc:
      "Register for Area City's free Area Safety and Security Mail service to receive crime-prevention and disaster alerts (earthquakes, flooding, weather warnings, and more) for the Kairanban area by email.",
    safetyLinkLabel: "See how to register (Area City official site)",
  },
  zh: {
    notices: "町内会通知",
    noNotices: "目前没有通知。",
    deadline: "请在此日期前阅读",
    published: "发布日期",
    back: "返回",
    loading: "加载中…",
    machineNote: "本页为机器翻译,准确内容请参阅日语页面。",
    memberLink: "会员请从这里登录",
    publicNote: "本页面对所有人开放。",
    loggedInNote: "您已登录。",
    ads: "本地广告(PR)",
    joinChonai: "申请加入町内会",
    joinKodomo: "申请加入儿童会",
    formSubmit: "提交申请",
    formSubmitted: "已收到您的申请,负责人将与您联系。",
    areaTitle: "这里就是我们町会的辖区",
    areaDesc:
      "只要您住在京叶道路以北的龟户七丁目,就可以成为会员。诚挚欢迎您的参与。",
    areaMapCaption: "📍为町会馆(活动中心)的位置",
    areaMapZoneLabel: "可入会区域",
    alertsTitle: "本地区及周边的安全・防灾通知",
    alertsNote: "仅显示与龟户及周边地区相关的通知。",
    alertsSource: "来源: area安全安心邮件(江东区)",
    alertsNone: "目前没有与龟户周边相关的通知。",
    alertsMachine: "本文为机器翻译,以日语原文为准。",
    scopeKairanban: "龟户",
    scopeNearby: "周边",
    scopeWard: "江东区全区",
    unreadTitle: "尚未确认的通知",
    unreadNone: "没有未确认的通知。",
    openCircular: "打开并确认",
    fName: "姓名",
    fKana: "假名读音",
    fAddress: "住址",
    fHousehold: "家庭人数",
    fPhone: "电话号码",
    fMessage: "留言",
    fOptional: "选填",
    fRequired: "必填",
    chonaiFee: "会费: 每月300日元 × 12个月 = 年会费3,600日元",
    kodomoFee: "年会费600日元/每位儿童",
    kodomoIntro: "缴纳会费后正式入会。为加入全国儿童会联合保险,请填写以下内容。",
    fChild: "儿童",
    fChildName: "儿童姓名",
    fGender: "性别",
    fMale: "男",
    fFemale: "女",
    fGrade: "年级",
    fAge: "年龄",
    fAddChild: "＋ 添加儿童",
    fHelperParent: "可以协助的家长",
    fAddParent: "＋ 添加家长",
    fLineId: "家长LINE ID",
    fConsent: "我同意以上述内容加入全国儿童会联合保险。",
    errName: "请输入姓名",
    errPhone: "请输入完整电话号码(含区号)",
    errChild: "请至少输入一位儿童的姓名",
    errParent: "请至少输入一位可协助的家长",
    errConsent: "请勾选保险同意项",
    errSend: "发送失败,请重试。",
    grades: ["幼儿园小班(3-4岁)", "幼儿园中班(4-5岁)", "幼儿园大班(5-6岁)", "小学1年级", "小学2年级", "小学3年级", "小学4年级", "小学5年级", "小学6年级"],
    safetyTitle: "本地防犯防灾信息",
    safetyDesc:
      "注册江东区的免费邮件服务area安全安心邮件,即可通过邮件接收龟户周边的防犯信息(可疑人员等)和防灾信息(地震、水灾、气象警报等)。",
    safetyLinkLabel: "查看注册方法(江东区官网)",
  },
  vi: {
    notices: "Thông báo từ Hội tự quản khu phố",
    noNotices: "Hiện tại không có thông báo nào.",
    deadline: "Vui lòng đọc trước ngày",
    published: "Ngày đăng",
    back: "Quay lại",
    loading: "Đang tải…",
    machineNote:
      "Đây là bản dịch máy. Vui lòng xem trang tiếng Nhật để biết nội dung chính thức.",
    memberLink: "Hội viên: đăng nhập tại đây",
    publicNote: "Trang này dành cho tất cả mọi người.",
    loggedInNote: "Bạn đã đăng nhập.",
    ads: "Quảng cáo địa phương (PR)",
    joinChonai: "Đăng ký tham gia Hội tự quản khu phố",
    joinKodomo: "Đăng ký tham gia Hội thiếu nhi",
    formSubmit: "Gửi đăng ký",
    formSubmitted: "Đã nhận được đăng ký của bạn. Chúng tôi sẽ liên hệ lại.",
    areaTitle: "Đây là khu vực thuộc Hội tự quản của chúng tôi",
    areaDesc:
      "Nếu bạn sống trong khu vực áp dụng, bạn có thể trở thành hội viên. Rất mong bạn tham gia cùng chúng tôi.",
    areaMapCaption: "📍 là vị trí nhà hội quán",
    areaMapZoneLabel: "Khu vực có thể gia nhập",
    alertsTitle: "Thông báo an toàn & thiên tai khu vực và lân cận",
    alertsNote: "Chỉ hiển thị thông báo liên quan đến Kairanban và khu vực lân cận.",
    alertsSource: "Nguồn: Area Safety and Security Mail (quận Area)",
    alertsNone: "Hiện không có thông báo nào ảnh hưởng đến khu vực Kairanban.",
    alertsMachine: "Bản dịch máy. Bản tiếng Nhật là bản chính thức.",
    scopeKairanban: "Kairanban",
    scopeNearby: "Lân cận",
    scopeWard: "Toàn quận Area",
    unreadTitle: "Thông báo bạn chưa xác nhận",
    unreadNone: "Bạn đã xác nhận tất cả. Cảm ơn bạn.",
    openCircular: "Mở và xác nhận",
    fName: "Họ và tên",
    fKana: "Cách đọc (kana)",
    fAddress: "Địa chỉ",
    fHousehold: "Số người trong hộ",
    fPhone: "Số điện thoại",
    fMessage: "Lời nhắn",
    fOptional: "không bắt buộc",
    fRequired: "bắt buộc",
    chonaiFee: "Hội phí: 300 yên/tháng × 12 tháng = 3.600 yên/năm",
    kodomoFee: "600 yên/năm cho mỗi trẻ",
    kodomoIntro:
      "Việc gia nhập bắt đầu sau khi đóng hội phí. Vui lòng điền thông tin dưới đây để đăng ký bảo hiểm của Liên đoàn Hội thiếu nhi toàn quốc.",
    fChild: "Trẻ em",
    fChildName: "Tên của trẻ",
    fGender: "Giới tính",
    fMale: "Nam",
    fFemale: "Nữ",
    fGrade: "Khối lớp",
    fAge: "Tuổi",
    fAddChild: "+ Thêm trẻ",
    fHelperParent: "Phụ huynh có thể hỗ trợ",
    fAddParent: "+ Thêm phụ huynh",
    fLineId: "LINE ID của phụ huynh",
    fConsent:
      "Tôi đồng ý đăng ký bảo hiểm của Liên đoàn Hội thiếu nhi toàn quốc với nội dung nêu trên.",
    errName: "Vui lòng nhập họ tên",
    errPhone: "Vui lòng nhập đầy đủ số điện thoại (kèm mã vùng)",
    errChild: "Vui lòng nhập tên của ít nhất một trẻ",
    errParent: "Vui lòng nhập ít nhất một phụ huynh hỗ trợ",
    errConsent: "Vui lòng đánh dấu đồng ý bảo hiểm",
    errSend: "Gửi thất bại. Vui lòng thử lại.",
    grades: ["Mẫu giáo (3-4 tuổi)", "Mẫu giáo (4-5 tuổi)", "Mẫu giáo lớn (5-6 tuổi)", "Lớp 1", "Lớp 2", "Lớp 3", "Lớp 4", "Lớp 5", "Lớp 6"],
    safetyTitle: "Thông tin an toàn và phòng chống thiên tai khu vực",
    safetyDesc:
      "Đăng ký dịch vụ email miễn phí Area Anzen Anshin Mail của quận Area để nhận cảnh báo phòng chống tội phạm và thiên tai (động đất, ngập lụt, cảnh báo thời tiết...) quanh khu vực Kairanban qua email.",
    safetyLinkLabel: "Xem cách đăng ký (trang chính thức quận Area)",
  },
};
