# Glossary

Domain vocabulary this app is built around — mostly Indian campus-recruitment terminology that isn't self-explanatory if you haven't been through the process yourself.

## Event types

- **PPT** — Pre-Placement Talk. A company presentation/info session before the actual selection process starts; usually not evaluative, more informational, though attendance sometimes matters for eligibility.
- **OT (Online)** — an online test, usually a coding/aptitude assessment taken remotely on your own device.
- **OT (Offline) / DC** — an offline test taken at a **Data Center (DC)** — a physical proctored test venue (often a third-party facility, not the student's own campus), typically for higher-stakes assessments where remote proctoring isn't trusted.
- **Interview** — an actual interview round. Has a `round` field (free text — "Tech R1", "HR", etc.) since companies don't standardize round naming.

## Pipeline (kanban statuses, in board order)

`Upcoming → PPT Done → OT Scheduled → OT Cleared → Interview R1 → Interview R2 → HR → Offer / Rejected / Ghosted`

- **Upcoming** — scheduled, hasn't happened yet.
- **PPT Done** — attended the pre-placement talk; waiting on next step.
- **OT Scheduled** — an online/offline test has been scheduled.
- **OT Cleared** — passed the test, waiting for interview scheduling.
- **Interview R1 / R2** — first/second interview round. Not every company has exactly two; the app just gives you two generic slots and a `round` free-text field on the event itself for anything more specific.
- **HR** — the HR round — typically the final formality-ish round (culture fit, compensation discussion) after technical rounds have passed, though it can occasionally still be a rejection point.
- **Offer** — an offer was extended. Terminal, positive.
- **Rejected** — terminal, negative — didn't clear a round.
- **Ghosted** — terminal, ambiguous — no explicit rejection, but the company stopped responding. Distinct from `Rejected` because it's a genuinely different experience (and sometimes a different follow-up strategy) even though the practical outcome is the same.

## Other fields

- **Mode** — Online / Offline / Hybrid. How the event is conducted, independent of its type (an interview can be online or offline; so can a test).
- **CTC** — Cost To Company — the standard Indian term for total annual compensation (not just take-home salary; includes benefits, bonuses, etc.), which is why it's stored as free text rather than a number — actual offer figures get expressed inconsistently across companies (some quote CTC, some quote in-hand, some break it out by component) and the app doesn't try to normalize that.
- **Stipend** — same field as CTC, used loosely for internship compensation instead of full-time CTC.
- **Resume version** — a free-text tag (e.g. "v3-sde") letting you track which version of your resume you submitted for a given event, since it's common to maintain multiple tailored versions during a season.
- **Priority** — Low/Medium/High, a purely personal ranking of how much a given opportunity matters to you — has no bearing on the actual recruitment process, just your own attention triage.

## Why no login

The app is explicitly single-user — built for one person tracking their own placement season, not a multi-tenant product. There's no login screen, and the database's Row Level Security policies are fully open (see `docs/DATABASE.md`) rather than scoped to a user ID, because there's no user ID to scope by. This is a deliberate simplicity choice for a personal tool, not an oversight — see `docs/ARCHITECTURE.md`'s note on `requireSupabaseAuth` existing as unused scaffolding for if that ever changes.
