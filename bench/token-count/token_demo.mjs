// Prints how o200k_base splits a few snippets into tokens, as JSON, for the page's token demo.
import { getEncoding } from "js-tiktoken";

const e = getEncoding("o200k_base");
const snippets = {
  tsRaw: '  if (!row) {\n    return null;\n  }',
  tsCompact: '  if !row\n    return null',
  htmlRaw: '<li class="pricing-card__feature">Five users</li>',
  htmlCompact: 'li.pricing-card__feature Five users',
  cssRaw: '.pricing-card__amount {\n  font-size: 2.5rem;\n  font-weight: 700;\n}',
  cssPlain: '.pricing-card__amount{font-size:2.5rem;font-weight:700}',
};
const out = {};
for (const [k, s] of Object.entries(snippets)) {
  out[k] = e.encode(s).map((t) => e.decode([t]));
}
console.log(JSON.stringify(out));
