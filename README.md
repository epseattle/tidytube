# TidyTube

TidyTube is a totally free, serverless, client-side web application designed to help you quickly organize, clean up, and batch-manage your YouTube account. If you've ever been frustrated by YouTube's inability to let you select multiple videos at once to delete them, move them between playlists, or clear out dead subscriptions holding a grudge, this is for you.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/YOUR_USERNAME)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy_Me_A_Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/YOUR_USERNAME)
[![GitHub Sponsor](https://img.shields.io/badge/Sponsor-EA4AAA?style=for-the-badge&logo=github&logoColor=white)](https://github.com/sponsors/YOUR_GITHUB_USERNAME)
[![Patreon](https://img.shields.io/badge/Patreon-F96854?style=for-the-badge&logo=patreon&logoColor=white)](https://patreon.com/YOUR_USERNAME)

## Features
*   **Batch Delete & Move:** Select dozens of videos at once and move them between playlists or delete them entirely with a single click.
*   **Mass Unsubscribe:** Tired of your subscription feed being clogged? View all your subscriptions, sort them alphabetically, and easily batch unsubscribe.
*   **Deduplicate Subscriptions:** Automatically scan your playlists for videos that have been added twice and delete the duplicates.
*   **No Server Tracking:** TidyTube runs 100% in your browser. It talks directly to the official YouTube API. No data passes through our servers.

## How it works: Bring Your Own Key (BYOK)
Because bulk deletion is technically "expensive" on the YouTube API and Google heavily limits how many API requests third-party apps can make per day (10,000 units globally), TidyTube operates on a **Bring Your Own Key** model. This guarantees the app is infinitely scalable and completely free.

To use the live site at `https://epseattle.github.io/tidytube`:
1. Follow the integrated 3-step setup wizard on the landing page to quickly spin up a free Google Cloud project.
2. Generate an OAuth Client ID.
3. Paste it into TidyTube to instantly unlock unlimited playlist management power.

## Local Development
Since this is a vanilla JS application with no bundlers required initially, you can clone and run it using any simple static HTTP server. Note: because we use ES modules, you must view it over `http://`, not `file://`.

```bash
git clone https://github.com/epseattle/tidytube.git
cd tidytube
npm install
npm run dev
```

## Contributing
Issues and Pull Requests are always welcome! Since YouTube frequently heavily rate-limits their API, optimizations to caching layers and batch operations (`Promise.allSettled` improvements) are particularly appreciated.

## License
MIT License. Free to fork and rebuild!
