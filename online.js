// FlipFinder online page: downloads data.json (encrypted on the PC), decrypts it in the browser
// with the password (PBKDF2-SHA256 + AES-GCM, same as flipfinder/publish.py) and shows the deals.
// Listing text comes from Facebook, so everything is inserted with textContent, never innerHTML.
"use strict";

const STORE_KEY = "flipfinder-site-pw";
const $ = (id) => document.getElementById(id);

function store(action, value) {
  try {
    if (action === "get") return localStorage.getItem(STORE_KEY);
    if (action === "set") localStorage.setItem(STORE_KEY, value);
    if (action === "del") localStorage.removeItem(STORE_KEY);
  } catch (e) { /* private mode: just don't remember */ }
  return null;
}

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const money = (v) => (v === null || v === undefined ? "?" : "€" + Math.round(v).toLocaleString("fr-BE"));

async function decrypt(blob, password) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64(blob.salt), iterations: blob.iter, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(blob.iv) }, key, b64(blob.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

function ago(iso) {
  if (!iso) return "age unknown";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return Math.max(1, Math.floor(s / 60)) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  return Math.floor(s / 86400) + " d ago";
}

async function copy(btn, text) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) {
    const ta = h("textarea", {}, text); document.body.append(ta); ta.select();
    document.execCommand("copy"); ta.remove();
  }
  const old = btn.textContent; btn.textContent = "Copied ✓"; setTimeout(() => (btn.textContent = old), 1500);
}

function drafts(list) {
  return (list || []).map((d) => h("div", { class: "draft" },
    h("div", { class: "small muted" }, `${d.label} (${d.language.toUpperCase()})`),
    h("div", { class: "text" }, d.text),
    d.language !== "en" ? h("div", { class: "en" }, "🇬🇧 " + d.english) : null,
    h("button", { type: "button", class: "small copy-btn", onclick: (e) => copy(e.target, d.text) }, "Copy")));
}

