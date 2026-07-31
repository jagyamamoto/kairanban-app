// 公開PWA: 匿名・多言語のお知らせ+案内ページ(個人別既読は取らない)
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api";
import { useMe } from "../me";
import {
  GoogleLinkCard,
  MemberTodoCards,
  MyLevelCard,
  MyProfileCard,
  NotificationCard,
} from "./app/Home";
import { ROLE_LABELS } from "../../shared/labels";
import { PUB_DICT, PUB_LANGS, type PubLang } from "../../shared/i18n";
import { PRIVACY, PRIVACY_UPDATED } from "../../shared/privacy";
import {
  ALERT_LINKS,
  BOSAI_MAP_PDF,
  GOMI_CALENDAR_PDF,
  HAZARD_PDF,
  GOMI_GUIDE_PDF,
  HINANBASHO,
  KOTO_LINKS,
  LIFE_INFO,
  mapUrl,
} from "../../shared/lifeinfo";
import { fmtDate, fmtDateTime } from "../util";
import { ORG } from "../../shared/org";
import { useOverlay } from "../useOverlay";
import { useFormErrors } from "../formfocus";
import InstallGuide from "./InstallGuide";
import { Btn } from "../Btn";

type PubCircular = {
  id: number;
  case_no: string;
  title: string;
  body: string;
  deadline: string | null;
  published_at: string;
  image_url: string | null;
  translated: boolean;
  quality: string | null;
};

type PageSummary = { id: number; slug: string; title: string };
type PubPage = {
  id: number;
  slug: string;
  title: string;
  body: string;
  updated_at: string;
  translated: boolean;
  quality: string | null;
};

type Sponsor = {
  id: number;
  name: string;
  message: string;
  url: string | null;
  image_url: string | null;
};

// ハニーポット(人は入力しない隠しフィールド。ボット対策)
function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
      tabIndex={-1}
      aria-hidden="true"
      style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }}
    />
  );
}

function SubmittedCard({ label }: { label: string }) {
  return (
    <div className="card center">
      <div className="big-icon">📨</div>
      <p className="ok-note">{label}</p>
    </div>
  );
}

// 町内会入会申込(旧サイト実フォーム: 氏名・ふりがな・住所・世帯人数・電話・メッセージ。年会費3,600円/世帯)
// 学年の値は日本語のまま送る(役員が読むデータを変えない)。表示だけ各言語で補う。
const JA_GRADES = [
  "年少",
  "年中",
  "年長",
  "小学1年生",
  "小学2年生",
  "小学3年生",
  "小学4年生",
  "小学5年生",
  "小学6年生",
];

function ChonaiJoinForm({ title, submitLabel, submittedLabel, t }: {
  title: string;
  submitLabel: string;
  submittedLabel: string;
  t: (typeof PUB_DICT)[PubLang];
}) {
  const [name, setName] = useState("");
  const [kana, setKana] = useState("");
  const [address, setAddress] = useState("");
  const [householdSize, setHouseholdSize] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const { formRef, err, setErr, fail, clear, fieldProps } = useFormErrors();

  if (done) return <SubmittedCard label={submittedLabel} />;
  return (
    <div className="card" ref={formRef}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p className="muted">{t.chonaiFee}</p>
      {/* ラベルは htmlFor で入力欄と結びつける(文字を押しても入力でき、読み上げでも欄名が読まれる) */}
      <label htmlFor="cj-name">{t.fName}({t.fRequired})</label>
      <input
        id="cj-name"
        autoComplete="name"
        {...fieldProps("name")}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <label htmlFor="cj-kana">{t.fKana}({t.fOptional})</label>
      <input id="cj-kana" value={kana} onChange={(e) => setKana(e.target.value)} />
      <label htmlFor="cj-address">{t.fAddress}({t.fOptional})</label>
      <input
        id="cj-address"
        autoComplete="street-address"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="みどり町三丁目〜"
      />
      <label htmlFor="cj-household">{t.fHousehold}({t.fOptional})</label>
      <input
        id="cj-household"
        type="number"
        min={1}
        value={householdSize}
        onChange={(e) => setHouseholdSize(e.target.value)}
      />
      <label htmlFor="cj-phone">{t.fPhone}({t.fOptional})</label>
      <input
        id="cj-phone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        {...fieldProps("phone")}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <label htmlFor="cj-message">{t.fMessage}({t.fOptional})</label>
      <textarea id="cj-message" value={message} onChange={(e) => setMessage(e.target.value)} />
      <Honeypot value={hp} onChange={setHp} />
      {err && (
        <p className="error-box" role="alert">
          {err}
        </p>
      )}
      <Btn
        className="btn btn-primary"
        busy={busy}
        onClick={async () => {
          if (!name.trim()) return fail("name", t.errName);
          if (phone && phone.replace(/[^0-9]/g, "").length < 10)
            return fail("phone", t.errPhone);
          clear();
          setBusy(true);
          try {
            await api("/api/public/applications", {
              body: {
                kind: "chonai",
                name,
                kana,
                phone,
                address,
                message,
                hp,
                detail: householdSize ? { household_size: Number(householdSize) } : undefined,
              },
            });
            setDone(true);
          } catch (e) {
            setErr(e instanceof Error ? e.message : t.errSend);
          } finally {
            setBusy(false);
          }
        }}
      >
        {submitLabel}
      </Btn>
    </div>
  );
}

type ChildRow = { name: string; kana: string; gender: string; grade: string; age: string };
type ParentRow = { name: string; kana: string; age: string };
const GRADES = [
  "年少",
  "年中",
  "年長",
  "小学1年生",
  "小学2年生",
  "小学3年生",
  "小学4年生",
  "小学5年生",
  "小学6年生",
];
const EMPTY_CHILD: ChildRow = { name: "", kana: "", gender: "male", grade: "小学1年生", age: "" };
const EMPTY_PARENT: ParentRow = { name: "", kana: "", age: "" };

