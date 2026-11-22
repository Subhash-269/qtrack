# Competitor: Yoodoo (ADHD daily planner)

*Researched 22 Nov 2026 with three small-model research agents (product, user reviews, market). Firecrawl credits were exhausted, so the work relied on web search plus a few direct page reads. Items marked (unverified) rest on search snippets only.*

## TL;DR

- Yoodoo is a **time-block-first ADHD day planner** for phone, web and desktop. It sells one idea: *"the planner that fixes your day when it slips."* Its signature move is **Fix my day**: when something runs over, it asks one question and shifts the rest of the day around your meetings.
- **It already has a Claude connector**, as of v4.2.1 in November 2026. The connector reads your day, adds, plans, moves and ticks off tasks, shows the plan before changing anything, and can undo. It is Pro-only and **doesn't appear to start focus or log time**, which QTrack does. So "we have MCP" is no longer a moat on its own. "The assistant can run your focus, not just your list" still is.
- Its weak spots: a tiny rating base (about 23 App Store ratings against a claimed 100k+ users), calendar sync the founder admits is one-way despite "two-way" marketing, conflicting prices, and an aggressive Lite tier (1 list, 1 habit, 1 calendar).
- **Biggest lessons for QTrack:** (1) make *re-planning a slipped day* a first-class, one-tap action; (2) adopt anti-guilt, calm wording throughout; (3) give the day a *timeline* view; (4) add a "Just start" 5-minute timer; (5) let the assistant break a task into steps; (6) lean into what Yoodoo lacks: multi-project work, focus analytics, and assistant-driven focus.

## 1. What Yoodoo is

