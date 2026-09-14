# Design QA — atualização Android

## Fonte visual

- Source visual truth: `C:\Users\GABRIE~1\AppData\Local\Temp\codex-clipboard-564536fa-7f66-459d-b9ed-0629a12eb3f3.png`
- Implementation screenshot: `C:\Users\Gabriel Morgado\Documents\mais ctrl app\mais-ctrl-mobile\test-results\app-update-modal-implementation.png`
- Source pixels: 328 × 126.
- Implementation pixels: 512 × 968.
- CSS viewport: mobile runtime at 393 × 852 CSS px, deviceScaleFactor 1; the uploaded reference is a compact cropped banner, so the comparison was normalized by hierarchy, affordance and update messaging rather than raw pixels.
- State: authenticated local session, light theme, Android build `9.9.9` available, modal opened from the update icon beside the MaisCtrl badge.

## Comparação

### Full view

The reference presents an available-build notification with the version, release note and APK action. The implementation moves that information out of the content stream and into a centered modal opened by a compact update icon, keeping the dashboard usable during the grace period and reserving the blocking state for expiration.

### Focused region

The modal keeps the reference intent: clear version identification, a short change summary and a direct APK download. The centered white surface, purple action and dimmed background establish focus inside the phone screen. The modal also exposes the remaining six-hour window; after expiration the same surface becomes mandatory, removes the close action and prevents access behind the overlay.

## Findings

- No actionable P0, P1 or P2 findings remain.
- Intentional difference: the inline banner was removed because the requested interaction is an icon beside the badge that opens a centered modal.
- P3 follow-up: the remaining-time label can later include a localized absolute deadline if the release service starts returning a timezone-aware expiry policy.

## Comparison history

- Pass 1: the first implementation was an inline banner, which competed with the dashboard content and did not match the requested interaction.
- Pass 2: the final capture uses the update icon, centered modal, dimmed focus state, six-hour grace copy and direct APK action. The expired state was also covered by an automated test.

## Implementation checklist

- [x] Update icon appears beside the MaisCtrl badge only when a newer Android build is detected.
- [x] Icon opens a centered, focused modal with version, summary and direct APK download.
- [x] Six-hour grace period is persisted per release version in local storage.
- [x] Expired grace period locks the app behind a mandatory update modal.
- [x] Runtime integrity, build and all local application tests pass.

## Follow-up polish

- Keep the release metadata endpoint monitored so the app can detect a newer build when it reconnects after an offline session.

final result: passed
