# Archive

Files moved out of the app build during the Carbon rebuild (2026-09-28). Kept for the
record; nothing here is imported or shipped. Moved with `git mv`, never deleted.

- `src/components/MethodologyDeepDive.tsx`: was imported nowhere.
- `src/components/EvidenceWalkthrough.tsx`: the pre-Carbon iframe wrapper for the walkthrough.
- `public/walkthrough-v4.html` was archived here on 2026-09-28 and moved back to `public/` the same
  day (branch `walkthrough-original`): its numbers now come from `public/walkthrough-model.js`, it has
  no em dashes, and How it works opens it (`src/app/WalkthroughFrame.tsx`).
- `src/components/HelpSection.tsx`: the pre-Carbon help. It quoted "+55%" and "+249%",
  cross-benchmark figures that must not be quoted anywhere. Replaced by `src/app/Help.tsx`,
  written from scratch.
