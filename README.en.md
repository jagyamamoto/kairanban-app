# kairanban-app

**A free, open-source web app (PWA) for Japan's neighborhood associations (chōnaikai).**

*[日本語版 README はこちら](README.md)*

kairanban-app digitizes the *kairanban* — the paper circular board passed from door to door
in Japanese neighborhoods for decades. Circulars, hall reservations, meeting RSVPs, disaster
information, a members-only photo blog and membership applications, in five languages
(Japanese, Easy Japanese, English, Chinese, Vietnamese). It runs from ¥0/month on
Cloudflare's free tier.

- **Website**: https://kairanban.jagproject.com/
- **Dev story in English (failures included)**: https://kairanban.jagproject.com/ai-story-en.html
- **Press & media**: https://kairanban.jagproject.com/press-en.html
- **Live demo** (fictional data, resets every 24h): https://kairanban-demo.jagyamamoto.workers.dev
  - Log in as admin: `09000000001` / as regular member: `09000000008`

## Why it exists

Electronic circular boards are becoming a market in Japan — mostly monthly subscriptions,
which drain association fees out of the community. kairanban-app is designed the other way
around: free infrastructure, open code, and maintenance that can be done by the
association's own IT-literate members or local businesses, so money and know-how circulate
inside the neighborhood. We call this **"digital self-governance"** — residents using
digital tools to run their own community.

## Design principles

- **Members who aren't comfortable with smartphones come first.** The install guide keeps
  every instruction inside the top 42.7% of the screen — the area the iOS share sheet never
  covers (measured on real devices) — so there is nothing to memorize.
- **Privacy by structure.** Photos can never be made public; members cannot connect
  one-to-one; each association hosts its own data.
- **Failures are documented.** The first onboarding manual scored 20/100 and was rebuilt
  from scratch. The whole record is published.

## How it was built

Directed in Japanese by a non-programmer — an active neighborhood-association officer who
had not written code since BASIC in junior high — using a generative AI coding agent
(Claude Code). Public beta in about two weeks; updated daily since. Developed as a working
proposal to his own association in Koto ward, Tokyo, and released for any association to
use. We are recruiting the **first co-verification partner association**.

## Status and support

This is not a packaged product. It is a git-based open-source project under active
development, run by Jag Project, LLC as a flagship experiment in AI-era development and
digital self-governance.

- **No warranty and no support.** Adopting associations are responsible for their own
  operation and data.
- Setup requires directing an AI coding tool (a paid plan of Claude Code or similar is
  practically necessary). See the Japanese setup guide:
  [docs/セットアップ手順.md](docs/セットアップ手順.md)
- Issues and pull requests are welcome — field reports from real associations most of all.

## License

MIT — free to modify and use commercially. See [LICENSE](LICENSE).

Developed by **Jag Project, LLC** (representative: [Jag Yamamoto](https://www.jagproject.com/about)).
Media inquiries: see https://kairanban.jagproject.com/press-en.html
