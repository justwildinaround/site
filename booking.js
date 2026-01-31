(() => {
  const API_BASE = "/api/bookings";

  const el = (id) => document.getElementById(id);

  const dateEl = el("date");
  const startTimeEl = el("startTime");
  const slotHintEl = el("slotHint");
  const formEl = el("bookingForm");
  const noticeEl = el("notice");
  const submitBtn = el("submitBtn");

  const sizeEl = el("vehicleSize");
  const packageEl = el("package");

  const addonsListEl = el("addonsList");
  const sumPackageEl = el("sumPackage");
  const sumAddonsEl = el("sumAddons");
  const sumFeesEl = el("sumFees");
  const sumTaxEl = el("sumTax");
  const sumTotalEl = el("sumTotal");

  // Customer does NOT choose duration. We use a conservative default purely for the soft-hold + availability display.
  // You can change this later if you want "holds" to assume a longer window.
  function getHoldDurationForDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00"); // safe local parse
  const day = d.getDay(); // 0=Sun, 6=Sat

  const isWeekend = (day === 0 || day === 6);
  return isWeekend ? 360 : 330; // weekend 6h, weekday 5.5h
}

  // Pricing knobs
  const HST_RATE = 0.13;
  const FIXED_FEES = 0.00; // e.g., mobile service fee. Set to 10 for $10, etc.

  const SIZE_LABELS = {
    small: "Small",
    medium: "Medium",
    large: "Large",
  };


  const PACKAGES = {
    refresh: {
      label: "Select Series",
      prices: { small: 89.99, medium: 109.99, large: 124.99 },
    },
    signature: {
      label: "Signature Series",
      prices: { small: 134.99, medium: 164.99, large: 182.99 },
    },
    showroom: {
      label: "Showroom Series",
      prices: { small: 249.99, medium: 299.99, large: 339.99 },
    },
  };



  const renderPackageOptions = () => {
    const sizeKey = sizeEl.value || "small";
    const current = packageEl.value;

    // Start fresh
    packageEl.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a package…";
    packageEl.appendChild(placeholder);

    Object.entries(PACKAGES).forEach(([key, pkg]) => {
      const price = Number(pkg?.prices?.[sizeKey] || 0);
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `${pkg.label} — ${SIZE_LABELS[sizeKey] || sizeKey} ${money(price)}`;
      packageEl.appendChild(opt);
    });

    // Restore selection if possible
    if (current && PACKAGES[current]) {
      packageEl.value = current;
    }
  };


  // Fixed-price add-ons (from your add-ons page)
  const ADDONS = [
    { key: "interior_rescent", name: "Interior Re-Scent (up to 1-month freshness)", amount: 25.0 },
    { key: "smoke_odor", name: "Smoke Odor Removal", amount: 60.0 },
    { key: "cabin_filter_clean", name: "Cabin Air Filter Cleaning", amount: 5.0 },
    { key: "engine_filter_clean", name: "Engine Air Filter Cleaning", amount: 10.0 },
    { key: "windshield_wax", name: "Windshield Waxing & Window Cleaning", amount: 20.0 },
    { key: "pet_hair", name: "Pet Hair Removal", amount: 25.0 },
    { key: "seat_shampoo", name: "Seat Shampoo & Extraction", amount: 50.0 },
    { key: "headlight_restore", name: "Headlight Restoration", amount: 45.0 },
  ];

  const money = (n) => {
    const v = Number(n || 0);
    return `$${v.toFixed(2)}`;
  };

  const timeToLabel = (hhmm) => {
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
      startTimeEl.innerHTML = `<option value="">No start times available</option>`;
      slotHintEl.textContent = noteText || "Try a different day.";
      return;
    }

    startTimeEl.appendChild(new Option("Select a start time…", ""));
    for (const s of slots) {
      const label = timeToLabel(s.start);
      startTimeEl.appendChild(new Option(label, s.start));
    }
    slotHintEl.textContent = noteText || `${slots.length} start times available.`;
  };

  const renderAddons = () => {
    addonsListEl.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "addonList";
    for (const a of ADDONS) {
      const lab = document.createElement("label");
      lab.className = "addonItem";
      lab.style.cursor = "pointer";
      lab.dataset.key = a.key;
      lab.dataset.amount = String(a.amount);

      lab.innerHTML = `
        <div class="addonItem__name">${a.name}</div>
        <div class="addonItem__price">${money(a.amount)} <input type="checkbox" style="margin-left:10px;"></div>
        <div class="addonItem__note">Fixed-price add-on.</div>
      `;

      wrap.appendChild(lab);
    }
    addonsListEl.appendChild(wrap);

    // hook events
    addonsListEl.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => updateSummary());
    });
  };

  const getSelectedAddons = () => {
    const selected = [];
    addonsListEl.querySelectorAll("label.addonItem").forEach((lab) => {
      const cb = lab.querySelector("input[type=checkbox]");
      if (cb && cb.checked) {
        selected.push({
          key: lab.dataset.key,
          name: lab.querySelector(".addonItem__name")?.textContent?.trim() || lab.dataset.key,
          amount: Number(lab.dataset.amount || 0),
        });
      }
    });
    return selected;
  };

  const updateSummary = () => {
    const pkgKey = packageEl.value;
    const sizeKey = sizeEl.value;

    const pkg = PACKAGES[pkgKey];
    const pkgPrice = pkg ? Number(pkg.prices[sizeKey] || 0) : 0;

    const addons = getSelectedAddons();
    const addonsTotal = addons.reduce((acc, x) => acc + Number(x.amount || 0), 0);

    const fees = FIXED_FEES;
    const sub = pkgPrice + addonsTotal + fees;
    const tax = sub * HST_RATE;
    const total = sub + tax;

    sumPackageEl.textContent = money(pkgPrice);
    sumAddonsEl.textContent = money(addonsTotal);
    sumFeesEl.textContent = money(fees);
    sumTaxEl.textContent = money(tax);
    sumTotalEl.textContent = money(total);

    return { pkgPrice, addonsTotal, fees, tax, total, pkgKey, sizeKey, addons };
  };

  const loadAvailability = async () => {
    clearNotice();

    const date = dateEl.value;
    if (!date) {
      startTimeEl.innerHTML = `<option value="">Select a date first…</option>`;
      slotHintEl.textContent = "Available start times will appear here.";
      return;
    }

    startTimeEl.innerHTML = `<option value="">Loading…</option>`;
    slotHintEl.textContent = "Checking availability…";

    try {
      // We pass a conservative default duration only to compute overlaps.
      const url = `${API_BASE}/availability?date=${encodeURIComponent(date)}&duration=${DEFAULT_HOLD_DURATION_MIN}`;
      const res = await fetch(url, { headers: { "Accept": "application/json" } });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        // likely HTML 404 if you're on GitHub Pages, or functions not deployed
        throw new Error("Non-JSON response");
      }

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load availability.");
      }

      populateStartTimes(data.slots, data.note);
    } catch (e) {
      startTimeEl.innerHTML = `<option value="">Unavailable</option>`;
      slotHintEl.textContent = "Network error loading availability. Try again.";

      // Helpful hint for deployment issues
      setNotice(
        "warn",
        `Couldn’t load availability. If you’re previewing on <strong>GitHub Pages</strong>, the <code>/api</code> endpoints won’t work. Test on your <strong>Cloudflare Pages</strong> URL/domain.`
      );
      console.error(e);
    }
  };

  const toMs = (dateStr, hhmm) => {
    // Treat inputs as local time (Ottawa). The server stores ms as a number; it's used consistently for overlap checks.
    // This uses the browser's local timezone; deploy/usage is expected in Ottawa.
    const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
    const [yyyy, mm, dd] = dateStr.split("-").map((x) => parseInt(x, 10));
    const d = new Date(yyyy, mm - 1, dd, h, m, 0, 0);
    return d.getTime();
  };

  const initDefaultDate = () => {
    // default to tomorrow
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    dateEl.value = `${yyyy}-${mm}-${dd}`;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    clearNotice();

    const date = dateEl.value;
    const startTime = startTimeEl.value;

    if (!date || !startTime) {
      setNotice("warn", "Please select a date and start time.");
      return;
    }

    // Pricing + selections
    const pricing = updateSummary();
    if (!pricing.pkgKey) {
      setNotice("warn", "Please select a package.");
      return;
    }

    // Required customer + details fields
    const name = el("name").value.trim();
    const email = el("email").value.trim();
    const phone = el("phone").value.trim();
    const location = el("location").value.trim();
    const vehicle = el("vehicle").value.trim();
    const notes = el("notes").value.trim();

    if (!name || !email || !location || !vehicle) {
      setNotice("warn", "Please fill in your name, email, location, and vehicle.");
      return;
    }

    const startMs = toMs(date, startTime);
    const endMs = startMs + DEFAULT_HOLD_DURATION_MIN * 60_000 * 1000;

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

    try {
      const durationMin = getHoldDurationForDate(date);
      
      const payload = {
        date,
        startTime,
        durationMin,
        startMs,
        endMs,
        customer: { name, email, phone },
        details: {
          location,
          vehicle,
          vehicleSize: pricing.sizeKey,
          package: PACKAGES[pricing.pkgKey]?.label || pricing.pkgKey,
          addons: pricing.addons.map((a) => `${a.name} ($${Number(a.amount).toFixed(2)})`).join(", "),
          notes,
        },
        pricing: {
          packagePrice: pricing.pkgPrice,
          addonsTotal: pricing.addonsTotal,
          fees: pricing.fees,
          tax: pricing.tax,
          total: pricing.total,
          taxRate: HST_RATE,
          currency: "CAD",
        },
      };

      const res = await fetch(`${API_BASE}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to submit booking request.");
      }

      setNotice(
        "ok",
        `Request submitted ✅ We’ve emailed the business for approval. Your time is soft-held for <strong>45 minutes</strong>.`
      );

      formEl.reset();
      initDefaultDate();
      renderAddons();
      updateSummary();
      await loadAvailability();
    } catch (err) {
      setNotice("warn", err.message || "Something went wrong.");
      console.error(err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Request Booking";
    }
  };

  // Events
  dateEl.addEventListener("change", loadAvailability);
  startTimeEl.addEventListener("change", () => {});
  packageEl.addEventListener("change", updateSummary);
  sizeEl.addEventListener("change", () => {
    renderPackageOptions();
    updateSummary();
  });

  // Init
  initDefaultDate();
  renderPackageOptions();
  renderAddons();
  updateSummary();
  loadAvailability();
})();
