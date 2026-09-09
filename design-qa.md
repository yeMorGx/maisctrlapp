# Design QA — fluxo de autenticação mobile

final result: passed

## Comparison target

- Source visual truth: `C:/Users/GABRIE~1/AppData/Local/Temp/codex-clipboard-bc1d68b6-d25b-43c7-ba32-15de61f7472e.png`
- Latest visual refinement: `C:/Users/GABRIE~1/AppData/Local/Temp/codex-clipboard-4042cb30-500a-48cf-a9af-5537432eb3d0.png`
- Source pixels: `690 x 403`; triptych containing splash, welcome, and returning-user references.
- Implementation: `http://localhost:4173/`, Codex In-app Browser capture.
- Implementation capture: browser-rendered screenshot captured from the `data-testid="device-screen"` region; the CUA screenshot is not persisted as a filesystem file.
- Viewport used for QA: browser `1400 x 1200`.
- Implementation screen: `393 x 852` CSS pixels at 1:1; no density resampling used.
- State: welcome screen after the splash transition, with the provided logo, abstract color-band background, headline and centered hero mark, bottom dark panel, and two pill CTAs.
- Incremental state: dashboard after the simulated login, with a neutral shadcn-like surface, overview metrics, upcoming payments, quick actions, and bottom navigation.

## Evidence

Full-view comparison confirms the intended visual language: near-black app surface, white logo, translucent brand lockup, cobalt/lilac/rose vertical panels, rounded dark bottom sheet, and high-contrast white pill buttons.

The latest reference refinement is represented in the welcome state with “Você no controle.” above a centered MaisCtrl mark, filling the open background area without competing with the anchored panel.

The dashboard increment follows the original `mais-ctrl` control-center structure in a phone-native composition: a monthly spending summary, attention metrics, upcoming payments, and module navigation remain visible without requiring a dense desktop tab bar. The abstract color-band background remains scoped to the login flow; the dashboard uses a plain neutral surface with restrained cards and borders.

Focused comparison covered the splash logo, top brand lockup, panel radius and placement, button sizing, form controls, password visibility action, keyboard state, and success state. The source is a style reference rather than a pixel-exact single-screen mock, so the triptych framing was normalized to the welcome state inside the mobile runtime.

## Findings

No actionable P0, P1, or P2 findings remain.

## Comparison history

- Earlier P2: the welcome panel rendered near the top because the scroll content did not own the calibrated device height. Fixed with device-geometry-based content sizing; the final panel is anchored to the bottom.
- Earlier P2: StrictMode could schedule the splash transition twice, leaving duplicate screens during navigation. Fixed with a one-shot transition guard.
- Earlier P2: inactive keyboard chrome could contribute to device overflow and shift the flow after navigation. Fixed by removing inactive keyboard chrome from layout and blurring navigation controls before pushing routes.
- Post-fix evidence: welcome, login, signup, reset, success, keyboard-open, iPhone, and Pixel 10 states were rendered and inspected; the runtime integrity check passed.

## Interaction checks

- Splash automatically transitions to welcome.
- Welcome CTAs open login and signup.
- Login, signup, and password recovery forms accept input and show success feedback.
- Login now uses the shared Supabase project, persists the client session, opens the dashboard on success, and shows an inline error for invalid credentials.
- Signup uses `supabase.auth.signUp`; password recovery uses `supabase.auth.resetPasswordForEmail`.
- Password visibility toggle works.
- Back navigation works.
- The simulated login opens the mobile dashboard through “Abrir dashboard”.
- Dashboard bottom navigation switches between Início, Assinaturas, Calendário, and Perfil.
- Simulated keyboard opens on text focus and closes on submission.
- iPhone and Pixel 10 device presets render the flow.
- Browser console: no errors or warnings reported.

## Follow-up polish

- [P3] Consider loading a dedicated heavier font weight if the final brand typeface requires more typographic contrast than the current Roboto setup.
- [P3] Replace prototype success feedback with the real Supabase authentication calls when the mobile data layer is connected.
