#!/usr/bin/env bash
#
# Release download counts, as a table.
#
#   tools/release-stats.sh                 # this repo, every release
#   tools/release-stats.sh -n 5            # the five most recent
#   tools/release-stats.sh -r owner/name   # another repo
#   tools/release-stats.sh --csv           # same numbers, for a spreadsheet
#
# What the numbers are: GitHub counts a download per **asset**, and Obsidian's installer
# fetches three of them (main.js, manifest.json, styles.css). `main.js` is therefore the
# figure to read — one per install or update — and `assets` is mechanically about three
# times it, which says nothing more.
#
# `latest` is how long a release was the one the store handed out — from its publication
# to the next one's — and `dl/day` is its downloads over that window. Since installs come
# through the store, an old release is only fetched by accident, so the rate is what makes
# two releases comparable when one stood for a day and another for a week.
#
# What they are not: installs from the community store. Obsidian keeps its own count at
# releases.obsidian.md/stats/plugin; this reports it when that endpoint answers, and says
# so when it does not — it returns an empty object from some networks, which is not the
# same as a plugin nobody installed.
set -euo pipefail

repo=""
limit=0
format="table"

while [ $# -gt 0 ]; do
	case "$1" in
		-r | --repo) repo="${2:?--repo needs owner/name}"; shift 2 ;;
		-n | --limit) limit="${2:?--limit needs a number}"; shift 2 ;;
		--csv) format="csv"; shift ;;
		-h | --help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
		*) echo "unknown option: $1" >&2; exit 2 ;;
	esac
done

command -v gh >/dev/null || { echo "gh is required: https://cli.github.com" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 1; }

# The repo of the current directory unless one was named.
if [ -z "$repo" ]; then
	repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
fi

releases=$(mktemp)
stats=$(mktemp)
trap 'rm -f "$releases" "$stats"' EXIT

# `--paginate` so a project with more than thirty releases still counts them all.
gh api "repos/$repo/releases" --paginate >"$releases"

# Obsidian's own numbers, fetched before the table so both can be printed together.
# Never fatal: it is a different figure, and it is not always reachable.
curl -fsS --max-time 10 https://releases.obsidian.md/stats/plugin >"$stats" 2>/dev/null || echo '{}' >"$stats"

python3 - "$releases" "$stats" "$limit" "$format" "$repo" <<'PY'
import json
import sys
from datetime import datetime, timezone

releases_path, stats_path, limit_arg, fmt, repo = sys.argv[1:6]
limit = int(limit_arg)


def when(release):
    """A release's publication as a datetime, or None for one never published."""
    stamp = release.get("published_at") or release.get("created_at")
    return datetime.fromisoformat(stamp.replace("Z", "+00:00")) if stamp else None

with open(releases_path) as fh:
    releases = json.load(fh)

# Sorted by publication so the windows are right whatever order the API returns them in,
# and drafts left out of the chain: one was never the release the store handed out.
published = sorted(
    (r for r in releases if not r.get("draft") and when(r)), key=when, reverse=True
)
now = datetime.now(timezone.utc)
window = {}
for i, r in enumerate(published):
    ends = when(published[i - 1]) if i else now
    window[r["id"]] = (ends - when(r)).total_seconds() / 86400

rows = []
for r in releases:
    assets = {a["name"]: a["download_count"] for a in r.get("assets", [])}
    days = window.get(r["id"])
    main = assets.get("main.js", 0)
    rows.append(
        {
            "tag": r["tag_name"],
            "date": (r.get("published_at") or r.get("created_at") or "")[:10],
            "draft": r.get("draft", False),
            "main": main,
            "all": sum(assets.values()),
            "days": days,
            # A window under an hour averages to a number that says more about the clock
            # than about the release — two versions published the same afternoon do that.
            "rate": (main / days) if days and days > 1 / 24 else None,
        }
    )

# Newest first, as the releases page shows them.
if limit > 0:
    rows = rows[:limit]

if fmt == "csv":
    print("tag,published,main_js,all_assets,days_latest,downloads_per_day")
    for r in rows:
        days = f"{r['days']:.2f}" if r["days"] is not None else ""
        rate = f"{r['rate']:.1f}" if r["rate"] is not None else ""
        print(f"{r['tag']},{r['date']},{r['main']},{r['all']},{days},{rate}")
    raise SystemExit

if not rows:
    print(f"{repo}: no releases")
    raise SystemExit

w_tag = max(3, max(len(r["tag"]) + (8 if r["draft"] else 0) for r in rows))
total_main = sum(r["main"] for r in rows)
total_all = sum(r["all"] for r in rows)
rule = "─" * (w_tag + 58)


def days_str(days):
    """A window, in the unit that makes it readable — `0.1` said nothing, `2.4h` does."""
    if days is None:
        return "—"
    if days < 1:
        return f"{days * 24:.1f}h"
    return f"{days:.1f}" if days < 10 else f"{days:.0f}"


print(f"\033[1m{repo}\033[0m — {len(rows)} release(s)")
print(
    f"{'tag':<{w_tag}}  {'published':<10}  {'main.js':>8}  {'assets':>7}  "
    f"{'latest':>6}  {'dl/day':>7}  share"
)
print(rule)
for r in rows:
    share = (100 * r["main"] / total_main) if total_main else 0
    tag = r["tag"] + (" (draft)" if r["draft"] else "")
    rate = f"{r['rate']:.1f}" if r["rate"] is not None else "—"
    # A bar rather than a second number: what the eye wants here is which release the
    # downloads went to, not the percentage to one decimal.
    bar = "█" * round(share / 4)
    print(
        f"{tag:<{w_tag}}  {r['date']:<10}  {r['main']:>8}  {r['all']:>7}  "
        f"{days_str(r['days']):>6}  {rate:>7}  {share:>5.1f}% {bar}"
    )
print(rule)
spent = sum(r["days"] for r in rows if r["days"])
overall = f"{total_main / spent:.1f}" if spent else "—"
print(
    f"{'total':<{w_tag}}  {'':<10}  {total_main:>8}  {total_all:>7}  "
    f"{days_str(spent):>6}  {overall:>7}"
)

# The community store's own count, when it answered.
try:
    with open("manifest.json") as fh:
        plugin_id = json.load(fh)["id"]
except Exception:
    plugin_id = None

if plugin_id:
    try:
        with open(stats_path) as fh:
            entry = json.load(fh).get(plugin_id)
    except Exception:
        entry = None
    print()
    if entry:
        print(f"community store — {entry.get('downloads', '?')} installs, latest {entry.get('latest', '?')}")
    else:
        print("community store — releases.obsidian.md answered nothing for this plugin.")
        print("  It returns an empty object from some networks; try it from a browser.")
PY
