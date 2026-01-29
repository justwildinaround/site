(() => {
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

  const bookingMessage = document.getElementById("bookingMessage");
  const copyBtn1 = document.getElementById("copyMsgBtn");
  const copyBtn2 = document.getElementById("copyMsgBtn2");

  async function copyMessage() {
    if (!bookingMessage) return;
    const text = bookingMessage.value.trim();
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied booking message");
    } catch {
      bookingMessage.select();
      document.execCommand("copy");
      toast("Copied booking message");
    }
  }

  [copyBtn1, copyBtn2].forEach((btn) => {
    if (!btn) return;
    btn.addEventListener("click", copyMessage);
  });

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
    setTimeout(() => el.remove(), 1400);
  }
})();
