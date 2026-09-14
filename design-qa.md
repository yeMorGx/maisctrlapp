# Design QA — cartões e faturas

## Fonte visual

- Source visual truth: `C:\Users\GABRIE~1\AppData\Local\Temp\codex-clipboard-69f787f8-8199-406a-a306-2a42cfd1f8e9.png`
- Implementation screenshot: `C:\Users\Gabriel Morgado\Documents\mais ctrl app\mais-ctrl-mobile\test-results\payment-cards-implementation.png`
- Source pixels: 476 × 838.
- Implementation pixels: 512 × 968.
- CSS viewport: mobile runtime at 393 × 852 CSS px, deviceScaleFactor 1; the uploaded reference uses a different phone-frame crop, so the comparison was normalized by the visible app content and hierarchy rather than bezel pixels.
- State: authenticated local session, `Cartões e faturas`, two locally stored cards (`Nubank` and `Banco Inter`), no update banner, light theme.

## Comparação

### Full view

The reference establishes the same order of intent: MaisCtrl header, credit heading, blue credit summary, add-card action, Premium notice and a card collection above the floating navigation. The implementation preserves that hierarchy and expands the compact row into a dedicated visual card section, as requested.

### Focused region

The card region was checked for the requested details: Nubank uses a purple solid card surface, the CDN logo/name area is visible, the final digits and closing/due dates are present, and the white summary below exposes `Fatura`, `Disponível` and `Limite`. With more than one card, the second card is visibly peeking into the track and the `Carousel` provides the horizontal interaction.

## Findings

- No actionable P0, P1 or P2 findings remain.
- Intentional difference: the source shows one compact card row; the implementation promotes it to a physical-card representation and adds horizontal browsing because that is the latest product request.
- P3 follow-up: a future version can replace the current `Fatura` total with a dedicated invoice history once invoice transactions are modeled separately from the current limit usage.

## Comparison history

- Pass 1: the first capture included an available-build banner, which did not belong to the reference state. The QA state was normalized to the installed build before visual judgment.
- Pass 2: final capture uses the normalized authenticated state, confirms the card surface, metrics, logo treatment, responsive clipping and the horizontal track. No P0/P1/P2 fix was required after this pass.

## Implementation checklist

- [x] Card surface varies by recognized institution, including Nubank purple and Banco Inter blue.
- [x] CDN logo catalog is reused instead of replacing brand imagery with handcrafted artwork.
- [x] Fatura, disponível, limite and usage percentage are visible below the card.
- [x] Multiple cards use the protected runtime `Carousel` component.
- [x] Empty state and existing add/delete actions remain available.
- [x] Runtime integrity, build and local application tests pass.

## Follow-up polish

- Keep the CDN fallback monitored for offline sessions; the initial remains readable when a brand asset cannot load.

final result: passed
