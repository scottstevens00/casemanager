# Case Manager

Scott's case, task, deadline and follow-up manager for med mal and premises defense work.

- **PC app:** https://scottstevens00.github.io/casemanager/ — open in Chrome and install it (⋮ → Cast, save, and share → Install page as app).
- **Phone app (Android):** https://github.com/scottstevens00/casemanager/releases/latest/download/CaseManager.apk

## Where the data lives
All case data stays on the device it was entered on (Chrome's storage on the PC, app storage on the phone). The PC can also keep a backup file you choose. The PC and phone sync by showing and scanning QR codes, with no server or cloud in between. This repository contains only the app's code.

## What's in it
- Cases with caption, court, judge, carrier, claim and file numbers, and contacts
- Assignments with four dates: when you were asked, the deadline you were given, the actual (court) due date, and when you finished — plus on-time tracking. Summary reports get a 10-business-day goal and a 30-business-day hard deadline
- Follow-ups on letters and emails, with a nudge every 5 business days until the loop is closed
- "Log what happened" workflows: new case — my usual tasks for a supervising attorney (SOL memo, answer, IDS, discovery requests, QPO, AOMD, MILs; remembers which ones you do for each attorney), answer filed, deposition or meeting, letter sent, discovery served on us, motion hearing, case evaluation, order entered
- Michigan deadline calculator (MCR 1.108 counting, MCR 8.110(D)(2) court holidays) with citations
- Scheduling order scanner: reads e-filed and scanned PDFs on the device (pdf.js, offline OCR, and Chrome's on-device Gemini Nano when available)
- Time entries in tenths with UTBMS task and activity codes
- Weekly team report (.xlsx plus email text), time export, and Outlook calendar (.ics) export
- Pop-up reminders on the PC while it's open; scheduled notifications on the phone

## Development
```
npm install
npm run dev        # local dev server
npm test           # deadline math, order reader and workflow tests
npm run build      # production build into dist/
npm run sync       # build and copy into the Android project
```
Pushing to `main` runs `.github/workflows/build.yml`, which tests, publishes the PC app to GitHub Pages and attaches a signed APK to a new release (signing key in the `ANDROID_KEYSTORE` secret).
