(() => {
  "use strict";

  // ----------------------------
  // Tiny helpers
  // ----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function toast(msg) {
    const el = document.createElement("div");
    el.textContent = msg;
    Object.assign(el.style, {
      position: "fixed",
      left: "50%",
      bottom: "22px",
      transform: "translateX(-50%)",
      padding: "10px 14px",
      borderRadius: "14px",
      background: "rgba(0,0,0,.78)",
      border: "1px solid rgba(255,255,255,.12)",
      color: "rgba(255,255,255,.9)",
      fontFamily: "Inter, system-ui, sans-serif",
      fontWeight: "900",
      fontSize: "13px",
      letterSpacing: ".02em",
      zIndex: "9999",
      boxShadow: "0 18px 60px rgba(0,0,0,.55)",
      pointerEvents: "none",
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  async function copyToClipboard(text, successMsg) {
    const value = String(text || "").trim();
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      toast(successMsg);
      return;
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      Object.assign(ta.style, { position: "fixed", left: "-9999px", top: "0" });
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        toast(successMsg);
      } finally {
        ta.remove();
      }
    }
  }

  // ----------------------------
  // Mobile nav
  // ----------------------------
  const navToggle = $("#navToggle");
  const navMobile = $("#navMobile");

  if (navToggle && navMobile) {
    const closeNav = () => {
      navMobile.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
      navMobile.setAttribute("aria-hidden", "true");
    };

    navToggle.addEventListener("click", () => {
      const open = navMobile.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(open));
      navMobile.setAttribute("aria-hidden", String(!open));
    });

    // Delegate: close when any link/button inside mobile menu is clicked
    navMobile.addEventListener("click", (e) => {
      const a = e.target.closest("a,button");
      if (!a) return;
      closeNav();
    });
  }

  // ----------------------------
  // Copy booking message + email
  // ----------------------------
  const bookingMessage = $("#bookingMessage");
  const copyMsgBtn = $("#copyMsgBtn");
  const copyMsgBtn2 = $("#copyMsgBtn2");

  const copyMessage = async () => {
    if (!bookingMessage) return;
    await copyToClipboard(bookingMessage.value, "Booking message copied to clipboard");
  };

  if (copyMsgBtn) copyMsgBtn.addEventListener("click", copyMessage);
  if (copyMsgBtn2) copyMsgBtn2.addEventListener("click", copyMessage);

  const copyEmailBtn = $("#copyEmailBtn");
  if (copyEmailBtn) {
    copyEmailBtn.addEventListener("click", async () => {
      await copyToClipboard("detailnco2@gmail.com", "Email copied to clipboard");
    });
  }

  // ----------------------------
  // Particles (optional)
  // ----------------------------
  const canvas = $("#fx");
  const reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (canvas && !reduceMotion) {
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
      c: Math.random() < 0.74 ? "b" : "r",
    }));

    let last = 0;
    const fpsInterval = 1000 / 30;

    function draw(t) {
      if (t - last >= fpsInterval) {
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
          ctx.fillStyle =
            p.c === "b"
              ? `rgba(22,155,255,${p.a})`
              : `rgba(255,45,45,${p.a * 0.85})`;
          ctx.fill();
        }
      }
      requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
  }

  // ----------------------------
  // Reviews / Testimonials (localStorage)
  // ----------------------------
  const REVIEW_KEY = "detailnco_reviews_v1";
  const OWNED_KEY = "detailnco_owned_review_ids_v1";

  const reviewForm = $("#reviewForm");
  const reviewBoard = $("#reviewBoard");
  const reviewName = $("#reviewName");
  const reviewText = $("#reviewText");

  const safeLoad = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const safeSave = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  };

  const escapeHtml = (str) =>
    String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const formatTime = (ts) => {
    try {
      const d = new Date(ts);
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const getReviews = () => safeLoad(REVIEW_KEY, []);
  const setReviews = (list) => safeSave(REVIEW_KEY, list);

  const getOwnedSet = () => new Set(safeLoad(OWNED_KEY, []));
  const addOwned = (id) => {
    const ids = safeLoad(OWNED_KEY, []);
    if (!ids.includes(id)) ids.push(id);
    safeSave(OWNED_KEY, ids);
  };
  const removeOwned = (id) => {
    const ids = safeLoad(OWNED_KEY, []);
    safeSave(OWNED_KEY, ids.filter((x) => x !== id));
  };

  const genId = () => {
    try {
      if (crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch {}
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  function renderReviews() {
    if (!reviewBoard) return;

    const reviews = getReviews().slice().sort((a, b) => b.ts - a.ts);
    const owned = getOwnedSet();

    if (!reviews.length) {
      reviewBoard.innerHTML = `<div class="fine muted">No reviews yet. Be the first to leave one.</div>`;
      return;
    }

    reviewBoard.innerHTML = reviews
      .map((r) => {
        const canDelete = owned.has(r.id);
        return `
          <div class="reviewItem" data-id="${escapeHtml(r.id)}">
            <div class="reviewTop">
              <div class="reviewName">${escapeHtml(r.name)}</div>
              <div class="reviewTime">${escapeHtml(formatTime(r.ts))}</div>
            </div>
            <div class="reviewText">${escapeHtml(r.text)}</div>
            ${
              canDelete
                ? `<div class="reviewActions">
                     <button class="btn btn--ghost btn--small js-del-review" type="button">Delete</button>
                   </div>`
                : ``
            }
          </div>
        `;
      })
      .join("");
  }

  function addReview(name, text) {
    const id = genId();
    const review = { id, name, text, ts: Date.now() };
    const reviews = getReviews();
    reviews.push(review);
    setReviews(reviews);
    addOwned(id);
    renderReviews();
  }

  function deleteReview(id) {
    const owned = getOwnedSet();
    if (!owned.has(id)) return;
    setReviews(getReviews().filter((r) => r.id !== id));
    removeOwned(id);
    renderReviews();
  }

  if (reviewForm && reviewBoard && reviewName && reviewText) {
    renderReviews();

    reviewForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = reviewName.value.trim();
      const text = reviewText.value.trim();
      if (!name || !text) return;
      addReview(name, text);
      reviewText.value = "";
      toast("Review posted");
    });

    reviewBoard.addEventListener("click", (e) => {
      const btn = e.target.closest(".js-del-review");
      if (!btn) return;
      const wrap = btn.closest(".reviewItem");
      const id = wrap?.getAttribute("data-id");
      if (!id) return;
      deleteReview(id);
      toast("Review deleted");
    });

  // ----------------------------
// Package Wheel (Orbit)
// ----------------------------
const wheel = document.getElementById("packageWheel");

if (wheel) {
  const items = [...wheel.querySelectorAll(".wheelItem")];
  let index = 0;

  const setPositions = (activeIndex) => {
    const radius = parseFloat(getComputedStyle(wheel).getPropertyValue("--radius")) || 140;
    const step = (Math.PI * 2) / items.length;

    items.forEach((item, i) => {
      const posIndex = (i - activeIndex + items.length) % items.length;

      // active at top
      const angle = -Math.PI / 2 + posIndex * step;

      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      // subtle depth illusion
      const depth =
        posIndex === 0 ? 1 :
        (posIndex === 1 || posIndex === items.length - 1 ? 0.93 : 0.88);

      item.style.setProperty("--wheelT", `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${depth})`);
      item.classList.toggle("active", i === activeIndex);
      item.style.zIndex = String(100 - posIndex);
      item.style.opacity = i === activeIndex ? "1" : "0.55";
    });
  };

  setPositions(index);

  const next = () => {
    index = (index + 1) % items.length;
    setPositions(index);
  };

  let interval = setInterval(next, 4000);

  items.forEach((item, i) => {
    item.addEventListener("click", () => {
      index = i;
      setPositions(index);
      const link = item.dataset.link;
      if (link) window.location.href = link;
    });

    item.addEventListener("mouseenter", () => clearInterval(interval));
    item.addEventListener("mouseleave", () => {
      interval = setInterval(next, 4000);
    });
  });

  window.addEventListener("resize", () => setPositions(index), { passive: true });
}
}
  }

window.addEventListener("DOMContentLoaded", () => {
  const wheel = document.getElementById("packageWheel");
  if (!wheel) return;

  const items = [...wheel.querySelectorAll(".wheelItem")];
  if (!items.length) return;

  let index = 0;

  const setPositions = (activeIndex) => {
    const step = (Math.PI * 2) / items.length;
    const radius = parseFloat(getComputedStyle(wheel).getPropertyValue("--radius")) || 140;

    items.forEach((item, i) => {
      const posIndex = (i - activeIndex + items.length) % items.length;
      const angle = -Math.PI / 2 + posIndex * step;

      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      const depth =
        posIndex === 0 ? 1 :
        (posIndex === 1 || posIndex === items.length - 1 ? 0.93 : 0.88);

      item.style.setProperty("--wheelT", `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${depth})`);
      item.classList.toggle("active", i === activeIndex);
      item.style.zIndex = String(100 - posIndex);
      item.style.opacity = i === activeIndex ? "1" : "0.55";
    });
  };

  setPositions(index);

  const next = () => {
    index = (index + 1) % items.length;
    setPositions(index);
  };

  let interval = setInterval(next, 4000);

  items.forEach((item, i) => {
    item.addEventListener("click", () => {
      index = i;
      setPositions(index);
      const link = item.dataset.link;
      if (link) window.location.href = link;
    });

    item.addEventListener("mouseenter", () => clearInterval(interval));
    item.addEventListener("mouseleave", () => {
      interval = setInterval(next, 4000);
    });
  });

  window.addEventListener("resize", () => setPositions(index), { passive: true });

  // debug: remove later
  console.log("[wheel] initialized", items.length);
});

})();




