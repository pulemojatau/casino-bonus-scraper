# Five lines on AI

> Draft based on what actually happened while building this. Edit it to
> match your own experience, including anything you notice when you run the
> scraper and review its output.

1. Tool: Claude Code (Claude Opus 5.5) for the code, tests and docs; Claude Haiku 5.5 inside the scraper for the extraction step.
2. Where it was wrong: its first HTML-to-text step split sentences at line breaks in the HTML source ("wagered 40 times" / "within 30 days" became two lines).
3. That mattered because the scraper checks that the LLM's evidence quotes appear verbatim on the page, so split sentences would have caused false "not grounded" flags.
4. How it was caught: a unit test against a fixture review page asserted the full sentence was on one line, and it failed.
5. Fix: collapse whitespace inside text first, then split only on block-element boundaries; the test now guards it. (A 390px screenshot also caught a phone-layout bug where notes fell into the label column.)
