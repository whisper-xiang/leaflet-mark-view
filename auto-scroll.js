// Reader-specific automatic scrolling; speed is CSS pixels per second.
function createAutoScroller(area, onChange, clock = window) {
  let frame = null;
  let running = false;
  let previous = null;
  let position = 0;
  let speed = 35;
  let loop = false;
  function stop(message = "已暂停") {
    if (frame !== null) clock.cancelAnimationFrame(frame);
    frame = null;
    previous = null;
    running = false;
    onChange(false, message);
  }
  function tick(time) {
    if (!running) return;
    const max = area.scrollHeight - area.clientHeight;
    if (max <= 0) return stop("正文无需滚动");
    if (previous !== null) position += speed * Math.min(time - previous, 100) / 1000;
    previous = time;
    if (position >= max) {
      area.scrollTop = max;
      if (!loop) return stop("已读到底部");
      position = 0;
    }
    area.scrollTop = position;
    frame = clock.requestAnimationFrame(tick);
  }
  return {
    get running() { return running; },
    configure(nextSpeed, nextLoop) {
      speed = Number.isFinite(Number(nextSpeed)) ? Math.min(200, Math.max(5, Number(nextSpeed))) : 35;
      loop = nextLoop === true;
      return speed;
    },
    start() {
      if (running) return;
      const max = area.scrollHeight - area.clientHeight;
      if (max <= 0) return stop("正文无需滚动");
      position = area.scrollTop >= max - 1 ? 0 : area.scrollTop;
      area.scrollTop = position;
      previous = null;
      running = true;
      onChange(true, "正在滚动");
      frame = clock.requestAnimationFrame(tick);
    },
    stop,
  };
}

function bindAutoScroll() {
  const area = document.getElementById("contentArea");
  const trigger = document.getElementById("autoScrollTrigger");
  const panel = document.getElementById("autoScrollPanel");
  const toggle = document.getElementById("autoScrollToggle");
  const speed = document.getElementById("autoScrollSpeed");
  const loop = document.getElementById("autoScrollLoop");
  const controller = createAutoScroller(area, (running, message) => {
    toggle.textContent = running ? "暂停滚动" : "开始滚动";
    toggle.setAttribute("aria-pressed", String(running));
    trigger.classList.toggle("is-running", running);
    trigger.title = running ? "自动滚动：正在滚动" : "自动滚动";
    document.getElementById("autoScrollStatus").textContent = message;
  });
  try {
    const saved = JSON.parse(localStorage.getItem("lmv-auto-scroll") || "{}");
    speed.value = controller.configure(saved.speed ?? 35, saved.loop);
    loop.checked = saved.loop === true;
  } catch { speed.value = 35; }
  function configure() {
    speed.value = controller.configure(speed.value, loop.checked);
    const progress = (Number(speed.value) - Number(speed.min)) / (Number(speed.max) - Number(speed.min)) * 100;
    speed.style.setProperty("--auto-scroll-progress", `${progress}%`);
    document.getElementById("autoScrollSpeedLabel").textContent = `${speed.value} 像素/秒`;
    try { localStorage.setItem("lmv-auto-scroll", JSON.stringify({ speed: Number(speed.value), loop: loop.checked })); } catch {}
  }
  configure();
  speed.addEventListener("input", configure);
  loop.addEventListener("change", configure);
  function close() {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }
  trigger.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    trigger.setAttribute("aria-expanded", String(!panel.hidden));
  });
  toggle.addEventListener("click", () => {
    if (controller.running) {
      controller.stop();
    } else {
      controller.start();
      close();
      trigger.focus();
    }
  });
  document.addEventListener("pointerdown", event => {
    if (!event.target.closest(".auto-scroll-control")) {
      close();
      if (controller.running) controller.stop();
    }
  });
  area.addEventListener("wheel", () => { if (controller.running) controller.stop(); }, { passive: true });
  area.addEventListener("touchstart", () => { if (controller.running) controller.stop(); }, { passive: true });
  document.addEventListener("keydown", event => {
    if (!event.target.closest("input, textarea, select, button, [contenteditable='true']") &&
        ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key) && controller.running) controller.stop();
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) controller.stop(); });
  window.addEventListener("pagehide", () => controller.stop());
  controller.closePanel = () => {
    if (panel.hidden) return false;
    close();
    trigger.focus();
    return true;
  };
  return controller;
}