function photo(d) {
  const img = h("img", { class: "thumb", src: d.photo_url, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
  img.addEventListener("error", () => img.replaceWith(h("div", { class: "thumb-empty" })));
  return d.photo_url ? img : h("div", { class: "thumb-empty" });
}

function dealCard(d) {
  const profit = d.good_at_asking
    ? h("div", { class: "row" }, h("span", { class: "profit" }, "+" + money(d.profit)),
        h("span", { class: "muted" }, `profit · ${Math.round(d.margin_pct)}% margin`))
    : h("div", { class: "row" }, h("span", { class: "profit" }, "+" + money(d.profit_at_offer)),
        h("span", { class: "muted" }, `profit if they accept ${money(d.suggested_offer)} (${money(d.profit)} at asking)`));
  const verdict = d.risk_level === "high"
    ? h("div", { class: "banner bad" }, "⚠️ HIGH RISK, probably a scam: " + d.risk_reasons.join("; "))
    : d.good_at_asking ? h("div", { class: "banner good" }, "✅ Good at asking price, buy fast")
    : h("div", { class: "banner warn" }, `🤝 Negotiate: only worth it at ${money(d.max_offer)} or less`);
  return h("div", { class: "card" },
    h("div", { class: "deal" },
      h("a", { href: d.url, target: "_blank", rel: "noopener" }, photo(d)),
      h("div", {},
        h("div", { class: "row" },
          h("span", { class: "badge info" }, "#" + (d.rank ?? "")),
          d.is_new ? h("span", { class: "badge new" }, "🔥 NEW") : null,
          h("span", { class: "badge " + d.risk_level }, d.risk_level + " risk")),
        h("p", { class: "deal-title" }, d.headline),
        h("p", { class: "deal-sub" }, `${d.title} · ${d.location_text || "?"}`),
        profit,
        h("div", { class: "kv" },
          h("span", {}, "Asking ", h("b", {}, money(d.asking))),
          h("span", {}, "Resale ", h("b", {}, money(d.resale))),
          h("span", {}, "Max offer ", h("b", {}, money(d.max_offer))),
          h("span", {}, "Open with ", h("b", {}, money(d.suggested_offer))),
          h("span", {}, d.distance_km === null ? "? km" : Math.round(d.distance_km) + " km"),
          h("span", {}, ago(d.posted_at))))),
    verdict,
    d.risk_level !== "high" && d.risk_reasons.length ? h("div", { class: "small muted" }, "⚠️ " + d.risk_reasons.join("; ")) : null,
    h("details", {}, h("summary", {}, "Message the seller"), drafts(d.drafts)),
    h("details", {}, h("summary", {}, "Test checklist"),
      h("ul", { class: "check" }, (d.checklist || []).map((c) => h("li", {}, c)))),
    h("div", { class: "row", style: "margin-top:10px" },
      h("a", { class: "btn", href: d.url, target: "_blank", rel: "noopener" }, "Open listing ↗")));
}

function askCard(a) {
  return h("div", { class: "card" },
    h("div", { class: "deal" },
      h("a", { href: a.url, target: "_blank", rel: "noopener" }, photo(a)),
      h("div", {},
        h("p", { class: "deal-title" }, a.model_name),
        h("p", { class: "deal-sub" }, `${a.title} · ${money(a.price)}` +
          (a.distance_km === null ? "" : ` · ${Math.round(a.distance_km)} km`)),
        h("p", { class: "small muted" }, "Unclear: " + (a.unclear_because || []).join("; ")))),
    h("details", {}, h("summary", {}, "Question for the seller"), drafts([a.draft])),
    h("div", { class: "row", style: "margin-top:10px" },
      h("a", { class: "btn", href: a.url, target: "_blank", rel: "noopener" }, "Open listing ↗")));
}

function render(data) {
  const run = data.last_run ? `Last search ${ago(data.last_run.at)} (${data.last_run.status})` : "No search yet";
  const old = (Date.now() - new Date(data.generated_at).getTime()) / 3600000 > 3;
  $("status").replaceChildren(h("div", { class: "banner " + (old ? "warn" : "info") },
    `Updated ${ago(data.generated_at)}. ${run}.` + (old ? " Your PC may be off, so these deals may be stale." : "")));
  $("deals").replaceChildren(...(data.deals.length ? data.deals.map(dealCard)
    : [h("div", { class: "card muted" }, "No deals right now.")]));
  $("ask").replaceChildren(...(data.ask.length ? data.ask.map(askCard)
    : [h("div", { class: "card muted" }, "Nothing to ask right now.")]));
  $("tabs").hidden = $("reload").hidden = $("lock").hidden = false;
  $("unlock").hidden = true;
}

async function load(password) {
  const resp = await fetch("data.json?t=" + Date.now(), { cache: "no-store" });
  if (!resp.ok) throw new Error("Could not download the deals (" + resp.status + ")");
  return decrypt(await resp.json(), password);
}

async function start(password, remember) {
  try {
    render(await load(password));
    if (remember) store("set", password);
  } catch (e) {
    store("del");
    $("unlock").hidden = false;
    $("pw-error").hidden = !(e instanceof DOMException || e.name === "OperationError");
    if ($("pw-error").hidden) $("status").replaceChildren(h("div", { class: "banner bad" }, String(e.message || e)));
  }
}

function showTab(name) {
  for (const a of document.querySelectorAll("#tabs a")) a.classList.toggle("active", a.dataset.tab === name);
  $("deals").hidden = name !== "deals";
  $("ask").hidden = name !== "ask";
}

document.addEventListener("DOMContentLoaded", () => {
  $("unlock").addEventListener("submit", (e) => { e.preventDefault(); start($("pw").value, $("remember").checked); });
  $("lock").addEventListener("click", () => { store("del"); location.reload(); });
  $("reload").addEventListener("click", () => { const pw = store("get"); pw ? start(pw, true) : location.reload(); });
  for (const a of document.querySelectorAll("#tabs a")) a.addEventListener("click", (e) => { e.preventDefault(); showTab(a.dataset.tab); });
  const saved = store("get");
  if (saved) start(saved, true); else $("unlock").hidden = false;
});
