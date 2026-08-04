# Version 1.6 launch-readiness architecture

## Shared interaction layer

The command palette lives in `index.html` and `app.js`; it is an orchestration surface, not a new domain or index. Profile results come from the canonical entity registry. Stories come from the deterministic Story Engine. Markets come from the normalized market research service. History and Workspace search reuse their existing lazy-loaded services. Results are capped, delayed by a short debounce, and protected by a request sequence so older async work cannot overwrite a newer query.

The empty palette provides deterministic exploration prompts and application commands. “Explore now” is deliberately not called trending because the repository has no global-popularity provider. Recent searches use a small local-storage list and are not written when a loaded Workspace has privacy mode enabled.

## Onboarding and terminology

The existing lightweight first-visit guide remains dismissible and local-only. Version 1.6 recognizes the previous completion key so returning users are not shown the guide again. New users see the seven core product concepts. Visible navigation now consistently uses **Workspace** and market selections use **Research Slip**; **Parlay Builder** remains the dedicated market-combination research workflow.

## Accessibility and responsive behavior

The palette uses a native modal dialog, descriptive labels, listbox/option semantics, an assertive-free live status, arrow-key selection, Enter activation, Escape dismissal, and focus restoration. Coarse-pointer controls receive a 44-pixel minimum target. Mobile results scroll inside the dialog. Motion and backdrop effects are removed when reduced motion is requested.

## Performance

Historical and Workspace modules remain lazy. Search reuses cached service calculations, caps each source group, debounces input, and rejects stale completions. No dependency or bundler was added. The app continues to use the existing frontend ESM and minimal Python server architecture.

## Operational limitations

This repository has no bundler-defined production-build command; the production-equivalent checks are server configuration validation, Python unit tests, static ESM loading through the local server, browser regression harnesses, console inspection, and resource-size/load measurements. Provider certification and coverage documentation remain the authority for live-data claims.

