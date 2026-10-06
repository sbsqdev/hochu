# хочу · hochu

A trilingual (🇷🇺 RU / 🇬🇧 EN / 🇹🇷 TR) **wishlist + goals social app**. Put every *"I want…"*
into categories and priority levels — goals, ambitions, plans, events, concerts, leisure,
habits (with how-often) — Obsidian-style. Complete them to earn XP, levels, streaks and
loyalty rewards. Share with friends, rate each other's wishes, and get AI-style coaching
grounded in habit science.

## Run it

No build, no backend. Just serve the folder over HTTP:

```bash
cd hochu
python3 -m http.server 8777
# open http://localhost:8777
```

Everything (accounts, wishes, friends, XP) is saved in the browser's `localStorage`.
It's a front-end prototype — a real product would move auth & data to a server.

## What's in it

- **Accounts** — sign up / sign in (local PIN). Switch language anytime.
- **New hochu** — title, description, **category** (10), **priority** (Someday→Burning),
  **type** (Goal / Habit / Event), **habit frequency** (daily / 3× / weekly / monthly),
  **deadline**, **privacy** (Public / Friends / Private), **#hashtags**, and **steps**
  (project-management sub-tasks).
- **My hochu** — cards with priority rails, deadline countdowns, step progress bars.
  Tick steps → earn XP; finish all → auto-complete with confetti 🎉.
- **Feed** — your public/friends wishes + friends' wishes. Like / rate any wish.
- **Friends** — add by @username, browse demo profiles and their wants.
- **Coach** 🧭 — pick a wish, get a tailored SMART plan (deadline-aware); "Apply steps"
  pushes them onto the wish. Plus best-practice tips paraphrased from habit research
  (Stanford/BJ Fogg, Harvard, Yale).
- **Gamification** — points, levels, day-streaks, "Realized" badges, shareable links.

## Files

| file | purpose |
|------|---------|
| `index.html` | shell + auth screen |
| `styles.css` | dark Obsidian-style theme, fully responsive |
| `i18n.js` | all RU / EN / TR strings |
| `data.js` | categories, coaching tips, demo friends |
| `app.js` | all logic (state, render, compose, coach, XP) |

## Roadmap (from the product vision)

- Real backend + auth; friend requests across real accounts
- Loyalty-card / partner program (brands, redeemable rewards)
- Public wishlist pages shareable to other platforms
- Real LLM coaching instead of the rule-based planner
- Hashtag discovery feed; connect over shared wants
