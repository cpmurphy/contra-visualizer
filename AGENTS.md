# Contra Dance Visualizer

This is a client-side web application that can load, display, and
visualize a contra dance.

## Technical Requirements

- Pure JavaScript (no frameworks)
- Single HTML file
- SVG-based visualization
- No server-side components or external dependencies

## A Word on Roles

We follow the convention common in Chicago in 2025, which is that
we refer to the lead as the "Lark" and the follow as the "Robin".
We'll allow for other conventions as well, such as the former names of
"Gent" for lead and "Lady" for follow.

## Testing

For now, all tests are in the `tests/` directory and can be run using test.sh.

## Dance Library

The dances are built into the application from `library/dances.json`
(loaded by `library.js`); there is no file upload. The app opens on a
menu of these dances. Choosing one puts its slug in the URL hash (e.g.
`index.html#lady-of-the-lake`), so reloading stays on that dance.

Figures the path calculator can't animate yet (see `isMoveSupported`
in `pathCalculator.js`) are shown as "not animated yet", and the dancers
hold their places during them.

## Metronome

While a dance plays, `metronome.js` clicks on every beat using the Web
Audio API (the sound only; nothing is drawn). The first beat of each
8-beat phrase is accented most, then the other odd-numbered beats. Clicks
are scheduled ahead on the audio clock, lined up with the animation clock
when play starts or resumes. The "Metronome" checkbox mutes it, and the
choice is remembered in `localStorage`.

The tempo slider (70-130 BPM) defaults to 100 BPM, slower than most
dances, for learners; it is remembered too. Changing it mid-move keeps
the dancers' place in the figure (`AnimationState.changeTempo`).

## Calls

`calls.js` times the calls for practising calling. Moves carry their
call text (`call`, and optionally a shorter `shortCall`), written with
syllables and stresses marked: `"NEIGH.bors BAL.ance and SWING"`. A `.`
splits syllables invisibly, a `-` splits them and is shown (`do-si-DO`),
and a syllable in capitals is stressed. A move without a call (such as
the swing after a balance whose call covers both) is not called.

Stressed syllables land on strong beats (odd-numbered beats of the
music), with the others on half beats between. A call's last stress comes
2 beats before its figure, or 4 for a call longer than 4 beats; where
calls crowd together, a call moves earlier to finish before the next.

A practice session plays an 8-beat intro and then the dance twice from
the top, with full calls the first time and short ones the second.
"Practice Calls" shows them karaoke-style; "Test Me" has the trainee
press Call (or the space bar, or the dancers) when they'd start each
call, and says how early or late they were.

## Dance Data Structure

Dances are stored as JSON with the following structure:
```json
{
  "title": "Dance Name",
  "author": "Choreographer Name",
  "formation": "improper" or "proper",
  "parts": [
    {
      "name": "A1" or "A2" or "B1" or "B2",
      "beats": 16,
      "moves": [
        {
          "type": "move_name",
          "beats": 8,
          "who": "neighbors" or "partners" or "lark" or "robin" or "ones" or "twos",
          "direction": "left" or "right" or "clockwise" or null,
          "facing": "up" or "down" (optional: which way dancers end up facing),
          "progression": true (optional: new neighbors from this move on),
          "call": "NEIGH.bors BAL.ance and SWING" (optional: see Calls),
          "shortCall": "BAL.ance and SWING" (optional: after the first time),
          "detail": "additional parameters as needed"
        }
      ]
    }
  ]
}
```

1. **Display Component:**
   - Show dance title, author, and formation
   - List all moves in order with beat counts
   - Show current move being visualized (highlighted)

2. **Visualization Component:**
   - SVG canvas showing three minor sets (6 couples, 12 dancers)
   - Represent dancers as circles or simple icons
   - Label dancers clearly: R1 (robin 1), L1 (lark 1), L2 (lark 2), R2 (robin 2))
   - Show correct starting positions (e.g. in improper formation)
   - Each couple has a unique color

3. **Basic Animation:**
   - Play / pause
   - Next figure / previous figure
   - Update dancer positions as moves progress

### UI Layout

- Left side: Dance information and move list
- Right side: SVG visualization canvas
- Bottom: Playback controls

On narrower screens (like phones), sacrifice the left side
