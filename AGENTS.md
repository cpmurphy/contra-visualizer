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
