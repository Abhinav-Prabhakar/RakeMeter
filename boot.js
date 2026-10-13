// Start-up. The page draws nothing until the backend has sent the rulebook and the day;
// then the scripts that need them are loaded, in order. Open with ?reset to start from a
// clean day.
(async () => {
  const params = new URLSearchParams(location.search);
  try {
    if (params.has("reset")) await Api.reset();
    const [rules, day] = await Promise.all([Api.rules(), Api.day()]);
    Yard.use(rules);
    window.BOOT = { rules, day };
  } catch (e) {
    const note = document.getElementById("offline");
    note.querySelector("b").textContent = e.code === "offline" ? "The backend is not running" : "The backend could not start the day";
    note.querySelector("span").textContent = e.code === "offline" ? `Nothing is answering at ${Api.BASE}. Start everything with: uv run dev` : e.message;
    note.classList.add("on");
    return;
  }
  for (const src of ["meter.js", "train.js", "board.js", "app.js", "bills.js"]) {
    await new Promise((done, fail) => { const s = document.createElement("script"); s.src = src; s.onload = done; s.onerror = fail; document.body.appendChild(s); });
  }
})();
