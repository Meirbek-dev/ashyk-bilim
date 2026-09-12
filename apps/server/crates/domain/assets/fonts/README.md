# Embedded fonts

`NotoSans-Regular.ttf` / `NotoSans-Bold.ttf` — Noto Sans (Copyright 2022 The
Noto Project Authors, https://github.com/notofonts/latin-greek-cyrillic),
licensed under the SIL Open Font License 1.1 (`OFL.txt`). Used by the
certificate PDF renderer (`ab_domain::certifications::pdf`).

They are subsets (fonttools `pyftsubset`, no hinting, no layout features)
covering Basic Latin, Latin-1, Latin Extended-A, Cyrillic (incl. the Kazakh
letters), general punctuation, `€`, `₸` and `№`:

    pyftsubset NotoSans-Regular.ttf \
      --unicodes="U+0020-007E,U+00A0-00FF,U+0100-017F,U+0400-04FF,U+2010-2027,U+2030-203A,U+20AC,U+20B8,U+2116" \
      --layout-features='' --no-hinting --desubroutinize
