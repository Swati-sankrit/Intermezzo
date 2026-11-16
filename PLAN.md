# Plan: Nov 15 to Dec 3

Deadline: Sat Dec 5, 3:30 AM IST. Target submission: Thu Dec 3, evening IST.
Rule for every day: the app stays deployed and working. Commit daily.

## Setup

**Sun Nov 15 (today)**
- [ ] Read the full Rules tab on Devpost.
- [ ] Request Kiro credits (Resources tab) and join the Kiro Discord.
- [ ] Ask in #kiroween-hackathon whether anyone is building a reading app.
- [ ] Install Kiro. Create a public GitHub repo with an MIT license.
- [ ] Copy the four steering files into `.kiro/steering/` and commit.
      Check `.kiro` is not in `.gitignore`.
- [ ] Start a Devpost draft submission.

**Mon Nov 16**
- [ ] Create spec 1 (reader-core) in Kiro from docs/spec-starters.md. Review it.
- [ ] Scaffold the app. Deploy the empty page to Vercel.
- [ ] Start docs/BUILD_LOG.md: one line per day on what Kiro did well or badly.

## Reader

**Tue Nov 17 - Wed Nov 18**
- [ ] Load a .txt book, split into paragraphs, reveal one at a time.
- [ ] Progress bar and resume from local storage.
- [ ] Property tests for splitting and progress.

**Thu Nov 19**
- [ ] EPUB loading. Pace guide icon.
- [ ] Add 2 public-domain sample books (Project Gutenberg) for the demo.

## Attention

**Fri Nov 20 - Sat Nov 21**
- [ ] Spec 2 (attention-signal) in Kiro.
- [ ] Camera permission screen, calibration, present/away signal.
- [ ] No-camera fallback (tab switch, idle).
- [ ] Test on your own laptop in dim and bright light, with and without glasses.

## Haunts

**Sun Nov 22 - Mon Nov 23**
- [ ] Spec 3 (haunt-engine) in Kiro.
- [ ] Engine with levels, plus three haunts.
- [ ] Create the "new haunt file" hook in Kiro. Screen-record it adding haunt 4.
- [ ] Property tests for the safety rules.

**Tue Nov 24: decision gate**
- [ ] Does upload, read, look away, haunt, look back work on the live site?
- If yes: continue below.
- If no: drop EPUB, word help, and the chapter visitor. Spend Nov 25-26
  fixing the core flow.

## Supporting features

**Wed Nov 25**
- [ ] Tap a word for its meaning. Slow-paragraph rare-word offer.
- [ ] Mood lighting: the page's light and ambience follow the scene's mood.
- [ ] Highlights: button and H key mark the current paragraph; list at
      chapter end.

**Thu Nov 26**
- [ ] Instrumental ambience, volume cap, settings panel.
- [ ] Reduced motion, gentle mode, keyboard-only pass, photosensitivity notice.
- [ ] End-of-chapter fill-in-the-blank. Session stats and streak.
- [ ] Spec 5 (discipline-loop): focus points, chapter rewards, penance scene
      after a breach, spend points to skip it, rest-break prompts.

**Fri Nov 27 - Sat Nov 28: chapter visitor (stretch, only if the gate passed)**
- [ ] Spec 4 (chapter-visitor) in Kiro.
- [ ] Choose an AI service. Put the key in a Vercel serverless function,
      never in browser code. Add a per-visitor message limit.
- [ ] Visitor appears after a chapter is finished, speaks in the character's
      voice, and knows only the text read so far.
- [ ] If the AI call fails, fall back to the fill-in-the-blank check.
- [ ] Kiro Crew experiment (for example, one agent drafts a new haunt and
      another reviews it against the safety rules). Note what worked.
- [ ] Try one MCP server for library docs. Note what it changed.

**Parked: pinch-to-highlight gesture**
- Only if every item above works on the live site by Nov 28. Otherwise skip.

## Evidence

**Sun Nov 29 - Mon Nov 30**
- [ ] Test with 5 to 10 people. Each reads one chapter with haunts on and a
      similar chapter with haunts off (alternate the order).
- [ ] Record for each: paragraphs finished in 15 minutes, look-aways,
      check-question result, and one sentence of feedback.
- [ ] Fix the top three problems they hit.

## Submission

**Tue Dec 1: feature freeze**
- [ ] README with setup steps and screenshots.
- [ ] Kiro write-up: specs vs vibe coding, steering, hooks, property tests
      (with real counterexamples), MCP, Crew. Include what failed.

**Wed Dec 2**
- [ ] Demo video under 3 minutes, public on YouTube, no copyrighted music:
      problem (15s), upload and read with mood lighting (35s),
      look away and haunt (35s), chapter visitor (30s),
      new haunt via hook (25s), user-test numbers and who it is for (25s).
- [ ] Blog post on dev.to that says it was written for Kiroween 2026.
- [ ] Social post starting with #KiroweenHackathon26.

**Thu Dec 3**
- [ ] Open the live site and the repo in a private window and test as a stranger.
- [ ] Check: license visible, `.kiro` present, video public, all links work.
- [ ] Submit. Fri Dec 4 is spare.