// 子ども会入会申込(旧サイト実フォーム: お子様複数名+お手伝い保護者(最低1名)+保護者LINE ID+保険同意。年会費600円/子)
function KodomoJoinForm({ title, submitLabel, submittedLabel, t }: {
  title: string;
  submitLabel: string;
  submittedLabel: string;
  t: (typeof PUB_DICT)[PubLang];
}) {
  const [children, setChildren] = useState<ChildRow[]>([{ ...EMPTY_CHILD }]);
  const [parents, setParents] = useState<ParentRow[]>([{ ...EMPTY_PARENT }]);
  const [lineId, setLineId] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const { formRef, err, setErr, bad, fail, clear, fieldProps } = useFormErrors();

  if (done) return <SubmittedCard label={submittedLabel} />;

  const updateChild = (i: number, patch: Partial<ChildRow>) =>
    setChildren((cur) => cur.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const updateParent = (i: number, patch: Partial<ParentRow>) =>
    setParents((cur) => cur.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  return (
    <div className="card" ref={formRef}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p className="muted">
        {t.kodomoFee}
        <br />
        {t.kodomoIntro}
      </p>

      {children.map((child, i) => (
        <div key={i} style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 8 }}>
          <h3 style={{ marginTop: 0 }}>{t.fChild} {i + 1}{i > 0 && `(${t.fOptional})`}</h3>
          <label htmlFor={`kc-name-${i}`}>{t.fChildName}</label>
          <input
            id={`kc-name-${i}`}
            {...fieldProps(`child-${i}`)}
            value={child.name}
            onChange={(e) => updateChild(i, { name: e.target.value })}
          />
          <label htmlFor={`kc-kana-${i}`}>{t.fKana}</label>
          <input
            id={`kc-kana-${i}`}
            value={child.kana}
            onChange={(e) => updateChild(i, { kana: e.target.value })}
          />
          <label htmlFor={`kc-gender-${i}`}>{t.fGender}</label>
          <select
            id={`kc-gender-${i}`}
            value={child.gender}
            onChange={(e) => updateChild(i, { gender: e.target.value })}
          >
            <option value="male">{t.fMale}</option>
            <option value="female">{t.fFemale}</option>
          </select>
          <label htmlFor={`kc-grade-${i}`}>{t.fGrade}</label>
          <select
            id={`kc-grade-${i}`}
            value={child.grade}
            onChange={(e) => updateChild(i, { grade: e.target.value })}
          >
            <option value=""></option>
            {JA_GRADES.map((g, gi) => (
              <option key={g} value={g}>
                {t.grades[gi] ?? g}
              </option>
            ))}
          </select>
          <label htmlFor={`kc-age-${i}`}>{t.fAge}({t.fOptional})</label>
          <input
            id={`kc-age-${i}`}
            type="number"
            min={0}
            max={12}
            value={child.age}
            onChange={(e) => updateChild(i, { age: e.target.value })}
          />
        </div>
      ))}
      {children.length < 4 && (
        <button
          className="btn btn-secondary btn-sm"
          style={{ marginTop: 8 }}
          onClick={() => setChildren((cur) => [...cur, { ...EMPTY_CHILD }])}
        >
          {t.fAddChild}
        </button>
      )}

      <h3 style={{ marginTop: 20 }}>
        {t.fHelperParent}
      </h3>
      {parents.map((parent, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <label htmlFor={`kp-name-${i}`}>{t.fHelperParent}{i > 0 && `(${i + 1})`}</label>
          <input
            id={`kp-name-${i}`}
            autoComplete={i === 0 ? "name" : undefined}
            {...fieldProps(`parent-${i}`)}
            value={parent.name}
            onChange={(e) => updateParent(i, { name: e.target.value })}
          />
          <label htmlFor={`kp-kana-${i}`}>{t.fKana}</label>
          <input
            id={`kp-kana-${i}`}
            value={parent.kana}
            onChange={(e) => updateParent(i, { kana: e.target.value })}
          />
          <label htmlFor={`kp-age-${i}`}>{t.fAge}({t.fOptional})</label>
          <input
            id={`kp-age-${i}`}
            type="number"
            min={0}
            value={parent.age}
            onChange={(e) => updateParent(i, { age: e.target.value })}
          />
        </div>
      ))}
      {parents.length < 2 && (
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setParents((cur) => [...cur, { ...EMPTY_PARENT }])}
        >
          + もうお一方追加(任意)
        </button>
      )}

      <label htmlFor="kd-lineid" style={{ marginTop: 16 }}>
        {t.fLineId}({t.fOptional})
      </label>
      <input id="kd-lineid" value={lineId} onChange={(e) => setLineId(e.target.value)} />
      <label htmlFor="kd-phone">{t.fPhone}({t.fOptional})</label>
      <input
        id="kd-phone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        {...fieldProps("phone")}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />

      {/* チェックボックスは label で包んでいるので、文字を押しても切り替わる */}
      <label
        data-field="consent"
        className={bad === "consent" ? "field-bad" : undefined}
        style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 16, padding: 4 }}
      >
        <input
          type="checkbox"
          style={{ width: "auto" }}
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        {t.fConsent}
      </label>
      <Honeypot value={hp} onChange={setHp} />
      {err && (
        <p className="error-box" role="alert">
          {err}
        </p>
      )}
      <Btn
        className="btn btn-primary"
        busy={busy}
        onClick={async () => {
          if (!children.some((c) => c.name.trim())) return fail("child-0", t.errChild);
          if (!parents.some((p) => p.name.trim())) return fail("parent-0", t.errParent);
          if (!consent) return fail("consent", t.errConsent);
          if (phone && phone.replace(/[^0-9]/g, "").length < 10)
            return fail("phone", t.errPhone);
          clear();
          setBusy(true);
          try {
            await api("/api/public/applications", {
              body: {
                kind: "kodomo",
                phone,
                hp,
                detail: { children, parents, line_id: lineId, consent },
              },
            });
            setDone(true);
          } catch (e) {
            setErr(e instanceof Error ? e.message : t.errSend);
          } finally {
            setBusy(false);
          }
        }}
      >
        {submitLabel}
      </Btn>
    </div>
  );
}

function SponsorList({ sponsors, title }: { sponsors: Sponsor[]; title: string }) {
  return (
    <div style={{ marginTop: 24 }}>
      <h2>{title}</h2>
      {sponsors.map((s) => {
        const Tag = s.url ? "a" : "div";
        const linkProps = s.url
          ? { href: s.url, target: "_blank", rel: "noopener noreferrer" }
          : {};
        return (
          <Tag
            key={s.id}
            {...linkProps}
            className="card"
            style={{ display: "block", textDecoration: "none", color: "inherit" }}
          >
            {s.image_url && (
              <img
                src={s.image_url}
                alt={s.name}
                style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 8 }}
              />
            )}
            <strong>{s.name}</strong>
            <p className="muted" style={{ marginTop: 4 }}>
              {s.message}
            </p>
          </Tag>
        );
      })}
      <AdRecruitBanner />
    </div>
  );
}

// 広告募集中のバナー(オーナー依頼)。将来のLINE有料プラン移行の原資づくり。
// 問い合わせは既存の入会申込フォームではなく、町会の連絡先へ誘導する。
function AdRecruitBanner() {
  return (
    <div className="ad-recruit">
      <strong>📣 広告を募集しています</strong>
      <p>
        {ORG.name}のホームページ・アプリに、地域のお店・事業者さまの広告を掲載しませんか。
        いただいた広告料は、本アプリの維持費などに活用させていただきます。
      </p>
      <p className="muted">
        ご希望・お問い合わせは、町会役員までお声がけください。
      </p>
    </div>
  );
}

// 会員対象エリアの案内(会員対象エリアを、
// 隣接エリアと誤解のないよう赤い境界線でポジティブに明示。外国籍の方・マンション住民など
// 「自分が対象か分からない人」向け)。
// Leaflet + OpenStreetMap(APIキー不要・運用コストゼロ)。Google Maps Embedでは境界線を
// 画面ピクセルでしか置けず地図を動かすとズレるため、実座標で描ける地図に切り替えた。
const HALL_LAT = ORG.hall.lat;
const HALL_LNG = ORG.hall.lng;
// ⚠ 架空のサンプル多角形。導入時は自分の町会の対象エリアの外周座標に書き換える。
// (OpenStreetMap way, ref=14, Overpass APIで取得)で分割し、北側だけを抽出した実座標
// (2026-07-29・shapelyで演算。町会館の実座標が含まれることを確認済み)
const AREA_POLYGON: [number, number][] = ORG.areaPolygon;

function AreaMapCard({
  title,
  desc,
  caption,
  areaLabel,
}: {
  title: string;
  desc: string;
  caption: string;
  areaLabel: string;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current, { scrollWheelZoom: false });
    mapInstanceRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    const polygon = L.polygon(AREA_POLYGON, {
      color: "#d32f2f",
      weight: 3,
      fillColor: "#d32f2f",
      fillOpacity: 0.15,
    }).addTo(map);
    polygon.bindTooltip(areaLabel, {
      permanent: true,
      direction: "center",
      className: "area-map-tooltip",
    });
    L.marker([HALL_LAT, HALL_LNG], {
      icon: L.divIcon({
        className: "",
        html: '<div style="font-size:26px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))">📍</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 26],
      }),
    })
      .addTo(map)
      .bindPopup(ORG.hall.name);
    map.fitBounds(polygon.getBounds(), { padding: [20, 20] });
    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [areaLabel]);

  return (
    <div className="area-card">
      <h2>🏘️ {title}</h2>
      <p>{desc}</p>
      <div ref={mapRef} className="area-map-frame" />
      <p className="area-map-caption">{caption}</p>
    </div>
  );
}