| | |
|---|---|
| Positioning | "Your brain isn't broken. Your planner was." Built ADHD-first; "probably not for you if you need a project tool for your whole team." Not a treatment, just a planner ([site](https://yoodoo.app/), [FAQ](https://yoodoo.app/faq)) |
| Platforms | iPhone, iPad, Mac, Vision, Android, web ([App Store](https://apps.apple.com/us/app/yoodoo-adhd-daily-planner/id1644320094)) |
| Maker | Solo founder (Ross Macfarlane, per Product Hunt); launched 2023 ([PH](https://www.producthunt.com/products/yoodoo)) |
| Traction | About 23 ratings at 4.8 on US App Store; Product Hunt 4.0 from 1 review; site claims "100,000+ distracted doers" (unbacked) |
| Shipping pace | Fast: v4 rebuild on 24 Oct, then 4.0.1, 4.0.4, 4.0.6, 4.2.0 (15 Nov) and 4.2.1 within about four weeks |

### Features
- **Timeline:** tasks laid out in order around calendar meetings; free gaps show what fits ([timeline](https://yoodoo.app/features/timeline)).
- **Fix my day / Reschedule the rest:** one tap moves the rest of the day and keeps meetings fixed. It asks one question when something overruns and changes nothing until you confirm.
- **Ask Yoodoo / Yoodoo AI (Pro):** turns a brain dump into tasks, breaks big tasks into tiny steps, and confirms with "Looks right" ([ask-yoodoo](https://yoodoo.app/features/ask-yoodoo)). "Plan it for me" builds the day (marketed by others as *Instaplan*, unverified).
- **Focus mode:** timer ring, music, a **"Just start" 5-minute timer**, one step at a time ([focus](https://yoodoo.app/features/focus)).
- **App blocker** on iPhone and Android, scheduled or during focus (Pro) ([app-blocker](https://yoodoo.app/features/app-blocker)).
- **Habits** without punishing streaks ("One bad day never wipes it"), plus stats ([habits](https://yoodoo.app/features/habits)).
- Day templates, repeating tasks, a midday check-in, a weekly goal, photos on tasks, notes with tags, widgets, Lock Screen and Live Activities, Siri quick-add, and a medication day counter (App Store notes).
- **Calendar sync:** marketed as "Meetings in. Tasks out. Both ways." The founder says on Product Hunt that it is one-way (events in) and two-way is on the roadmap.
- **Assistant connector (Pro):** Claude (Settings → Connectors), Cursor and Claude Code. It reads the day and lists, adds, plans, moves and ticks off tasks, previews changes, undoes the last one, and can't see event details ([ai-apps](https://yoodoo.app/features/ai-apps)).

### Pricing ([pricing](https://yoodoo.app/pricing))
- **Lite (free):** 1 list, 1 habit or routine, 1 calendar, Today widget, Siri, Live Activity.
- **Pro:** $7.99 a month, $59.99 a year (7-day trial), or $149.99 lifetime. The App Store also lists a weekly plan at $3.99 with a 3-day trial. A Black Friday promotion runs until 3 Dec.
- **Pro gates nearly everything:** AI, plan-for-me, week and month views, templates, two-way sync, app blocker, dark mode, stats, web app and sync, and the Claude connector. Teams pricing starts at £4 per person per month.

## 2. What users say (thin data)

Only 4 App Store reviews and 1 Product Hunt review were readable. Reddit returned nothing, and Google Play and appshunter were blocked.

- **Love:** "The way the timeline is set up just really works for my brain." "yoodoo just tells me what to do next. that's it… game changer." "I feel in charge of my schedule." ([App Store](https://apps.apple.com/us/app/yoodoo-adhd-daily-planner/id1644320094))
- **Complaints:** calendar sync "does nothing" ([PH reviews](https://www.producthunt.com/products/yoodoo/reviews)); a review-site headline reads "Aggressive Paywalls and Constant Crashes" (unverified). The v4 "ground-up rebuild" suggests earlier stability problems (inference).
- **Takeaway:** people value *being told what's next* and a *visual day*. They dislike sync claims that don't hold and heavy paywalls.

## 3. Where Yoodoo sits in the market

Patterns that recur across ADHD apps (Tiimo, Structured, Llama Life, Sunsama, Motion, Goblin.tools, Focusmate, Lunatask and others; see the market scan sources below):

- A visual timeline or time-blocking: Tiimo, Structured, Yoodoo, Akiflow.
- Gentle replanning of missed tasks: Structured Replan, Yoodoo Fix my day, Motion.
- Brain dump → tasks, and task → micro-steps: Goblin.tools, Tiimo AI, Yoodoo AI.
- One thing at a time plus a built-in timer: Llama Life, Forest, Amazing Marvin.
- Body doubling: Focusmate, Inflow.
- Streaks and routines: Routinery, Todoist Karma, and Yoodoo, which keeps habits but deliberately removes streak pressure.
- **Assistant connectors** exist at Todoist, Sunsama, Motion, Akiflow and now Yoodoo. Of these, Sunsama's connector can't plan time blocks. None was found that logs or drives focus time.

**Gaps nobody fills well:**
- Time-blindness aids beyond a timeline, such as elapsed-time visuals and gentle nudges.
- Tasks, focus history and notes together in one place.
- Work across several projects (Yoodoo explicitly isn't a project tool).
- An assistant that can run focus sessions.

## 4. Learnings for QTrack

### Borrow (ranked by value / effort)
1. **"Fix my day" replan (high value, medium effort).** On Today, a *Replan* action for tasks that are due, overdue or skipped today. It would offer to move them to tomorrow, later this week, or back to Up next, one tap at a time with Undo. Pair it with an MCP tool, `replan_day`, so Claude can do it too. This ties directly into the parked multitasking/ADHD discussion.
2. **Anti-guilt wording (high value, low effort).** Rewrite empty states, overdue chips ("1d over" → "from yesterday") and toasts in Yoodoo's calm, no-shame tone. "Skipped" was already a step in this direction.
3. **"Just start" 5-minute timer (high value, low effort).** A secondary button on Today and the details panel that starts a 5-minute focus with an easy way to extend it. It lowers the barrier to starting a task.
4. **AI steps (medium value, low effort with MCP).** Add an MCP tool, `break_down_task`, that writes checklist items into the existing checklist, so Claude can split a task into steps. A "Split into steps" button in the details panel can come later.
5. **Day timeline (high value, higher effort).** An optional Today view that lays Up next, due tasks and today's meetings along the hours, sharing a time axis with the focus chart.
6. **Midday check-in / shutdown ritual (medium value).** A light prompt at a chosen time: "What's left? Replan or let go."
7. **Habits without punishing streaks (later).** If QTrack adds habits, borrow "one bad day never wipes it".

### Avoid
- Claiming integrations that don't fully work, like Yoodoo's "two-way" calendar sync.
- Gating the basics. Yoodoo puts dark mode, stats and week views behind Pro, and reviewers push back on its paywall.
- Health framing such as medication tracking, unless we are ready for the responsibility that comes with it.

### Differentiate (where QTrack already leads)
- **The assistant runs focus as well as tasks.** QTrack's `start_focus`, `pause_focus`, `stop_focus`, `log_focus`, focus stats and undo cover ground Yoodoo's connector doesn't reach. Lead with it: *"Tell Claude what you're doing and QTrack keeps the clock."*
- **Several projects at once:** one Today across all projects, with project colors, archiving and a switcher.
- **Focus analytics:** the hour/day/week/month chart by project, and pause reasons (waiting / interrupted).
- **Honest statuses:** To do, In progress, Done, Skipped. Skipping is a valid outcome.
- **Free core and web-first.** Keep the basics free so the comparison with Yoodoo's $60/year is easy.

## 5. Suggested next steps
1. Build **Replan** on Today, plus a `replan_day` MCP tool. Ship it together with the anti-guilt wording pass.
2. Add the **"Just start" 5-minute** button and a **`break_down_task`** MCP tool.
3. Mock up a **day timeline** variant of Today.
4. Revisit the parked multitasking/ADHD design with these in mind.
5. Once Firecrawl credits reset on 14 Dec, re-check Yoodoo's Play Store reviews, Reddit threads and its connector's tool list.

### Sources
- Yoodoo: [site](https://yoodoo.app/) · [pricing](https://yoodoo.app/pricing) · [AI apps / connector](https://yoodoo.app/features/ai-apps) · [App Store](https://apps.apple.com/us/app/yoodoo-adhd-daily-planner/id1644320094) · [Product Hunt](https://www.producthunt.com/products/yoodoo) · [PH reviews](https://www.producthunt.com/products/yoodoo/reviews)
- Market: [Tiimo AI planning](https://tiimoapp.com/product/ai-planning) · [Structured](https://apps.apple.com/app/structured-daily-planner/id1499198946) · [Sunsama MCP](https://help.sunsama.com/docs/integrations/mcp) · [Motion MCP](https://help.motionapp.com/en/articles/14315735-motion-mcp) · [Todoist + Claude](https://www.todoist.com/help/articles/use-claude-with-the-todoist-connector-ANlg7v13q) · [Akiflow pricing](https://akiflow.com/pricing) · [Focusmate FAQ](https://www.focusmate.com/faq) · [Lunatask ADHD](https://lunatask.app/adhd) · [Amazing Marvin community MCP](https://github.com/bgheneti/Amazing-Marvin-MCP)
