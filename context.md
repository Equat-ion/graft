# Graft Context

This file is maintained to provide context for AI agents working on the `graft` repository. Please read this before making changes to ensure consistency with recent design and architecture decisions.

## Overview
Graft is an autonomous dependency-upgrade agent.
- `apps/agent/`: Python 3.11+ FastAPI backend, LangGraph autonomous agent.
- `apps/web/`: Next.js 15 TypeScript frontend (Tailwind CSS + shadcn/ui).

## Frontend UI/UX (Recent Overhaul)
The web application (`apps/web`) has recently been redesigned with a premium, **Anthropic-inspired dark mode aesthetic**. When generating or modifying UI components, adhere strictly to these design patterns:

### Color Palette & Theme
- **Dark Mode Default:** The app is strictly dark mode (enforced via `<html className="dark">` in `app/layout.tsx`).
- **Background:** Warm charcoal (`#1a1917` / HSL `40 6% 10%`). Avoid cold or pure blacks.
- **Accent Color:** Coral/Terracotta (`#CC5B33` / HSL `16 60% 50%`). Used exclusively for active elements, primary buttons, and live indicators.
- **Borders:** Extremely subtle, hairline borders. Use the Tailwind class `border-white/[0.07]`.
- **Cards:** Minimalist flat surfaces (`bg-card/50` with `shadow-none`). Avoid heavy dropshadows, glowing hover effects, or thick borders.

### Typography & Structure
- **Stat Labels:** Use uppercase, small, generously letter-spaced text for labels above data points (e.g., `<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">`).
- **Empty States:** Do not use simple text dashes (`—`) or plain text like "No data". Use structured dashed-border containers (`border-dashed border-white/[0.07] p-10 text-center`) with a circular coral icon (e.g., `Plus` from `lucide-react`), a primary title, and a muted description.
- **Live Indicators:** Use a pulsing coral dot alongside text for live data feeds (`<span className="animate-ping ... bg-primary">`).

## Strict Tech Stack Rules
1. **Next.js 15**: Do not upgrade or downgrade to other major/minor versions (e.g., never change to Next 16).
2. **TS Config**: Keep `"jsx": "preserve"` in `tsconfig.json`. Next.js handles the compilation.
3. **Backend rules**: See `AGENTS.md` for strict backend architecture rules (e.g., pure reward functions, local vLLM inference only, test file immutability).
