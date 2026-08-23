---
name: agape-performance
description: Profile and improve Agape portal speed, smoothness, mobile responsiveness, render cost, bundle loading, Firebase listener load, map updates, and native-app interaction latency.
---

# Agape Performance

Measure before changing. Identify whether delay comes from network, Firestore listeners, data shaping, React rendering, layout, animation, maps, or bundle loading.

Prefer indexed O(N) selection, stable keys, memoized pure selectors, lazy secondary routes, bounded rendering, coalesced location updates, transform/opacity motion, and cancellation of stale async work. Avoid broad memoization without evidence, `transition-all`, layout animation, repeated collection scans, duplicate listeners, and heavy blur behind scrolling content.

Do not trade correctness, accessibility, current status, offline behavior, or Firebase safety for speed. Verify the affected workflow live at mobile and desktop sizes, then run focused tests and the production build. Report measured evidence and any provider or device limitation.
