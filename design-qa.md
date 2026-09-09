# Design QA — fluxo de autenticação mobile

## Target and implementation

- Source visual truth: `C:\Users\GABRIE~1\AppData\Local\Temp\codex-clipboard-7abcae7e-0bf7-4531-bea8-1d56891c2c1c.png`
- Implementation: `http://localhost:4173/` in the Codex in-app browser.
- State compared: cadastro aberto, com os campos vazios; login também foi aberto para verificar a preservação do background.
- Source pixels: 477 × 849, including the device frame.
- Implementation evidence: inline Codex in-app-browser screenshot captured during this QA pass; the browser tool does not expose a filesystem path for that capture.
- Normalization: visual comparison used the app viewport inside the mobile device preview; the preview canvas was scaled by the browser stage, so browser canvas margins were excluded from the judgment.

## Comparison

The registration flow keeps the field hierarchy, CTA, footer action, and back control from the reference. Per the latest product instructions, the signup background image and panel separation were intentionally removed and replaced with one continuous dark-gray surface; the full wordmark was also replaced by a centered symbol. The login state was opened afterward and still renders the colorful `auth-panels.png` background with the complete lockup.

Focused checks:

- Typography: Roboto-based hierarchy, uppercase kicker, bold heading, compact labels, and readable form copy are consistent with the reference direction.
- Spacing and layout: form fields, CTA, footer, and panel spacing remain aligned to the existing mobile flow and fit inside the simulated device viewport.
- Colors and tokens: signup uses one continuous dark-gray surface; login preserves the colorful background and dark panel.
- Image fidelity: the existing supplied logo asset remains in use; signup uses the symbol-only variant and login keeps the complete lockup.
- Copy and content: signup labels and actions match the requested flow and remain interactive.

## Interaction checks

- Opened signup from the auth flow.
- Confirmed the signup screen has no background image.
- Validated the four signup steps: name, e-mail, password, and optional profile photo.
- Confirmed the progress indicator advances and the top back control returns to the previous signup step.
- Opened login from signup and confirmed the background image remains present there.
- Filled name and e-mail, advanced to the password step, and confirmed the create-account action remains gated by the password requirement.
- Checked preview console logs: no warnings or errors reported.
- Ran `npm run check:runtime` and `npm run build`: both passed.

## Findings

No actionable P0, P1, or P2 visual findings remain.

Intentional deviation: signup no longer matches the reference's colorful top area because the latest instruction explicitly requests a gray signup-only surface.

## Implementation Checklist

- [x] Signup-only gray background.
- [x] Login background preserved.
- [x] Signup flow works as four steps: name, e-mail, password, and optional profile photo.
- [x] Signup form remains functional with step navigation.
- [x] Runtime and production build validated.

## Follow-up Polish

- [P3] If desired, the gray tone and panel vertical position can be tuned after testing on a physical Android device.

final result: passed
