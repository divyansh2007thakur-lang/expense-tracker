# Daybook expense tracker

A responsive, browser-based expense tracker that can be hosted on GitHub Pages. Expenses are stored in the browser's local storage; they are not sent to a server.

## Run

```bash
python3 main.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser. Stop the server with `Ctrl+C`.

## Publish with GitHub Pages

1. Push this project to a GitHub repository on the `main` branch.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions**.
4. Push to `main` (or manually run the **Deploy to GitHub Pages** workflow from the Actions tab).
5. Once the workflow succeeds, GitHub will show the live site URL under **Settings → Pages**.

The workflow in `.github/workflows/pages.yml` publishes the static app automatically. No Python server or external database is needed for the hosted version.

## Privacy and data

- The website is public, but each browser keeps its own expenses in local storage. Visitors cannot see one another's entries.
- There are no user accounts, cloud backups, or syncing between devices. Expenses are specific to the browser and site origin.
- Clearing browser data can permanently delete expenses. Keep the site URL the same when revisiting it.
- The currency selector changes display formatting only; it does not convert exchange rates.
- Google Fonts are loaded from Google Fonts.

## Features

- Add expenses with a description, amount, category, and date
- Review monthly totals, transaction counts, and spending by category
- Browse past months and delete expenses
- Choose a display currency (INR, USD, EUR, or GBP)

## Test

```bash
python3 -m unittest -v
```
