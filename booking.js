(() => {
  const API_BASE = "/api/bookings";

  const el = (id) => document.getElementById(id);

  const dateEl = el("date");
  const durationEl = el("duration");
  const startTimeEl = el("startTime");
  const slotHintEl = el("slotHint");
  const formEl = el("bookingForm");
  const noticeEl = el("notice");
  const submitBtn = el("submitBtn");

  const toLocalDateStr = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const timeToLabel = (hhmm) => {
    // "16:30" -> "4:30pm"
    const [hStr, mStr] = hhmm.split(":");
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const ampm = h >= 12 ? "pm" : "am";
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, "0")}${ampm}`;
  };

  const setNotice = (type, html) => {
    noticeEl.style.display = "flex";
    noticeEl.innerHTML = `<div class="notice__bar"></div><div class="notice__text">${html}</div>`;
    const bar = noticeEl.querySelector(".notice__bar");
    if (type === "ok") {
      bar.style.background = "linear-gradient(180deg, rgba(47,125,246,.85), rgba(47,125,246,.35))";
    } else if (type === "warn") {
      bar.style.background = "linear-gradient(180deg, rgba(255,77,77,.88), rgba(255,77,77,.35))";
    } else {
      bar.style.background = "linear-gradient(180deg, rgba(255,255,255,.40), rgba(255,255,255,.12))";
    }
  };

  const clearNotice = () => {
    noticeEl.style.display = "none";
    noticeEl.innerHTML = "";
  };

  const populateStartTimes = (slots, noteText) => {
    startTimeEl.innerHTML = "";
    if (!slots || slots.length === 0) {
      startTimeEl.innerHTML = `<option value="">No availability for that duration</option>`;
      slotHintEl.textContent = noteText || "Try a different duration or day.";
      return;
    }

    startTimeEl.appendChild(new Option("Select a start time…", ""));
    for (const s of slots) {
      const label = `${timeToLabel(s.start)} → ${timeToLabel(s.end)}`;
      startTimeEl.appendChild(new Option(label, s.start));
    }
    slotHintEl.textContent = noteText || `${slots.length} start times available.`;
  };

  const loadAvailability = async () => {
    clearNotice();

    const date = dateEl.value;
    const duration = durationEl.value;

    if (!date) {
      startTimeEl.innerHTML = `<option value="">Select a date first…</option>`;
      slotHintEl.textContent = "Available start times will appear here.";
      return;
    }

    startTimeEl.innerHTML = `<option value="">Loading…</option>`;
    slotHintEl.textContent = "Checking availability…";

    try {
      const url = new URL(`${API_BASE}/availability`, window.location.origin);
      url.searchParams.set("date", date);
      url.searchParams.set("duration", duration);

      const res = await fetch(url.toString(), { method: "GET" });
      const data = await res.json();

      if (!res.ok) {
        populateStartTimes([], "");
        setNotice("warn", data?.error || "Could not load availability.");
        return;
      }

      populateStartTimes(data.slots, data.note);
    } catch (err) {
      populateStartTimes([], "");
      setNotice("warn", "Network error loading availability. Try again.");
    }
  };

  const computeLocalEpochMs = (dateStr, timeStr, durationMin) => {
    // Uses the user's local browser timezone (Ottawa/Montreal). This avoids DST issues on the server.
    const [hh, mm] = timeStr.split(":").map((x) => parseInt(x, 10));
    const [yyyy, mo, dd] = dateStr.split("-").map((x) => parseInt(x, 10));
    const start = new Date(yyyy, mo - 1, dd, hh, mm, 0, 0);
    const end = new Date(start.getTime() + durationMin * 60_000);
    return { startMs: start.getTime(), endMs: end.getTime() };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearNotice();

    const date = dateEl.value;
    const durationMin = parseInt(durationEl.value, 10);
    const startTime = startTimeEl.value;

    if (!date || !durationMin || !startTime) {
      setNotice("warn", "Pick a <strong>date</strong>, <strong>duration</strong>, and <strong>start time</strong> first.");
      return;
    }

    const name = el("name").value.trim();
    const email = el("email").value.trim();
    const phone = el("phone").value.trim();
    const location = el("location").value.trim();
    const vehicle = el("vehicle").value.trim();
    const vehicleSize = el("vehicleSize").value;
    const pkg = el("package").value;
    const addons = el("addons").value.trim();
    const notes = el("notes").value.trim();

    if (!name || !email || !location || !vehicle) {
      setNotice("warn", "Please fill in <strong>name</strong>, <strong>email</strong>, <strong>location</strong>, and <strong>vehicle</strong>.");
      return;
    }

    const { startMs, endMs } = computeLocalEpochMs(date, startTime, durationMin);

    const payload = {
      date,
      startTime,
      durationMin,
      startMs,
      endMs,
      customer: { name, email, phone },
      details: { location, vehicle, vehicleSize, package: pkg, addons, notes }
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    try {
      const res = await fetch(`${API_BASE}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        setNotice("warn", data?.error || "Could not submit booking request.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Send booking request";
        return;
      }

      setNotice(
        "ok",
        `<strong>Request sent ✅</strong><br>
         We’ve emailed the business for approval. Your slot is held for <strong>45 minutes</strong>.<br>
         <span class="muted">Ref: ${data.bookingId}</span>`
      );

      formEl.reset();
      // keep date/duration for convenience
      dateEl.value = date;
      durationEl.value = String(durationMin);
      await loadAvailability();
    } catch (err) {
      setNotice("warn", "Network error submitting request. Try again.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send booking request";
    }
  };

  // Default date = tomorrow (or today if time is early enough)
  const init = () => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);
    dateEl.value = toLocalDateStr(tomorrow);
    loadAvailability();
  };

  dateEl.addEventListener("change", loadAvailability);
  durationEl.addEventListener("change", loadAvailability);
  formEl.addEventListener("submit", handleSubmit);

  init();
})();