// 生活情報(公開): ごみ収集日・分別・防災。みどり区公式情報をもとにした固定内容(多言語)。
function LifeInfoPage({ lang }: { lang: PubLang }) {
  const d = LIFE_INFO[lang];
  const ext = (href: string, label: string) => (
    <a className="btn btn-secondary" href={href} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
  return (
    <div>
      <p>{d.intro}</p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>🗑️ {d.gomiTitle}</h2>
        <p className="ok-note">{d.gomiArea}</p>
        <div style={{ overflowX: "auto" }}>
          <table className="simple">
            <thead>
              <tr>
                <th>{d.gomiHeadKind}</th>
                <th>{d.gomiHeadDay}</th>
              </tr>
            </thead>
            <tbody>
              {d.gomiRows.map((r) => (
                <tr key={r.kind}>
                  <td>{r.kind}</td>
                  <td>
                    <strong>{r.day}</strong>
                    <div className="muted">{r.note}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="field-note">⏰ {d.gomiTimeNote}</p>
        <p className="field-note">⚠️ {d.gomiCaution}</p>
        {ext(GOMI_CALENDAR_PDF[lang], d.sortCalendarLink)}
        {ext(KOTO_LINKS.gomiSchedule, d.gomiScheduleLink)}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>🤝 {d.rulesTitle}</h2>
        <p>{d.rulesIntro}</p>
        {d.rules.map((r) => (
          <div className="list-item" key={r.point}>
            <strong>{r.point}</strong>
            <div className="muted">{r.detail}</div>
          </div>
        ))}
        <p className="field-note">{d.sodaiNote}</p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>♻️ {d.sortTitle}</h2>
        <p>{d.sortIntro}</p>
        {d.sortGroups.map((g) => (
          <div className="list-item" key={g.name}>
            <strong>{g.name}</strong>
            <div className="muted">{g.items}</div>
          </div>
        ))}
        {ext(GOMI_GUIDE_PDF[lang].url, d.sortPdfLink)}
        {d.sortPdfOldNote && <p className="field-note">{d.sortPdfOldNote}</p>}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>🔎 {d.naviTitle}</h2>
        <p>{d.naviDesc}</p>
        {ext(KOTO_LINKS.gomiNaviLine, d.naviLineLink)}
        {lang === "ja" && ext(KOTO_LINKS.gomiChatbotJa, d.naviChatbotLink)}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>🌊 {d.bosaiTitle}</h2>

        <h3>{d.hinanbashoLabel}</h3>
        <p className="ok-note" style={{ fontSize: 20, marginBottom: 4 }}>
          {d.hinanbashoValue}
        </p>
        <a
          className="map-link"
          href={mapUrl(`${HINANBASHO.name} ${HINANBASHO.address}`)}
          target="_blank"
          rel="noopener noreferrer"
        >
          📍 {d.openMap}
        </a>
        <p className="muted">{d.hinanbashoNote}</p>

        <h3>{d.hinanjoLabel}</h3>
        <p className="muted">{d.hinanjoNote}</p>
        {d.hinanjoNear.map((s) => (
          <div className="list-item" key={s.name}>
            <strong>{s.name}</strong>
            {s.kyoten && <span className="chip chip-green">{d.kyotenNote}</span>}
            <div className="muted">{s.address}</div>
            <a
              className="map-link"
              href={mapUrl(`${s.name} ${s.address}`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              📍 {d.openMap}
            </a>
          </div>
        ))}
        {ext(KOTO_LINKS.hinanjo, d.hinanjoLink)}

        <h3>{d.hazardLabel}</h3>
        <p className="muted">{d.hazardNote}</p>
        {d.hzFallbackNote && <p className="field-note">{d.hzFallbackNote}</p>}
        {ext(HAZARD_PDF[lang].flood, d.hzFlood)}
        {ext(HAZARD_PDF[lang].rain, d.hzRain)}
        {ext(HAZARD_PDF[lang].surge, d.hzSurge)}
        {ext(HAZARD_PDF[lang].booklet, d.hzBooklet)}
        {ext(BOSAI_MAP_PDF[lang].map, d.bosaiMapLink)}
        {ext(KOTO_LINKS.hazardMap, d.hazardMapLink)}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>📣 {d.alertTitle}</h2>
        <p>{d.alertDesc}</p>
        <div className="list-item">
          <strong>{d.alertSafetyTips}</strong>
          <div className="muted">{d.alertSafetyTipsNote}</div>
          <a className="map-link" href={ALERT_LINKS.safetyTipsIos} target="_blank" rel="noopener noreferrer">
            iPhone
          </a>
          {" / "}
          <a className="map-link" href={ALERT_LINKS.safetyTipsAndroid} target="_blank" rel="noopener noreferrer">
            Android
          </a>
        </div>
        {ext(ALERT_LINKS.areaBosaiPortal, d.alertPortal)}
        {ext(ALERT_LINKS.areaBosaiX, d.alertX)}
        {ext(lang === "vi" ? ALERT_LINKS.jmaMultiVi : ALERT_LINKS.jmaMultiEn, d.alertJma)}
        {ext(ALERT_LINKS.anshinMail, d.alertMail)}
      </div>

      <p className="field-note">{d.sourceNote}</p>
    </div>
  );
}

// QRコードから開いたときに利用者の言語で表示するための初期言語判定(オーナー指示)。
// 優先順: ①URLの ?lang=xx (言語別QRコードを配る用) → ②前回選んだ言語 → ③端末の言語 → ④日本語
function detectInitialLang(): PubLang {
  const isLang = (v: string | null): v is PubLang => !!v && PUB_LANGS.some((l) => l.code === v);

  const q = new URLSearchParams(window.location.search).get("lang");
  if (isLang(q)) return q;

  const saved = localStorage.getItem("pubLang");
  if (isLang(saved)) return saved;

  // 端末の言語設定から推定(navigator.languages は "en-US" のような形式)
  for (const raw of navigator.languages ?? [navigator.language]) {
    const tag = (raw || "").toLowerCase();
    if (tag.startsWith("ja")) return "ja";
    if (tag.startsWith("en")) return "en";
    if (tag.startsWith("vi")) return "vi";
    if (tag.startsWith("zh")) return "zh";
    // 上記以外(韓国語・タガログ語など未対応言語)は英語が最も通じやすい
    if (tag.startsWith("ko") || tag.startsWith("tl") || tag.startsWith("fil")) return "en";
  }
  return "ja";
}


// ログインすると、公開トップに「自分の権限でできること」が増える導線(オーナー指示)。
// 会員アプリ(/app)と管理画面(/admin)は別画面のままだが、入口はこの公開トップに一本化する。
// 役員用LINEオープンチャット「七北町会連絡網」(役員だけに表示する)
const OFFICER_OPENCHAT_URL =
  "https://line.me/ti/g2/qqqDVkD0ciiTpyoAYgI_N_sh8Vyc6DofCvUarQ?utm_source=invitation&utm_medium=link_copy&utm_campaign=default";

const ADMIN_ROLE_SET = [
  "admin",
  "senior_officer",
  "pr",
  "circular_manager",
  "hall_manager",
  "officer",
  "kodomo_officer",
  "seniors_member",
];

function MyMenu({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void } = {}) {
  const { me, refresh } = useMe();
  const user = me?.user;
  const [unconfirmed, setUnconfirmed] = useState<number | null>(null);

  const active = !!user && user.status === "active";
  useEffect(() => {
    if (!active) return;
    api<{ circulars: { confirmed_at: string | null }[] }>("/api/circulars")
      .then((d) => setUnconfirmed(d.circulars.filter((c) => !c.confirmed_at).length))
      .catch(() => setUnconfirmed(null));
  }, [active]);

  // 未ログイン: ログイン導線だけ出す
  if (!user) {
    return (
      <div className={compact ? "" : "card"}>
        <h2 style={{ marginTop: 0 }}>会員の方へ</h2>
        <p className="muted">
          ログインすると、回覧の確認・会館の予約・会合の出欠ができます。
        </p>
        <Link className="btn btn-primary" to="/app" onClick={onNavigate}>
          ログインする
        </Link>
      </div>
    );
  }

  if (!active) {
    return (
      <div className={compact ? "" : "card"}>
        <p className="ok-note">町内会の承認待ちです。承認されると会員の機能が使えます。</p>
        <Link className="btn btn-secondary" to="/app" onClick={onNavigate}>
          状況を見る
        </Link>
      </div>
    );
  }

  const isOfficer = user.roles.some((r) => ADMIN_ROLE_SET.includes(r));
  return (
    <div className={compact ? "mymenu-compact" : "card mymenu"}>
      <div className="spread">
        {!compact && <h2 style={{ margin: 0 }}>{user.name} さんのメニュー</h2>}
        <button
          className="btn btn-secondary btn-sm"
          style={{ margin: 0 }}
          onClick={async () => {
            await api("/api/auth/logout", { body: {} });
            await refresh();
          }}
        >
          ログアウト
        </button>
      </div>
      <div className="row" style={{ margin: "6px 0 10px" }}>
        {(user.roles.length ? user.roles : ["member"]).map((r) => (
          <span className="chip chip-green" key={r}>
            {ROLE_LABELS[r] ?? r}
          </span>
        ))}
      </div>
      <p className="field-note" style={{ marginTop: 0 }}>
        会員レベルによって、使えるメニューが増えます。
      </p>
      <div className="mymenu-grid">
        <Link onClick={onNavigate} className="mymenu-item" to="/app/circulars">
          <span className="mymenu-icon">📋</span>
          <span>
            回覧を見る
            {unconfirmed !== null && unconfirmed > 0 && (
              <span className="chip chip-red" style={{ marginLeft: 6 }}>
                未確認 {unconfirmed}件
              </span>
            )}
          </span>
        </Link>
        <Link onClick={onNavigate} className="mymenu-item" to="/app/reserve">
          <span className="mymenu-icon">🏢</span>
          <span>会館を予約する</span>
        </Link>
        <Link onClick={onNavigate} className="mymenu-item" to="/app/meetings">
          <span className="mymenu-icon">👥</span>
          <span>会合の出欠</span>
        </Link>
        <Link onClick={onNavigate} className="mymenu-item" to="/app/documents">
          <span className="mymenu-icon">📄</span>
          <span>町会の資料</span>
        </Link>
        <Link onClick={onNavigate} className="mymenu-item" to="/app/album">
          <span className="mymenu-icon">📷</span>
          <span>ブログ(写真)</span>
        </Link>
        <Link onClick={onNavigate} className="mymenu-item" to="/app">
          <span className="mymenu-icon">🏠</span>
          <span>会員ホーム</span>
        </Link>
        {isOfficer && (
          <Link onClick={onNavigate} className="mymenu-item officer" to="/admin">
            <span className="mymenu-icon">⚙️</span>
            <span>管理画面(役員)</span>
          </Link>
        )}
        {/* 役員だけに見せる連絡網(オーナー指示。リンクURLは出さずボタンにする) */}
        {isOfficer && (
          <a
            className="mymenu-item officer"
            href={OFFICER_OPENCHAT_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onNavigate}
          >
            <span className="mymenu-icon">💬</span>
            <span>役員用オープンチャット</span>
          </a>
        )}
      </div>
    </div>
  );
}


type AreaAlert = {
  guid: string;
  title: string;
  body: string;
  link: string | null;
  published_at: string;
  scope: string;
  matched: string | null;
  source: string;
  translated: boolean;
};

// みどり区「こうとう安全安心メール」の公開アーカイブから、みどり町・近隣分だけを表示する。
// 区の配信の代わりではないため、公式登録への導線は「生活情報」タブに残してある。
function AreaAlertsCard({ lang, t }: { lang: PubLang; t: (typeof PUB_DICT)[PubLang] }) {
  const [alerts, setAlerts] = useState<AreaAlert[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    setAlerts(null);
    api<{ alerts: AreaAlert[] }>(`/api/public/alerts?lang=${lang}&limit=5`)
      .then((d) => setAlerts(d.alerts))
      .catch(() => setAlerts([]));
  }, [lang]);

  if (alerts !== null && alerts.length === 0) return null;
  const scopeLabel = (s: string) =>
    s === "kairanban" ? t.scopeKairanban : s === "nearby" ? t.scopeNearby : t.scopeWard;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>🚨 {t.alertsTitle}</h2>
      <p className="field-note" style={{ marginTop: 0 }}>{t.alertsNote}</p>
      {alerts === null && <p className="muted">{t.loading}</p>}
      {alerts?.map((a) => (
        <div className="list-item" key={a.guid}>
          <div className="row" style={{ gap: 6, marginBottom: 2 }}>
            <span className={`chip ${a.scope === "kairanban" ? "chip-red" : a.scope === "nearby" ? "chip-orange" : "chip-gray"}`}>
              {a.scope === "nearby" && a.matched ? `${t.scopeNearby}・${a.matched.split(",")[0]}` : scopeLabel(a.scope)}
            </span>
            <span className="muted">
              {a.source} ・ {fmtDateTime(a.published_at)}
            </span>
          </div>
          <strong>{a.title}</strong>
          {open === a.guid ? (
            <>
              <p className="pre" lang={a.translated ? undefined : "ja"}>
                {a.body}
              </p>
              {!a.translated && lang !== "ja" && (
                <p className="field-note">{t.alertsMachine || "(Japanese original)"}</p>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => setOpen(null)}>
                {t.back}
              </button>
            </>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={() => setOpen(a.guid)}>
              {t.openCircular}
            </button>
          )}
        </div>
      ))}
      <p className="field-note">{t.alertsSource}</p>
    </div>
  );
}

// 未確認の回覧を「全部」トップに出す(オーナー指示: 最優先機能)。
function UnreadCircularsCard({ t }: { t: (typeof PUB_DICT)[PubLang] }) {
  const { me } = useMe();
  const active = !!me?.user && me.user.status === "active";
  const [rows, setRows] = useState<
    {
      id: number;
      title: string;
      deadline: string | null;
      confirmed_at: string | null;
      status: string;
    }[] | null
  >(null);

  useEffect(() => {
    if (!active) return;
    api<{
      circulars: {
        id: number;
        title: string;
        deadline: string | null;
        confirmed_at: string | null;
        status: string;
      }[];
    }>("/api/circulars")
      .then((d) => setRows(d.circulars))
      .catch(() => setRows([]));
  }, [active]);

  if (!active) return null;
  // 未確認に出すのは**いま公開中**の回覧だけ(オーナー指示)。掲載が終わったもの(archived)は
  // 過去の回覧として残るが、未確認としては促さない。
  // 途中で入会した人にも、そのとき公開中の回覧はここに出る。
  const unread = (rows ?? []).filter((c) => !c.confirmed_at && c.status === "published");
  return (
    <div className="card unread-card">
      <h2 style={{ marginTop: 0 }}>
        📋 {t.unreadTitle}{" "}
        {rows !== null && (
          <span className={`chip ${unread.length ? "chip-red" : "chip-green"}`}>{unread.length}</span>
        )}
      </h2>
      {rows === null && <p className="muted">{t.loading}</p>}
      {rows !== null && unread.length === 0 && <p className="ok-note">{t.unreadNone}</p>}
      {unread.map((c) => (
        <Link className="unread-item" key={c.id} to={`/app/circulars/${c.id}`}>
          <span className="unread-title">{c.title}</span>
          {c.deadline && (
            <span className="chip chip-orange">
              {t.deadline}: {fmtDate(c.deadline)}
            </span>
          )}
          <span className="unread-go">{t.openCircular} →</span>
        </Link>
      ))}
    </div>
  );
}



// 公開用の会館カレンダー(ログイン不要)。オーナー指示 2026-07-30。
// ⚠ **誰が予約しているかは表示しない**。APIも団体名や申込者を返していない。
//   出すのは「空き / 仮予約 / 予約済み」と時間帯だけ。
type PubSlot = {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  provisional: boolean;
  has_waitlist: boolean;
};

const PUB_WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function PublicHallCalendar({
  selectedDate,
  onPickDate,
}: {
  selectedDate: string;
  onPickDate: (d: string) => void;
}) {
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)) - 1);
  const [slots, setSlots] = useState<PubSlot[] | null>(null);

  const ymStr = `${year}-${String(month + 1).padStart(2, "0")}`;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  useEffect(() => {
    setSlots(null);
    api<{ slots: PubSlot[] }>(
      `/api/public/reservations/calendar?from=${ymStr}-01&to=${ymStr}-${String(lastDay).padStart(2, "0")}`,
    )
      .then((d) => setSlots(d.slots))
      .catch(() => setSlots([]));
  }, [ymStr, lastDay]);

  const shift = (delta: number) => {
    const m = month + delta;
    if (m < 0) {
      setYear(year - 1);
      setMonth(11);
    } else if (m > 11) {
      setYear(year + 1);
      setMonth(0);
    } else setMonth(m);
  };

  const byDate = new Map<string, PubSlot[]>();
  for (const s of slots ?? []) {
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }

  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) cells.push(`${ymStr}-${String(d).padStart(2, "0")}`);

  const daySlots = byDate.get(selectedDate) ?? [];

  return (
    <div className="card">
      {/* 月の名前が主役。送りボタンは脇役なので、折り返さない小さめの見た目にする。
          予約に使えない過去の月へは行けないようにする(押しても意味がないボタンは出さない) */}
      <div className="spread cal-nav">
        <button
          className="btn btn-secondary btn-sm"
          aria-label="前の月を見る"
          disabled={ymStr <= today.slice(0, 7)}
          onClick={() => shift(-1)}
        >
          ←前
        </button>
        <strong className="cal-title">
          {year}年{month + 1}月
        </strong>
        <button
          className="btn btn-secondary btn-sm"
          aria-label="次の月を見る"
          onClick={() => shift(1)}
        >
          次→
        </button>
      </div>

      {slots === null && <p className="muted center">読み込み中…</p>}

      <div className="cal-grid">
        {PUB_WEEKDAYS.map((w, i) => (
          <div key={w} className={`cal-head${i === 0 ? " sun" : i === 6 ? " sat" : ""}`}>
            {w}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} className="cal-cell empty" />;
          const list = byDate.get(date) ?? [];
          const past = date < today;
          const confirmed = list.filter((s) => !s.provisional).length;
          const provisional = list.filter((s) => s.provisional).length;
          return (
            <button
              key={date}
              className={[
                "cal-cell",
                past ? "past" : "",
                date === today ? "today" : "",
                date === selectedDate ? "picked" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={past}
              /* 読み上げでは「31」だけでは伝わらないので、日付と状態を言葉にする */
              aria-label={`${month + 1}月${Number(date.slice(8))}日 ${
                past
                  ? "過ぎた日"
                  : confirmed > 0 || provisional > 0
                    ? `予約${confirmed + provisional}件あり`
                    : "空き"
              }`}
              aria-pressed={date === selectedDate}
              onClick={() => onPickDate(date)}
            >
              <span className="cal-day">{Number(date.slice(8))}</span>
              <span className="cal-marks">
                {confirmed > 0 && <span className="cal-mark confirmed">●</span>}
                {provisional > 0 && <span className="cal-mark provisional">△</span>}
                {list.length === 0 && !past && <span className="cal-mark free">○</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="cal-legend">
        <span>
          <span className="cal-mark free">○</span>空き
        </span>
        <span>
          <span className="cal-mark provisional">△</span>仮予約あり(確定前)
        </span>
        <span>
          <span className="cal-mark confirmed">●</span>予約あり
        </span>
      </div>
      <p className="field-note" style={{ marginTop: 6 }}>
        ●や△の日でも、<strong>ほかの時間帯は空いていることがあります</strong>。
        日付を押すと、その日の時間帯が見られます。
      </p>

      {selectedDate && (
        <div style={{ marginTop: 10 }}>
          <strong>{selectedDate} の状況</strong>
          {daySlots.length === 0 ? (
            <p className="ok-note" style={{ margin: "4px 0" }}>
              この日はまだ予約が入っていません。
            </p>
          ) : (
            <ul className="plain-list">
              {daySlots.map((s) => (
                <li key={s.id}>
                  {s.start_time}〜{s.end_time}{" "}
                  {s.provisional ? (
                    <span className="chip chip-orange">
                      仮予約{s.has_waitlist ? "・キャンセル待ちあり" : ""}
                    </span>
                  ) : (
                    <span className="chip chip-red">予約済み</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="field-note">
            どなたが利用されるかは表示していません。
            <br />
            <strong>「仮予約」はまだ確定していない申し込み</strong>です。取り消される場合もあるので、
            重なる時間でも<strong>キャンセル待ち</strong>としてお申し込みいただけます。
          </p>
        </div>
      )}
    </div>
  );
}

// 会館予約(公開・ログイン不要。オーナー指示 2026-07-30)。
// 町会員でなくても借りられるようにする。確定は会館係の承認が必要なので、
// この申込だけで会館が押さえられるわけではない旨を明記する。
// 電話番号で「会館予約者」として登録され、次回からは電話番号でログインして予約状況が見られる。
function PublicHallForm() {
  const [orgName, setOrgName] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("12:00");
  const [purpose, setPurpose] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [note, setNote] = useState("");
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneCase, setDoneCase] = useState("");
  // 入力もれは「その欄までスクロール＋赤枠」で示す(下に赤文字1行だけでは気づけない)
  const { formRef, err, setErr, fail, clear, fieldProps } = useFormErrors();
  // 先約が仮予約だったときに出す確認(キャンセル待ちにするかどうか)
  const [askWaitlist, setAskWaitlist] = useState(false);
  const [waitlisted, setWaitlisted] = useState(false);
  const [calKey, setCalKey] = useState(0);

  if (waitlisted) {
    return (
      <div className="card center">
        <div className="big-icon">⏳</div>
        <h2>キャンセル待ちに登録しました</h2>
        <p>
          先に入っているお申し込みが取り消された場合、
          <strong>ご登録の電話番号とメールにお知らせ</strong>します。
        </p>
        <p className="field-note">
          そのままでは予約は確定しません。空いたら改めてお申し込みをお願いします。
        </p>
        <Link className="btn btn-secondary" to="/app">
          ログイン画面へ
        </Link>
      </div>
    );
  }

  if (doneCase) {
    return (
      <div className="card center">
        <div className="big-icon">📨</div>
        <h2>お申し込みを受け付けました</h2>
        <p>
          受付番号: <strong>{doneCase}</strong>
        </p>
        <p>
          このあと会館係が確認して、ご連絡します。
          <br />
          <strong>この時点ではまだ確定していません。</strong>
        </p>
        <p className="ok-note">
          次回からは、ご入力の電話番号でログインすると予約の状況が見られます。
        </p>
        <Link className="btn btn-secondary" to="/app">
          ログイン画面へ
        </Link>
      </div>
    );
  }

  return (
    <div className="card" ref={formRef}>
      <h2 style={{ marginTop: 0 }}>会館を予約する</h2>
      <p className="muted">
        {ORG.hall.name}は、<strong>会員以外の方でもお申し込みいただけます</strong>。
        ご利用は8:00〜22:00です。
      </p>
      <p className="field-note">
        お申し込みのあと会館係が確認してご連絡します。この画面で送っただけでは確定しません。
      </p>

      {/* 空き状況のカレンダー。⚠ 誰が予約しているかは出さない(オーナー指示) */}
      <PublicHallCalendar
        key={calKey}
        selectedDate={date}
        onPickDate={(d) => {
          setDate(d);
          setAskWaitlist(false);
          setErr("");
        }}
      />

      {/* ラベルは htmlFor で入力欄と結びつける。
          ラベルの文字を押しても入力できるようになり、読み上げでも欄の名前が読まれる */}
      <label htmlFor="hall-org">利用団体名(必須)</label>
      <input
        id="hall-org"
        {...fieldProps("org")}
        value={orgName}
        onChange={(e) => setOrgName(e.target.value)}
        placeholder="例: ○○サークル"
      />

      <label htmlFor="hall-date">ご利用日(必須)</label>
      <input
        id="hall-date"
        type="date"
        {...fieldProps("date")}
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />

      <div className="row" style={{ gap: 8 }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label htmlFor="hall-start">開始時刻</label>
          <input
            id="hall-start"
            type="time"
            {...fieldProps("time")}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label htmlFor="hall-end">終了時刻</label>
          <input
            id="hall-end"
            type="time"
            {...fieldProps("endtime")}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      </div>

      <label htmlFor="hall-purpose">利用目的(必須)</label>
      <input
        id="hall-purpose"
        {...fieldProps("purpose")}
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        placeholder="例: 定例の練習"
      />

      <label htmlFor="hall-headcount">おおよその人数(任意)</label>
      <input
        id="hall-headcount"
        type="number"
        min={1}
        value={headcount}
        onChange={(e) => setHeadcount(e.target.value)}
      />

      <label htmlFor="hall-cname">当日の担当者のお名前(必須)</label>
      <input
        id="hall-cname"
        autoComplete="name"
        {...fieldProps("cname")}
        value={contactName}
        onChange={(e) => setContactName(e.target.value)}
        placeholder="例: 山田 太郎"
      />

      <label htmlFor="hall-cphone">担当者の電話番号(必須)</label>
      <input
        id="hall-cphone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        {...fieldProps("cphone")}
        value={contactPhone}
        onChange={(e) => setContactPhone(e.target.value)}
        placeholder="09012345678"
      />
      <p className="field-note">
        この番号でお連絡します。次回からは、この番号でログインして予約の状況を見られます。
      </p>

      <div className="recommend-box">
        <label htmlFor="hall-cmail" style={{ marginTop: 0 }}>
          メールアドレス(強くおすすめします)
        </label>
        <input
          id="hall-cmail"
          type="email"
          inputMode="email"
          autoComplete="email"
          {...fieldProps("cmail")}
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="例: example@gmail.com"
        />
        <p className="field-note">
          ご登録いただくと、次のお知らせがメールで届きます。
          <br />
          ・確定のご連絡 ・前日の確認 ・ご利用開始 ・終了10分前 ・ご利用終了
        </p>
      </div>

      <label htmlFor="hall-note">ご要望・備考(任意)</label>
      <textarea id="hall-note" value={note} onChange={(e) => setNote(e.target.value)} />

      <Honeypot value={hp} onChange={setHp} />
      {/* role="alert" にして、読み上げでも入力もれが伝わるようにする */}
      {err && (
        <p className="error-box" role="alert">
          {err}
        </p>
      )}

      {askWaitlist && (
        <div className="card card-warn" id="hall-waitlist-ask" role="alert">
          <strong>この時間帯には、先に申し込みが入っています</strong>
          <p style={{ margin: "6px 0" }}>
            まだ<strong>確定していない「仮予約」</strong>です。取り消される場合もあるので、
            <strong>キャンセル待ち</strong>としてお申し込みいただけます。
          </p>
          <p className="field-note">
            空いたら、ご登録の電話番号とメールにお知らせします(1枠につきお一人まで)。
          </p>
        </div>
      )}

      <Btn
        className="btn btn-primary"
        busy={busy}
        busyLabel="登録中…"
        onClick={async () => {
          // 送る前にこちらで確かめる。通信を待たずに、直すべき欄へその場で案内できる
          if (!orgName.trim()) return fail("org", "利用団体名を入れてください。");
          if (!date) return fail("date", "ご利用日を選んでください。");
          if (!start || !end) return fail("time", "開始時刻と終了時刻を入れてください。");
          if (end <= start) return fail("endtime", "終了時刻は開始時刻より後にしてください。");
          if (!purpose.trim()) return fail("purpose", "利用目的を入れてください。");
          if (!contactName.trim()) return fail("cname", "当日の担当者のお名前を入れてください。");
          if (contactPhone.replace(/[^0-9]/g, "").length < 10)
            return fail("cphone", "担当者の電話番号を、市外局番から入れてください。");
          if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
            return fail("cmail", "メールアドレスの形をご確認ください(@のうしろも必要です)。");
          clear();
          setBusy(true);
          const body = {
            org_name: orgName,
            date,
            start_time: start,
            end_time: end,
            purpose,
            headcount: headcount ? Number(headcount) : undefined,
            note,
            contact_name: contactName,
            contact_phone: contactPhone,
            contact_email: contactEmail,
            hp,
            waitlist: askWaitlist, // 確認を出したあとの押下ならキャンセル待ちを許可
          };
          try {
            const d = await api<{ case_no?: string; waitlisted?: boolean }>(
              "/api/public/reservations",
              { body },
            );
            if (d.waitlisted) setWaitlisted(true);
            else setDoneCase(d.case_no || "");
          } catch (e) {
            const msg = e instanceof Error ? e.message : "送信に失敗しました";
            // 「まだ確定していない先約がある」場合だけ、キャンセル待ちの確認を出す
            if (!askWaitlist && msg.includes("まだ確定していません")) {
              setAskWaitlist(true);
              setErr("");
              // 押したのに何も起きていないように見えないよう、出した確認まで送る
              requestAnimationFrame(() =>
                formRef.current
                  ?.querySelector("#hall-waitlist-ask")
                  ?.scrollIntoView({ block: "center", behavior: "smooth" }),
              );
            } else {
              setErr(msg);
              setCalKey((k) => k + 1); // カレンダーを最新にする
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        {askWaitlist ? "キャンセル待ちに登録する" : "この内容で申し込む"}
      </Btn>
      {askWaitlist && (
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setAskWaitlist(false);
            setErr("");
          }}
        >
          別の日時を選ぶ
        </button>
      )}
    </div>
  );
}


// 使い方への導線(オーナー指示 2026-07-30)。
// ハンバーガーの中にもあるが見つけにくいので、ログイン後のホームにも出す。
// ⚠ /help/ はSPAの外(静的ページ)なので、react-router の <Link> ではなく
//   ふつうの <a href> を使う。<Link>だと画面遷移せず公開トップのままになる。
function HelpCard({ isOfficer }: { isOfficer: boolean }) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>📖 アプリの使い方</h2>
      <p className="field-note" style={{ marginTop: 0 }}>
        ホーム画面への追加のしかた、回覧の読み方、会館の予約のしかたなどを、
        写真つきで説明しています。
      </p>
      <a className="btn btn-primary" href="/help/">
        使い方を見る
      </a>
      {isOfficer && (
        <a className="btn btn-secondary" href="/help/yakuin/">
          🛠 役員向けの使い方を見る
        </a>
      )}
    </div>
  );
}

// プライバシーポリシー(公開・ログイン不要)。
// LINEログインの「メールアドレス取得権限」の申請にURLが要るため、独立したURL /privacy を持つ。
function PrivacyPage({ lang }: { lang: PubLang }) {
  const d = PRIVACY[lang] ?? PRIVACY.ja;
  return (
    <div className="card doc">
      <h2 style={{ marginTop: 0 }}>{d.title}</h2>
      <p className="muted">
        {d.updatedLabel}: {PRIVACY_UPDATED}
      </p>
      {d.translatedNote && <p className="field-note">{d.translatedNote}</p>}
      {d.intro.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {d.sections.map((s) => (
        <section key={s.heading}>
          <h3>{s.heading}</h3>
          {s.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {s.list && (
            <ul>
              {s.list.map((li, i) => (
                <li key={i}>{li}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <section>
        <h3>{d.contactHeading}</h3>
        {d.contact.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </section>
    </div>
  );
}

// QRコード・直リンク用の専用URL(オーナー指示 2026-07-30)。
// ⚠ 片方だけ足すとURLが書き換わって迷子になるので、必ず両方そろえる。
const PATH_TO_VIEW: Record<string, string> = {
  "/": "notices",
  "/privacy": "privacy",
  "/kodomo": "apply-kodomo", // 子ども会の入会申込(QRで案内する)
  "/nyukai": "apply-chonai", // 町内会の入会申込
  "/yoyaku": "hall", // 会館の予約
  "/seikatsu": "life", // 生活情報(ごみ・防災)
};
const VIEW_TO_PATH: Record<string, string> = {
  notices: "/",
  privacy: "/privacy",
  "apply-kodomo": "/kodomo",
  "apply-chonai": "/nyukai",
  hall: "/yoyaku",
  life: "/seikatsu",
};

export default function PublicSite() {
  const { me } = useMe();
  // すでに所属している方には入会申込を出さない(オーナー指示)
  const myRoles = me?.user?.status === "active" ? me.user.roles : [];
  const alreadyMember = myRoles.length > 0;
  const alreadyKodomo = myRoles.some((r) => ["kodomo_parent", "kodomo_officer"].includes(r));
  // 役員向けの使い方へのボタンを出すかどうか
  const isOfficer = myRoles.some((r) => ADMIN_ROLE_SET.includes(r));
  const loggedIn = me?.user?.status === "active";
  const [menuOpen, setMenuOpen] = useState(false);
  // ☰メニューの「最初の設定」から InstallGuide を開くためのきっかけ
  const [openInstall, setOpenInstall] = useState(false);
  const [lang, setLang] = useState<PubLang>(detectInitialLang);
  // 'notices' | 'life' | 'privacy' | 'apply-*' | 'hall' | ページのslug
  //
  // QRコードから直接その画面へ飛ばせるように、いくつかの画面は**専用のURL**を持つ
  // (オーナー指示 2026-07-30: 子ども会入会をQRで案内したい)。
  // ⚠ 新しいURLを足すときは PATH_TO_VIEW と VIEW_TO_PATH の**両方**に足すこと。
  const [view, setView] = useState<string>(
    () => PATH_TO_VIEW[window.location.pathname.replace(/\/$/, "") || "/"] ?? "notices",
  );
  const [pageList, setPageList] = useState<PageSummary[]>([]);
  const [circulars, setCirculars] = useState<PubCircular[] | null>(null);
  const [selected, setSelected] = useState<PubCircular | null>(null);
  const [page, setPage] = useState<PubPage | null>(null);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const t = PUB_DICT[lang];
  const tabbarRef = useRef<HTMLDivElement>(null);

  // ドロワーはスマホの「戻る」と Escape で閉じられるようにする
  useOverlay(menuOpen, () => setMenuOpen(false));

  // 選ばれているタブが横スクロールの外に隠れないようにする。
  // QRから /yoyaku で来ると「会館予約」タブが画面の外にあり、
  // どこにいるのか分からない状態だったため。
  useEffect(() => {
    const el = tabbarRef.current?.querySelector<HTMLElement>(".tab.active");
    el?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [view, pageList.length, loggedIn]);

  useEffect(() => {
    api<{ pages: PageSummary[] }>("/api/public/pages")
      .then((d) => setPageList(d.pages))
      .catch(() => setPageList([]));
    api<{ sponsors: Sponsor[] }>("/api/public/sponsors")
      .then((d) => setSponsors(d.sponsors))
      .catch(() => setSponsors([]));
  }, []);

  // ?lang= は一度読み取ったらURLから外す(あとで手動で言語を変えたとき、再読込で戻らないように)
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("lang")) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("lang");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, []);

  // 画面とURLを合わせる(専用URLは直リンク・QRから開かれるため)。
  // ⚠ **知っているパスの間だけ**を行き来させる。知らないパスを勝手に書き換えると、
  //   別の用途のURL(資料の共有リンク /s/... など)を踏んだときに消してしまう。
  useEffect(() => {
    const here = window.location.pathname.replace(/\/$/, "") || "/";
    if (!(here in PATH_TO_VIEW)) return;
    const want = VIEW_TO_PATH[view] ?? "/";
    if (here !== (want.replace(/\/$/, "") || "/")) {
      window.history.replaceState({}, "", want + window.location.search);
    }
  }, [view]);

  useEffect(() => {
    localStorage.setItem("pubLang", lang);
    if (view === "notices") {
      setCirculars(null);
      api<{ circulars: PubCircular[] }>(`/api/public/circulars?lang=${lang}`)
        .then((d) => setCirculars(d.circulars))
        .catch(() => setCirculars([]));
      setSelected(null);
    } else if (!["apply-chonai", "apply-kodomo", "life", "privacy", "hall"].includes(view)) {
      setPage(null);
      api<{ page: PubPage }>(`/api/public/pages/${view}?lang=${lang}`)
        .then((d) => setPage(d.page))
        .catch(() => setPage(null));
    }
  }, [lang, view]);

  return (
    <div>
      <div className="header">
        <div className="header-row">
          <div className="header-brand">
            <img src="/icons/icon-192.png" alt="" className="header-logo" />
            <div>
              <h1>{ORG.name}</h1>
              {/* ログイン中は「どなたでも〜」ではなく「ログイン中の画面です。」を出す(オーナー指示) */}
              <div className="sub">{loggedIn ? t.loggedInNote : t.publicNote}</div>
            </div>
          </div>
          <div className="header-actions">
            {me?.user ? (
              <Link className="header-btn" to="/app">
                {me.user.name} さん
              </Link>
            ) : (
              <Link className="header-btn primary" to="/app">
                ログイン
              </Link>
            )}
            <button
              className="header-btn icon"
              aria-label="メニュー"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              ☰
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className="drawer-backdrop" onClick={() => setMenuOpen(false)}>
          <div
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="メニュー"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="spread">
              <strong>メニュー / Menu</strong>
              <button className="btn btn-secondary btn-sm" style={{ margin: 0 }} onClick={() => setMenuOpen(false)}>
                閉じる
              </button>
            </div>

            <h3>最初の設定</h3>
            <p className="field-note" style={{ marginTop: 0 }}>
              ホーム画面にアイコンを置く設定です。いつでもここからやり直せます。
            </p>
            <button
              className="ig-reopen"
              style={{ marginBottom: 12 }}
              onClick={() => {
                setOpenInstall(true);
                setMenuOpen(false);
              }}
            >
              ここから最初の設定をする
            </button>

            <h3>使い方</h3>
            <p className="field-note" style={{ marginTop: 0 }}>
              操作に迷ったら、いつでもここから使い方の説明を見られます。
            </p>
            <div className="row" style={{ marginBottom: 12 }}>
              <a className="btn btn-secondary btn-sm" href="/help/">
                📖 使い方(会員向け)
              </a>
              {me?.user?.roles.some((r) =>
                [
                  "admin",
                  "senior_officer",
                  "pr",
                  "circular_manager",
                  "hall_manager",
                  "officer",
                  "kodomo_officer",
                  "seniors_member",
                ].includes(r),
              ) && (
                <a className="btn btn-secondary btn-sm" href="/help/yakuin/">
                  🛠 使い方(役員向け)
                </a>
              )}
            </div>

            <h3>言語 / Language</h3>
            <p className="field-note" style={{ marginTop: 0 }}>
              ふだんはお使いの端末の言語で自動的に表示します。変えたいときはここから選べます。
            </p>
            <div className="lang-chips">
              {PUB_LANGS.map((l) => (
                <button
                  key={l.code}
                  className={l.code === lang ? "active" : ""}
                  onClick={() => {
                    setLang(l.code);
                    setMenuOpen(false);
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>

            {!alreadyKodomo && (
              <>
                <h3>入会のお申し込み</h3>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setView("apply-kodomo");
                    setMenuOpen(false);
                  }}
                >
                  {t.joinKodomo}
                </button>
              </>
            )}

            <h3>会員・役員の方 / Members</h3>
            <MyMenu compact onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      <div className="container">

        {/* ホーム画面追加の一画面マニュアル(表示条件はコンポーネント側で判定) */}
        <InstallGuide openNow={openInstall} onOpened={() => setOpenInstall(false)} />

        {/* タブは横スクロールするので、選ばれているタブが画面外だと「いまどこにいるか」が
            分からなくなる。QRから /yoyaku で来たときに実際そうなっていたため、
            選択中のタブを必ず見える位置まで寄せる */}
        <div className="tabbar" ref={tabbarRef}>
          <button
            className={`tab${view === "notices" ? " active" : ""}`}
            aria-current={view === "notices" ? "page" : undefined}
            onClick={() => setView("notices")}
          >
            {t.notices}
          </button>
          <button
            className={`tab${view === "life" ? " active" : ""}`}
            aria-current={view === "life" ? "page" : undefined}
            onClick={() => setView("life")}
          >
            {LIFE_INFO[lang].tab}
          </button>
          {pageList.map((p) => (
            <button
              key={p.slug}
              className={`tab${view === p.slug ? " active" : ""}`}
              aria-current={view === p.slug ? "page" : undefined}
              onClick={() => setView(p.slug)}
            >
              {p.title}
            </button>
          ))}
          {/* 会館予約はログイン不要(オーナー指示)。会員は繰り返し予約が使える会員用フォームへ。
              ⚠ ログイン中でも /yoyaku(QR)で公開フォームを開くことがあるので、
                 そのときはこのタブを選択中として見せる(以前はどのタブも選択されていなかった) */}
          {loggedIn ? (
            <Link
              className={`tab${view === "hall" ? " active" : ""}`}
              aria-current={view === "hall" ? "page" : undefined}
              to="/app/reserve"
            >
              会館予約
            </Link>
          ) : (
            <button
              className={`tab${view === "hall" ? " active" : ""}`}
              aria-current={view === "hall" ? "page" : undefined}
              onClick={() => setView("hall")}
            >
              会館予約
            </button>
          )}
          {/* すでに会員の方には入会申込を出さない(オーナー指示) */}
          {!alreadyMember && (
            <button
              className={`tab${view === "apply-chonai" ? " active" : ""}`}
              aria-current={view === "apply-chonai" ? "page" : undefined}
              onClick={() => setView("apply-chonai")}
            >
              {t.joinChonai}
            </button>
          )}
          {/* 子ども会の入会申込はハンバーガーへ移した(オーナー指示)。
              ログインしていない方には、上のタブにも残しておく(入口が見つからないため)。
              ⚠ QRから /kodomo で直接開いたときは、ログイン中でもこのタブを出す。
                 出さないと、どのタブも選ばれていない状態になり現在位置が分からない */}
          {!alreadyKodomo && (!loggedIn || view === "apply-kodomo") && (
            <button
              className={`tab${view === "apply-kodomo" ? " active" : ""}`}
              aria-current={view === "apply-kodomo" ? "page" : undefined}
              onClick={() => setView("apply-kodomo")}
            >
              {t.joinKodomo}
            </button>
          )}
        </div>

        {view === "hall" ? (
          <PublicHallForm />
        ) : view === "privacy" ? (
          <PrivacyPage lang={lang} />
        ) : view === "life" ? (
          <LifeInfoPage lang={lang} />
        ) : view === "apply-chonai" ? (
          <ChonaiJoinForm
            title={t.joinChonai}
            submitLabel={t.formSubmit}
            submittedLabel={t.formSubmitted}
            t={t}
          />
        ) : view === "apply-kodomo" ? (
          <KodomoJoinForm
            title={t.joinKodomo}
            submitLabel={t.formSubmit}
            submittedLabel={t.formSubmitted}
            t={t}
          />
        ) : view !== "notices" ? (
          <div>
            {page === null && <p className="muted">{t.loading}</p>}
            {page && (
              <div className="card">
                <h2 style={{ marginTop: 0 }}>{page.title}</h2>
                <p className="pre">{page.body}</p>
                {page.translated && t.machineNote && <p className="muted">{t.machineNote}</p>}
              </div>
            )}
          </div>
        ) : selected ? (
          <div>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}>
              ← {t.back}
            </button>
            <div className="card">
              <h2 style={{ marginTop: 0 }}>{selected.title}</h2>
              <p className="muted">
                {t.published}: {fmtDateTime(selected.published_at)}
              </p>
              {selected.deadline && (
                <p>
                  <span className="chip chip-orange">
                    {t.deadline}: {fmtDate(selected.deadline)}
                  </span>
                </p>
              )}
              {selected.image_url && (
                <img
                  src={selected.image_url}
                  alt=""
                  style={{ maxWidth: "100%", borderRadius: 8, margin: "8px 0" }}
                />
              )}
              <p className="pre">{selected.body}</p>
              {selected.translated && t.machineNote && (
                <p className="muted">{t.machineNote}</p>
              )}
            </div>
          </div>
        ) : (
          <div>
            {/* ホーム=公開トップ。ログインしている人にだけ会員向けカードが増える。
                ログイン後の並び(オーナー指示 2026-07-29):
                  未確認の回覧 → 町会からのお知らせ → 防災のお知らせ → 広告枠 → 会員レベル
                エリアの地図はログイン後には出さない(会員はもう自分の地域を知っているため)。
                「自分がやること」である会合の出欠・予約は未確認の回覧の直後に置く。 */}
            <UnreadCircularsCard t={t} />
            {loggedIn && <MemberTodoCards />}
            <h2>{t.notices}</h2>
            {circulars === null && <p className="muted">{t.loading}</p>}
            {circulars !== null && circulars.length === 0 && (
              <div className="card">
                <p>{t.noNotices}</p>
              </div>
            )}
            {circulars?.map((c) => (
              <div
                key={c.id}
                className="card"
                style={{ cursor: "pointer" }}
                onClick={() => setSelected(c)}
              >
                <div className="spread">
                  <strong style={{ fontSize: 19 }}>{c.title}</strong>
                </div>
                <div className="muted">
                  {t.published}: {fmtDateTime(c.published_at)}
                  {c.deadline && (
                    <>
                      {" "}
                      <span className="chip chip-orange">
                        {t.deadline}: {fmtDate(c.deadline)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === "notices" && (
          <>
            <AreaAlertsCard lang={lang} t={t} />
            <SponsorList sponsors={sponsors} title={t.ads} />
            {/* エリアの地図は「会員になれる範囲」の案内なので、未ログインの方にだけ出す */}
            {!loggedIn && (
              <AreaMapCard
                title={t.areaTitle}
                desc={t.areaDesc}
                caption={t.areaMapCaption}
                areaLabel={t.areaMapZoneLabel}
              />
            )}
            {/* 会員レベル・通知設定・ログイン方法は毎日見るものではないので下にまとめる */}
            {loggedIn && (
              <>
                <HelpCard isOfficer={isOfficer} />
                <MyProfileCard />
                <MyLevelCard />
                <NotificationCard />
                <GoogleLinkCard />
              </>
            )}
          </>
        )}

        <footer className="site-footer">
          <button className="linklike" onClick={() => setView("privacy")}>
            {PRIVACY[lang]?.title ?? PRIVACY.ja.title}
          </button>
          <p className="muted">{ORG.name}</p>
        </footer>
      </div>
    </div>
  );
}
