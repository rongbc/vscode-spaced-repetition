# Flashcards fixture

This note exercises the plugin parser and the review-panel Markdown renderer.
Card syntax matches obsidian-spaced-repetition: a blank line ends a card;
single-line cards use `::` / `:::`, multi-line cards use `?` / `??` on a line
of their own with contiguous content around them.

#flashcards/os/interrupts

# Timers & Interrupts

## Top half vs bottom half

What are the characteristics of the top half and the bottom half of interrupt handling?
?
| Half | Where it runs | Can it sleep? |
| --- | --- | --- |
| top half | hardirq handler | no |
| bottom half | workqueue / tasklet / softirq | workqueue only |
**Top half** — the *interrupt handler*: must run fast and must not sleep; acknowledge the device immediately. **Bottom half** — deferred work via `softirq`, `tasklet`, or `workqueue`.
```c
void irq_handler(struct device *dev)
{
    disable_irq(dev->irq); /* top half: acknowledge quickly */
    schedule_work(&dev->bottom_work);
    enable_irq(dev->irq);
}
```
> Rule of thumb: keep the top half tiny and hand the heavy lifting to a `workqueue`.
---
### Deferred work
- softirq — cannot sleep
- tasklet — cannot sleep either
- workqueue — process context, sleeping is fine
Read the [kernel documentation](https://docs.kernel.org/) or browse https://kernel.org; the old `tasklet` API is ~~deprecated~~ but still common. Icon: ![extension icon](./srs-icon.svg)

## Single-line cards

`fork()` in the child process returns?::0

`fork()` in the parent process returns?::the child's PID

Plain question ::Plain answer

## Leading-tag card

#flashcards/cpp Who created C++?::Bjarne Stroustrup — see [cppreference](https://en.cppreference.com/w/)

## Reversed single-line card

Reverse me:::asked the **other way** with `inline code` and *emphasis*

## Multi-line reversed card

How does an LED blink?
??
Toggle the **GPIO** output level high and low via `gpiod_set_value()`.

<!-- this comment must not become any card -->
