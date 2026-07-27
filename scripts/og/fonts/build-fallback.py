"""Builds LMBoardFallback.ttf — the glyphs no shipped face can draw.

    python3 scripts/og/fonts/build-fallback.py

Today that is exactly one: τ U+03C4, which appears in the benchmark name
"τ³-Banking" and is in neither Archivo (4 Greek codepoints, not this one) nor
Geist Mono (5, likewise). Chromium hides the gap by falling back to a system
face; satori has only the fonts it is handed and draws a tofu box, then drags
the rest of the label into the mono face with it — on 62 of 62 model cards.

The outline is drawn here rather than lifted from another font so that its
licence is unambiguous and its proportions match: the stem width, x-height and
cap height below are Archivo-580's own, read from its `l` glyph and OS/2 table.

Requires fontTools. Run it only when the glyph set changes; the .ttf is
committed, and `og.test.ts` asserts the coverage it provides.
"""

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UNITS_PER_EM = 1000
X_HEIGHT = 526      # Archivo-580 OS/2 sxHeight
CAP_HEIGHT = 686    # Archivo-580 OS/2 sCapHeight
STEM = 119          # Archivo-580 "l": xMax 184 - xMin 65
BAR = 102           # horizontal strokes run ~0.86 of the vertical in Archivo
ASCENT = 878        # Archivo hhea, so the fallback shares its baseline maths
DESCENT = -210


def tau():
    pen = TTGlyphPen(None)
    bar_left, bar_right = 18, 528
    bar_top, bar_bottom = X_HEIGHT, X_HEIGHT - BAR
    stem_left = 250
    stem_right = stem_left + STEM
    foot_right = 430
    foot_top = 96

    pen.moveTo((bar_left, bar_top))
    pen.lineTo((bar_right, bar_top))
    pen.lineTo((bar_right, bar_bottom))
    pen.lineTo((stem_right, bar_bottom))
    pen.lineTo((stem_right, foot_top))
    pen.qCurveTo((stem_right, 0), (stem_right + 96, 0))
    pen.lineTo((foot_right, 0))
    pen.qCurveTo((stem_left, 0), (stem_left, foot_top + 34))
    pen.lineTo((stem_left, bar_bottom))
    pen.lineTo((bar_left, bar_bottom))
    pen.closePath()
    return pen.glyph()


notdef = TTGlyphPen(None)
notdef.moveTo((0, 0))
notdef.closePath()

builder = FontBuilder(UNITS_PER_EM, isTTF=True)
builder.setupGlyphOrder([".notdef", "uni03C4"])
builder.setupCharacterMap({0x03C4: "uni03C4"})
builder.setupGlyf({".notdef": notdef.glyph(), "uni03C4": tau()})
builder.setupHorizontalMetrics({".notdef": (600, 0), "uni03C4": (560, 18)})
builder.setupHorizontalHeader(ascent=ASCENT, descent=DESCENT, lineGap=0)
builder.setupNameTable(
    {
        "familyName": "LM Board Fallback",
        "styleName": "Regular",
        "psName": "LMBoardFallback-Regular",
        "copyright": "Drawn for LM Board. Public domain.",
    }
)
builder.setupOS2(
    sTypoAscender=ASCENT,
    sTypoDescender=DESCENT,
    sTypoLineGap=0,
    usWinAscent=ASCENT,
    usWinDescent=-DESCENT,
    sxHeight=X_HEIGHT,
    sCapHeight=CAP_HEIGHT,
)
builder.setupPost()
builder.save(__file__.replace("build-fallback.py", "LMBoardFallback.ttf"))
