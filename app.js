(() => {
  // Mobile nav
  const navToggle = document.getElementById("navToggle");
  const navMobile = document.getElementById("navMobile");

  if (navToggle && navMobile) {
    navToggle.addEventListener("click", () => {
      const open = navMobile.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(open));
      navMobile.setAttribute("aria-hidden", String(!open));
    });

    navMobile.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => {
        navMobile.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
        navMobile.setAttribute("aria-hidden", "true");
      });
    });
  }

  function toast(msg) {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.position = "fixed";
    el.style.left = "50%";
    el.style.bottom = "22px";
    el.style.transform = "translateX(-50%)";
    el.style.padding = "10px 14px";
    el.style.borderRadius = "14px";
    el.style.background = "rgba(0,0,0,.78)";
    el.style.border = "1px solid rgba(255,255,255,.12)";
    el.style.color = "rgba(255,255,255,.9)";
    el.style.fontFamily = "Inter, system-ui, sans-serif";
    el.style.fontWeight = "900";
    el.style.fontSize = "13px";
    el.style.letterSpacing = ".02em";
    el.style.zIndex = "9999";
    el.style.boxShadow = "0 18px 60px rgba(0,0,0,.55)";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  async function copyToClipboard(text, successMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(successMsg);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast(successMsg);
    }
  }

  // Copy booking message
  const bookingMessage = document.getElementById("bookingMessage");
  const copyBtn1 = document.getElementById("copyMsgBtn");
  const copyBtn2 = document.getElementById("copyMsgBtn2");

  async function copyMessage() {
    if (!bookingMessage) return;
    await copyToClipboard(bookingMessage.value.trim(), "Booking message copied to clipboard");
  }

  [copyBtn1, copyBtn2].forEach((btn) => btn && btn.addEventListener("click", copyMessage));

  // Copy email button
  const copyEmailBtn = document.getElementById("copyEmailBtn");
  if (copyEmailBtn) {
    copyEmailBtn.addEventListener("click", async () => {
      await copyToClipboard("detailnco2@gmail.com", "Email copied to clipboard");
    });
  }

  // Particles (unchanged from your existing version)
  const canvas = document.getElementById("fx");
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!canvas || reduceMotion) return;

  const ctx = canvas.getContext("2d", { alpha: true });

  let w = 0, h = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 1.25);

  const rand = (min, max) => min + Math.random() * (max - min);

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  const count = Math.max(26, Math.min(34, Math.round((w * h) / 70000)));
  const particles = Array.from({ length: count }, () => ({
    x: rand(0, w),
    y: rand(0, h),
    r: rand(0.9, 2.0),
    vx: rand(-0.10, 0.10),
    vy: rand(-0.06, 0.06),
    a: rand(0.06, 0.14),
    c: Math.random() < 0.74 ? "b" : "r"
  }));

  let last = 0;
  const fpsInterval = 1000 / 30;

  function draw(t) {
    if (t - last < fpsInterval) {
      requestAnimationFrame(draw);
      return;
    }
    last = t;

    ctx.clearRect(0, 0, w, h);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      if (p.y < -10) p.y = h + 10;
      if (p.y > h + 10) p.y = -10;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.c === "b"
        ? `rgba(22,155,255,${p.a})`
        : `rgba(255,45,45,${p.a * 0.85})`;
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
})();
