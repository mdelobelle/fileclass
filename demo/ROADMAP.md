# Demo series roadmap

One take per atomic feature, ordered so a take only needs what earlier takes
already showed. The budget is **60 seconds of narration**, which lands a finished
video between two and three minutes depending on how much typing it asks for — see
[SCENARIO.md](SCENARIO.md#budget-60-seconds-of-narration-plus-the-typing-tax).
All subtitles are in English — non-English speakers turn on YouTube's captions.

How to use this list: pick the next unrecorded take, propose its step list, get it
approved, then write `NNN_*/scenario.yaml` + `demo-vault/` (see
[SCENARIO.md](SCENARIO.md)). New features get a take of their own, proposed with
the feature itself — that's a rule in the repo's `CLAUDE.md`, and the take doubles
as the manual smoke test.

`Formula` and `Lookup` are absent: out of the plugin's scope. The CLI has no take
either — driving a terminal with burned-in subtitles isn't tooling we have, and
its audience reads the docs. "Coming from Metadata Menu" and "which level of
normalization" belong in a GitHub discussion thread, not in a video.

## The cast

The vault is a media library, and it's the *same* library across the whole
series — a class introduced in one take is the one queried three takes later.
Recurring material, all of it widely known:

| Kind | Notes |
| ---- | ----- |
| Books | *Dune* (Frank Herbert, Chilton Books, 1965), *The Lord of the Rings* (J.R.R. Tolkien, Allen & Unwin, 1954) |
| Comics | *Tintin in Tibet* (Hergé, Casterman, 1960) |
| Albums | *Kind of Blue* (Miles Davis, Columbia, 1959) |
| Articles | *As We May Think* (Vannevar Bush, The Atlantic, 1945) |
| People | Frank Herbert, J.R.R. Tolkien, Hergé, Miles Davis, Vannevar Bush |
| Classes | `Media` (parent), `Book`, `Comic`, `Album`, `Article`, `Author`, `Artist`, `Activity` |

## Arc 1 — getting started

| # | Take | Feature | Vault gains | Status |
| - | ---- | ------- | ----------- | ------ |
| 001 | Install and set up | store install, class folder, `fileClass` key | empty vault | ✅ [published](https://www.youtube.com/watch?v=KKG_36JGjWA) |
| 002 | Your first class | `Create a class`, `Input` field | `Book.publisher` | ✅ [published](https://www.youtube.com/watch?v=1gU612KaXYg) |

## Arc 2 — the simple types

One take per type: a minute each, exactly what someone asks for in a support
thread, and a tight smoke test of that type's input path.

| # | Take | Feature | Vault gains | Status |
| - | ---- | ------- | ----------- | ------ |
| 003 | Number, and why it isn't text | `Number` (min/max/step) | `Book.pages` | ✅ [published](https://www.youtube.com/watch?v=W1KAokens_4) |
| 004 | Select — the values you allow | `Select`, inline values list | `Book.genre`, Tolkien typed | ✅ [published](https://www.youtube.com/watch?v=_kHMoXBNY7k) |
| 005 | Boolean — the checkbox | `Boolean` (false vs unset) | `Book.read` | ✅ [published](https://www.youtube.com/watch?v=4BvyykBs-8s) |
| 006 | Cycle — one click, next value | `Cycle`, one gesture per type, Alt-click | `Book.ownership` | ✅ [published](https://www.youtube.com/watch?v=F6fgdtexSRQ) |
| 007 | Date — the format you store | `Date`, picker, three-level write format, format check | `Book.published` | ✅ [published](https://www.youtube.com/watch?v=1c2a1usAPRU) |
| 008 | DateTime and Time | `DateTime`, `Time` (a point in time vs a time of day) | `Activity` class, `Reading group` note | ✅ [published](https://www.youtube.com/watch?v=bInkg1jLOmM) |
| 009 | Duration | `Duration` (words, spinners, ISO on disk) | `Album` class, `Kind of Blue` note | ✅ [published](https://www.youtube.com/watch?v=G3mUhJ1Ywuc) |
| 010 | CycleDuration: a sequence, not a duration | `CycleDuration`, `Duration` presets | `Atomic Habits` note, `Book.next interval` | ✅ [published](https://www.youtube.com/watch?v=lhrJ2a5pFRY) |
| 010b | Set next date | the `Next interval field` option, and the rotation it drives | `Book.review` | ✅ [published](https://www.youtube.com/watch?v=45_n091aKkM) |
| 011 | Several values in one field | `Multi`, `MultiInput` | `Book.themes`, `Book.awards` | ✅ [published](https://www.youtube.com/watch?v=g0FilbQ8N3w) |

## Arc 3 — fields that point at notes

| # | Take | Feature | Vault gains | Status |
| - | ---- | ------- | ----------- | ------ |
| 012 | Link a note to another note | `File` (candidates from a base) | `Author` class + notes, `Authors.base` | ✅ [published](https://www.youtube.com/watch?v=orwUfnJCWT4) |
| 013 | Translators, illustrators, several links | `MultiFile`, filter box | `Comic` class, Tintin typed, `Comic.contributors`, 15 people | ✅ [published](https://www.youtube.com/watch?v=t7avhsV-ZXk) |
| 014 | Covers and attachments | `Media`, `MultiMedia`, thumbnails | `Images/` + `Images.base`, `Book.cover` | |
| 015 | Candidates that depend on another field | conditional candidates | `Comic.series` | |

## Arc 4 — the richer types

| # | Take | Feature | Vault gains | Status |
| - | ---- | ------- | ----------- | ------ |
| 016 | Templated input | `Input` template (`{{placeholder}}`) | `Book.shelf` | |
| 016b | Dates as links to your daily notes | `Date` insert-as-link, templated `Link path`, `Link alias` | `Book.published` as a daily-note link | |
| 017 | Pick an icon | `Icon` | `Media.icon` | |
| 018 | Colors, and your own palette | `Color`, custom colors | `Book.genre` color | |
| 019 | A place on a map | `Location` | `Activity.branch` | |
| 020 | A group of fields inside a field | `Object` | detailed `Book.publisher` | |
| 021 | A list of grouped fields | `ObjectList`, display template | `Book.editions` | |
| 022 | When raw is the honest answer | `JSON`, `YAML` | `Album.credits` | |

## Arc 5 — modelling a class

| # | Take | Feature | Vault gains | Status |
| - | ---- | ------- | ----------- | ------ |
| 023 | Fields you can't leave empty | required fields | `Book.title` required | |
| 024 | One parent class, three children | inheritance (`extends`) | `Media` → `Book`/`Album`/`Comic` | |
| 025 | Two classes on one note | multiple binding, global class, alias | `Article` class | |

## Arc 6 — filling fields fast

| # | Take | Feature | Vault gains | Status |
| - | ---- | ------- | ----------- | ------ |
| 026 | Every field of a note, one modal | note-fields modal | — | |
| 027 | Right-click your way through it | context menus | — | |
| 028 | Edit buttons in the properties panel | property edit buttons | — | |
| 029 | Seeing at a glance what's typed | field indicators (tab, explorer, links, bases) | — | |
| 030 | Change one field across a whole class | bulk edit (set-where) | — | |
| 031 | New notes that arrive already typed | Templater / Templates | a Book template | |

## Arc 7 — Bases views

| # | Take | Feature | Vault gains | Status |
| - | ---- | ------- | ----------- | ------ |
| 032 | A table for a class, generated | `Create a base for a class` | `Book.base` | |
| 033 | Schema changed? the base follows | `Sync this class to its base` | — | |
| 034 | Editing right in the table | `fileclass-table` view | — | |
| 035 | What's missing, in a column | validation columns | — | |
| 036 | A base inside a note | embedding | a dashboard note | |

## Arc 8 — canvas and settings

| # | Take | Feature | Vault gains | Status |
| - | ---- | ------- | ----------- | ------ |
| 037 | A field that follows your canvas | `Canvas` | a reading-map canvas | |
| 038 | Groups on a canvas as data | `CanvasGroup`, `CanvasGroupLink` | — | |
| 039 | The settings, one pass | behaviour toggles, indicators, defaults | — | |

**41 takes** (39 numbered, plus `010b` and `016b` — facets that earned their own
take), roughly 50 minutes of finished video.
