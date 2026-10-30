const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src', 'pages', 'CartPage', 'CartPage.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Fix 1: Remove the extra stray closing brace that was inserted by the edit
// The pattern is: after the giftWrapConfig setters close, there's a whitespace line 
// then a CRLF "          }" which is extra, then "        }" which correctly closes if(active)
// Original broken pattern (mixed LF/CRLF):
// "          }\n        \r\n          }\r\n        }\r\n      } catch"
// We want:
// "          }\n        }\r\n      } catch"

content = content.replace(
  /(\s*setGiftWrapConfig\([^)]+\);[\s\n\r]+\})\s*[\n\r]+\s*\}\s*[\r\n]+\s*\}\s*[\r\n]+\s*\}\s*catch/,
  '$1\r\n        }\r\n      } catch'
);

// Fix 2: Update mobile gift wrap section to only show when giftWrapConfig.giftWrapEnabled
// and update subtitle text to show free/cost info
content = content.replace(
  /\{\/\* Gift wrap \(Phase 5\.11\) \*\/\}\s*\r?\n\s*<div style=\{\{ background: "var\(--color-surface\)", border: "1px solid var\(--color-border\)", borderRadius: "12px", padding: "14px 16px", marginTop: "14px" \}\}>/,
  `{/* Gift wrap (Phase 5.11) */}\r\n              {giftWrapConfig.giftWrapEnabled && (\r\n              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "12px", padding: "14px 16px", marginTop: "14px" }}>`
);

// Fix the closing of that gift wrap mobile div to add the conditional close
content = content.replace(
  /(<\/div>\s*\r?\n)\s*(\{\/\* Cross-sell shelf)/,
  '$1              )}\r\n\r\n              $2'
);

// Fix 3: Update the subtitle in mobile gift wrap to show pricing info
content = content.replace(
  /<p style=\{\{ fontSize: "11px", color: "var\(--color-muted\)", marginTop: "2px" \}\}>We'll wrap your items beautifully<\/p>/,
  `<p style={{ fontSize: "11px", color: "var(--color-muted)", marginTop: "2px" }}>
                    {giftWrapConfig.giftWrapFree ? "🎁 Gift wrapping is free!" : \`🎁 Add gift wrapping for ₹\${giftWrapConfig.giftWrapCost}\`}
                  </p>`
);

// Fix 4: Update desktop gift wrap section subtitle too
content = content.replace(
  /<p style=\{\{ fontSize: "12px", color: "var\(--color-muted\)" \}\}>We'll wrap your items beautifully<\/p>/,
  `<p style={{ fontSize: "12px", color: "var(--color-muted)" }}>
                        {giftWrapConfig.giftWrapFree ? "🎁 Gift wrapping is free!" : \`🎁 Add gift wrapping for ₹\${giftWrapConfig.giftWrapCost}\`}
                      </p>`
);

// Fix 5: Desktop Order Summary - add gift wrap row after shipping estimate
// Insert gift wrap row after the shipping estimate row but before Tax row
const shippingRowPattern = /<div\s+className="flex"\s+style=\{\{ justifyContent: "space-between" \}\}\s*>\s*<span style=\{\{ color: "var\(--color-body\)" \}\}>\s*Shipping Estimate\s*<\/span>\s*<span style=\{\{ fontWeight: 700, color: "var\(--color-ink\)" \}\}>\s*\{money\(shippingEstimate\)\}\s*<\/span>\s*<\/div>/;

const shippingRowReplacement = `<div
                      className="flex"
                      style={{ justifyContent: "space-between" }}
                    >
                      <span style={{ color: "var(--color-body)" }}>
                        Shipping Estimate
                      </span>
                      <span style={{ fontWeight: 700, color: "var(--color-ink)" }}>
                        {money(shippingEstimate)}
                      </span>
                    </div>
                    {/* Gift wrap charge row */}
                    {giftWrapConfig.giftWrapEnabled && giftWrap && (
                      <div className="flex" style={{ justifyContent: "space-between" }}>
                        <span style={{ color: "var(--color-body)" }}>🎁 Gift Wrapping</span>
                        <span style={{ fontWeight: 700, color: giftWrapConfig.giftWrapFree ? "var(--color-success)" : "var(--color-ink)" }}>
                          {giftWrapConfig.giftWrapFree ? "Free" : money(giftWrapConfig.giftWrapCost)}
                        </span>
                      </div>
                    )}`;

content = content.replace(shippingRowPattern, shippingRowReplacement);

// Also wrap desktop gift wrap toggle with conditional
const desktopGiftWrapPattern = /\{\/\* Gift wrap \(Phase 5\.11\) \*\/\}\s*\r?\n\s*<div style=\{\{ display: "flex", flexDirection: "column", gap: "8px", paddingBottom: "4px" \}\}>/;
content = content.replace(
  desktopGiftWrapPattern,
  `{/* Gift wrap (Phase 5.11) */}\r\n                  {giftWrapConfig.giftWrapEnabled && (\r\n                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingBottom: "4px" }}>`
);

// Close the desktop gift wrap conditional after the textarea section
// Find the closing of the desktop gift wrap div (before the CHECKOUT comment)
content = content.replace(
  /(<\/div>\s*\r?\n)\s*(\{\/\* CHECKOUT \*\/\})/,
  '$1                  )}\r\n\r\n                  $2'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('CartPage.jsx patched successfully!');

// Verify the fix
const fixed = fs.readFileSync(filePath, 'utf8');
const lines = fixed.split('\n');
// Check around line 107-120
for (let i = 104; i < 125 && i < lines.length; i++) {
  console.log(`Line ${i+1}: ${JSON.stringify(lines[i])}`);
}
