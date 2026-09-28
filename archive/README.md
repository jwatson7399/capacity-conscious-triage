# Archive

Files moved out of the app build during the Carbon rebuild (2026-09-28). Kept for the
record; nothing here is imported or shipped. Moved with `git mv`, never deleted.

- `src/components/MethodologyDeepDive.tsx`: was imported nowhere.
- `public/walkthrough-v4.html` and `src/components/EvidenceWalkthrough.tsx`: the pre-Carbon
  evidence walkthrough (46 em dashes, Google Fonts request). How it works keeps only its short
  Carbon text (audit fixes, 2026-09-28).
- `src/components/HelpSection.tsx`: the pre-Carbon help. It quoted "+55%" and "+249%",
  cross-benchmark figures that must not be quoted anywhere. Replaced by `src/app/Help.tsx`,
  written from scratch.
