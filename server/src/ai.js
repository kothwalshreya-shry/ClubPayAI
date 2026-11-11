import { getCatalog } from "./catalog.js";
const INR = n => Math.round(Number(n) || 0);

function demoPlan(prompt, budget, catalog) {
    const text = prompt.toLowerCase();
  const headcount = Number(text.match(/(\d+)\s*(students|people|attendees|guests)/)?.[1] || 100);
  const wants = [
    { keys:["food","meal","cater"], category:"Food", qty:headcount, fallback:headcount },
    { keys:["stationery","pen","notebook"], category:"Stationery", qty:Math.ceil(headcount/2), fallback:Math.ceil(headcount/2) },
    { keys:["certificate","print"], category:"Printing", qty:headcount, fallback:headcount },
    { keys:["decoration","decor"], category:"Decorations", qty:1, fallback:1 },
    { keys:["sound","projector","equipment"], category:"Equipment", qty:1, fallback:1 }
  ].filter(w => w.keys.some(k => text.includes(k)));
  const chosen = wants.length ? wants : [
    {category:"Food",qty:headcount},{category:"Stationery",qty:Math.ceil(headcount/2)},
    {category:"Printing",qty:headcount},{category:"Decorations",qty:1}
  ];
  const items = chosen.map(w => {
    const options = catalog.filter(v => v.category === w.category).sort((a,b)=>a.unitPrice-b.unitPrice);
    const vendor = options[0];
    return { vendorId:vendor.id, vendor:vendor.vendor, item:vendor.item, category:w.category,
      quantity:w.qty, unitPrice:vendor.unitPrice, total:vendor.unitPrice*w.qty,
      rating:vendor.rating, reason:`Lowest listed sample price among ${options.length} catalogue options; rating ${vendor.rating}/5.`,
      alternative: options[1] ? {vendor:options[1].vendor,unitPrice:options[1].unitPrice,rating:options[1].rating} : null };
  });
  let total = items.reduce((s,x)=>s+x.total,0);
  if (total > budget) {
    // Reduce non-food quantities conservatively while preserving food count.
    for (const item of [...items].reverse()) {
      if (total <= budget) break;
      if (item.category === "Food") continue;
      const reducible = Math.max(0, item.quantity - 1);
      const reduction = Math.min(reducible, Math.ceil((total-budget)/item.unitPrice));
      item.quantity -= reduction; item.total = item.quantity*item.unitPrice; total = items.reduce((s,x)=>s+x.total,0);
    }
  }
  return {
    summary:`A draft procurement plan for approximately ${headcount} attendees, using the sample vendor catalogue.`,
    budget:INR(budget), items, estimatedTotal:INR(total), remaining:INR(budget-total),
    estimatedSavings: INR(items.reduce(
  (sum, x) => sum + (
    x.alternative
      ? Math.max(0, x.alternative.unitPrice - x.unitPrice) * x.quantity
      : 0
  ), 0
)),
    warnings: total > budget ? ["The recommended plan exceeds the budget. Reduce quantities or increase the budget before approval."] : [],
    mode:"DEMO_RULES",
    note:"Deterministic demo planner; configure GROQ_API_KEY for AI-generated recommendations."
  };
}


export async function createPlan(prompt, budget) {
  const catalog = getCatalog();
  const key = process.env.GROQ_API_KEY;
  console.log("Groq key loaded:", Boolean(key));
console.log("Groq model:", process.env.GROQ_MODEL);

  if (!key) return demoPlan(prompt, budget, catalog);

  const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

  const instructions = `
You are ClubPay AI, a careful procurement assistant.

Use ONLY this sample vendor catalogue:
${JSON.stringify(catalog)}

User request: ${prompt}
Available budget: INR ${budget}

Rules:
1. Recommend only vendors in the catalogue.
2. Never invent vendors or prices.
3. Calculate quantities and totals accurately.
4. Keep the purchase plan within budget if possible.
5. Return valid JSON only.

Required JSON structure:
{
  "summary": "Short plan summary",
  "items": [
    {
      "vendorId": "catalogue vendor ID",
      "vendor": "Vendor name",
      "item": "Product name",
      "category": "Category",
      "quantity": 1,
      "unitPrice": 100,
      "total": 100,
      "rating": 4.5,
      "reason": "Reason for selection",
      "alternative": null
    }
  ],
  "estimatedTotal": 100,
  "remaining": 100,
  "estimatedSavings": 0,
  "warnings": []
}
`;

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`
        },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "You are ClubPay AI. Return valid JSON only."
            },
            {
              role: "user",
              content: instructions
            }
          ],
          temperature: 0.2,
          max_tokens: 2048
        })
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Groq API ${response.status}: ${errorBody}`);
    }

    const data = await response.json();

    const raw = data.choices?.[0]?.message?.content;

    if (!raw) throw new Error("Groq returned an empty response");

    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    for (const item of items) {
      const vendor = catalog.find(v => v.id === item.vendorId);

      if (!vendor) {
        throw new Error("AI selected a vendor outside the catalogue");
      }

      item.vendor = vendor.vendor;
      item.item = vendor.item;
      item.category = vendor.category;
      item.unitPrice = vendor.unitPrice;
      item.rating = vendor.rating;
      item.quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
      item.total = item.quantity * item.unitPrice;
    }

    const total = items.reduce((sum, item) => sum + item.total, 0);

    return {
      ...parsed,
      items,
      budget: INR(budget),
      estimatedTotal: INR(total),
      remaining: INR(budget - total),
      mode: "GROQ"
    };

  } catch (err) {
  console.error("GROQ ERROR:", err);
  const fallback = demoPlan(prompt, budget, catalog);
    fallback.note = `Groq unavailable (${err.message}); demo planner used instead.`;
    return fallback;
  }
}


export async function createReport(data) {
  const key = process.env.GEMINI_API_KEY;
  const summary = `Budget ₹${data.budget}; spent ₹${data.spent}; remaining ₹${data.budget-data.spent}; transactions ${data.transactions.length}.`;
  if (!key) return { mode:"DEMO_RULES", report:`${summary} Review category concentration and compare new quotations before the next event. This is a rule-based demo summary, not an LLM-generated report.` };
  try {
    const model = process.env.GEMINI_MODEL || "gemini-3.7-flash";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({contents:[{parts:[{text:`Write a concise, cautious financial report from these verified records. Do not invent data. ${JSON.stringify(data)}`}]}]})
    });
    if (!r.ok) throw new Error(`Gemini API returned ${r.status}`);
    const j=await r.json(); return {mode:"GEMINI",report:j.candidates?.[0]?.content?.parts?.[0]?.text || summary};
  } catch { return {mode:"DEMO_RULES",report:summary+" AI report unavailable; displaying verified transaction totals only."}; }
}
