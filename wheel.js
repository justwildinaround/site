(() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const initWheel = () => {
    const wheel = document.getElementById("packageWheel");
    if (!wheel) return;

    const items = Array.from(wheel.querySelectorAll(".wheelItem"));
    if (items.length < 2) return;

    // Ensure each item is clickable + accessible
    items.forEach((item) => {
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");
    });

    let index = 0;
    let interval = null;

    const getRadius = () => {
      const cssVal = getComputedStyle(wheel).getPropertyValue("--radius").trim();
      const r = cssVal ? parseFloat(cssVal) : 140;
      return Number.isFinite(r) ? r : 140;
    };

    const setPositions = (activeIndex, animate = true) => {
      const radius = getRadius();
      const step = (Math.PI * 2) / items.length;

      // Slight vertical squash to feel more “premium”
      const ySquash = 0.78;

      items.forEach((item, i) => {
        const posIndex = (i - activeIndex + items.length) % items.length;
        const angle = -Math.PI / 2 + posIndex * step;

        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * ySquash;

        // Depth illusion
        const front = posIndex === 0;
        const near = posIndex === 1 || posIndex === items.length - 1;

        const scale = front ? 1.0 : near ? 0.92 : 0.86;
        const opacity = front ? 1.0 : near ? 0.55 : 0.40;
        const blur = front ? 0 : near ? 0.2 : 0.35;

        item.style.setProperty(
          "--wheelT",
          `translate(-50%,-50%) translate(${x}px, ${y}px) scale(${scale})`
        );

        item.style.opacity = String(opacity);
        item.style.filter = `brightness(${front ? 1.06 : 0.98}) blur(${blur}px)`;
        item.style.zIndex = String(100 - posIndex);

        item.classList.toggle("active", front);

        // animation toggle (for first paint)
        item.style.transition = animate
          ? "transform 700ms cubic-bezier(.2,.8,.2,1), opacity 600ms ease, filter 500ms ease, border-color 250ms ease"
          : "none";
      });

      // Restore transitions after a no-animate paint
      if (!animate) requestAnimationFrame(() => items.forEach((it) => (it.style.transition = "")));
    };

    const go = (newIndex, animate = true) => {
      index = (newIndex + items.length) % items.length;
      setPositions(index, animate);
    };

    const start = () => {
      stop();
      interval = setInterval(() => go(index + 1), 3800);
    };

    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };

    // Initial layout
    go(index, false);
    start();

    // Interactions
    items.forEach((item, i) => {
      const open = () => {
        go(i);
        const link = item.dataset.link;
        if (link) window.location.href = link;
      };

      item.addEventListener("click", open);
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });

      item.addEventListener("mouseenter", stop);
      item.addEventListener("mouseleave", start);
      item.addEventListener("focus", stop);
      item.addEventListener("blur", start);
    });

    // Drag / swipe (premium feel)
    let isDown = false;
    let startX = 0;

    const onDown = (clientX) => {
      isDown = true;
      startX = clientX;
      stop();
    };

    const onUp = (clientX) => {
      if (!isDown) return;
      isDown = false;

      const dx = clientX - startX;
      const threshold = 35;

      if (Math.abs(dx) > threshold) {
        go(index + (dx < 0 ? 1 : -1));
      }

      start();
    };

    wheel.addEventListener("pointerdown", (e) => onDown(e.clientX));
    window.addEventListener("pointerup", (e) => onUp(e.clientX));

    // Resize responsiveness
    window.addEventListener(
      "resize",
      () => {
        // Reposition without “jump”
        setPositions(index, false);
      },
      { passive: true }
    );

    // Debug (remove later if you want)
    console.log("[wheel] premium rotator ready", items.length);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWheel);
  } else {
    initWheel();
  }
})();
