// The page's one door to the backend. Every number on screen comes through here, and
// every choice made on screen goes back through it. The backend speaks snake_case; the
// page reads camelCase, so keys are renamed on the way in.
const Api = (() => {
  const BASE = (new URLSearchParams(location.search).get("api") || window.TRAIN_API || `${location.protocol}//${location.hostname || "localhost"}:8000`).replace(/\/$/, "");
  const camel = (v) => Array.isArray(v) ? v.map(camel)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(x)]))
    : v;
  const query = (o) => { const q = Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&"); return q ? "?" + q : ""; };

  // An error from the backend keeps its code: "invalid", "not_found", "conflict".
  // One that never got there is "offline".
  async function call(method, path, body) {
    let res;
    try {
      res = await fetch(BASE + path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    } catch (e) {
      throw Object.assign(new Error(`The backend at ${BASE} is not answering`), { code: "offline" });
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error((data && data.error && data.error.message) || res.statusText), { code: (data && data.error && data.error.code) || "error", status: res.status });
    return camel(data);
  }

  return {
    BASE,
    rules: () => call("GET", "/api/rules"),
    day: (at) => call("GET", "/api/day" + query({ at })),
    state: (t) => call("GET", "/api/day/state" + query({ t })),
    options: (slot, at) => call("GET", `/api/rakes/${encodeURIComponent(slot)}/options` + query({ at })),
    setRake: (slot, patch, at) => call("PATCH", `/api/rakes/${encodeURIComponent(slot)}`, at === undefined ? patch : { ...patch, at }),
    months: () => call("GET", "/api/months").then((d) => d.months),
    bills: (id) => call("GET", `/api/months/${encodeURIComponent(id)}/bills`),
    setBill: (id, patch) => call("PATCH", `/api/bills/${encodeURIComponent(id)}`, patch),
    reset: () => call("POST", "/api/reset"),
  };
})();
