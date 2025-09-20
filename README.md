# Aventurootest

Aventurootest is an Eleventy-powered news and magazine site. The Node/Eleventy
stack renders the public pages, while a collection of Python “autopost” scripts
pull curated RSS feeds, clean up the articles, and store them as JSON content
for the static build.

## Prerequisites

- **Node.js 18+** (or another version supported by [Eleventy](https://www.11ty.dev/)).
- **npm** for managing JavaScript dependencies (bundled with Node.js).
- **Python 3.9+** for running the autopost utilities and unit tests.
  - The scripts work with the standard library, but installing
    [`trafilatura`](https://github.com/adbar/trafilatura) and
    [`readability-lxml`](https://github.com/alan-turing-institute/ReadabiliPy)
    is recommended for higher quality article extraction: `pip install
    trafilatura readability-lxml`.

## Installation

Clone the repository and install both the Node and Python tooling:

```bash
git clone <repository-url>
cd aventurootest

# Install Eleventy and other Node dependencies
npm install

# (Optional but recommended) set up an isolated Python environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -U pip trafilatura readability-lxml
```

The repository tracks generated articles in `data/posts.json`. The autopost
scripts update that file; Eleventy reads it when building the site.

## Building the site

Run Eleventy directly with `npx` or by using the npm script:

```bash
npx eleventy        # or: npm run build
```

This generates the static site inside the `_site/` directory.

## Running the autopost scripts

Each autopost module (news, travel, entertainment, etc.) lives in the
`autopost/` directory. They share a feed file (`feeds_*.txt`), a deduplication
database (`autopost/seen_all.json`), and write their results to
`data/posts.json`.

Common usage pattern:

```bash
# Pull the default set of news feeds
python autopost/pull_news.py

# Limit to a specific category or custom feed file
FEEDS_FILE=/path/to/feeds.txt CATEGORY="Travel" python autopost/pull_travel.py
```

Environment variables recognised by the scripts include:

- `FEEDS_FILE` – override the bundled feeds list.
- `CATEGORY` – restrict processing to one category.
- `MAX_PER_CAT`, `MAX_TOTAL`, `MAX_POSTS_PERSIST` – tune quantity limits.
- `FALLBACK_COVER`, `DEFAULT_AUTHOR`, `IMG_PROXY`, etc. – control cover images
  and metadata.

All autopost runs reuse `autopost/seen_all.json` to avoid duplicates. Removing
that file forces a full refresh.

## Autopost CI workflow

The scheduled **Autopost** GitHub Actions workflow still runs every few hours
per category, but it no longer commits straight to `main`. When a script
produces new stories it stages the generated files and updates a draft pull
request on a category-specific branch (`autopost/<slug>`). Each draft PR is
titled `Autopost: <Category> updates` and is continuously refreshed on
subsequent runs until it is merged or closed.

Maintainers promote the curated output to production by reviewing the draft,
marking it “Ready for review” when appropriate, and merging it into `main`.
That merge triggers the normal Eleventy build once, rather than on every
scheduled autopost refresh. The Eleventy CI workflow is configured to ignore
these draft `Autopost:` pull requests, keeping the build queue clear while the
automation runs in the background.

## Testing

The Python tests validate the shared autopost utilities. Run the full suite
with:

```bash
python -m unittest
```

## Deployment notes

Netlify deploys the site with the command `npm run build` and publishes the
generated `_site/` directory (see `netlify.toml`). When hosting behind a path
prefix, Eleventy reads the following environment variables to determine the
base URL:

- `ELEVENTY_PATH_PREFIX`
- `BASE_PATH` (used by Netlify path prefix configurations)
- `PUBLIC_URL`

If none of those are set, the build falls back to auto-detecting GitHub Pages
deployments via `GITHUB_REPOSITORY`, otherwise the site is rendered for the
root path (`/`)
