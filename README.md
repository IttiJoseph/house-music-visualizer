# Night House — how to build it

## What's in this folder

- `BRIEF.md` — the full spec Claude Code works from. You don't need to edit it.
- `source/house.html` — your interactive house.
- `source/track.js` — your final Strudel track.

## Before you start (one time)

1. Install **Claude Code** (desktop app, Code tab) and sign in.
2. Make a free **GitHub** account.
3. Make a free **Vercel** account and choose "Continue with GitHub".

## Build it

1. Unzip this folder somewhere easy, like your Desktop.
2. Open Claude Code and point it at the `night-house-kit` folder.
3. Paste the prompt below and let it work. It'll ask you to approve some steps,
   like installing tools or recording the audio.
4. When it says the site is running locally, open the link and click around.
   Check every room plays, the beat stays in sync, and the loop doesn't click.

## The prompt

```
Read BRIEF.md and build the Night House site exactly as it describes.
I'm a designer, not a developer, so explain each step in plain words
and make technical decisions yourself. Work in stages: render the
audio stems first and let me listen to them, then build the site,
then help me put it on GitHub and Vercel.
```

## Putting it online

Claude Code will push the project to GitHub for you. Then on vercel.com:
**Add New → Project → pick the repo → Deploy.** You'll get a public link.
After that, every change Claude Code pushes goes live on its own.

## Later

When you're ready for the hit flicker, background or title font, open Claude Code in the
same folder and describe what you want. The brief already set the project up for these.
