# API test fixture attribution

`unicode-emoji-json-0.9.0.json` contains the 1,914 emoji-key strings from
`data-by-emoji.json` in the pinned `unicode-emoji-json` 0.9.0 package. It is a
checked-in test fixture so API CI can verify validator parity without reading
mobile `node_modules` or accessing the network. It was generated from the
pinned package's data file; the fixture is not runtime application data.

Source: <https://github.com/muan/unicode-emoji-json/tree/main>
Package version: <https://www.npmjs.com/package/unicode-emoji-json/v/0.9.0>
Package license: MIT. The upstream project identifies Unicode data as its
source and links the Unicode License Agreement:
<https://www.unicode.org/license.html>.
