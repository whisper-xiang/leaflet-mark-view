(function () {
  var REPO = "whisper-xiang/leaflet-mark-view";

  function formatStars(count) {
    if (typeof count !== "number" || isNaN(count) || count < 0) return "";
    if (count >= 1000) return (count / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(count);
  }

  fetch("https://api.github.com/repos/" + REPO)
    .then(function (res) {
      if (!res.ok) throw new Error("stars");
      return res.json();
    })
    .then(function (data) {
      var formatted = formatStars(data.stargazers_count);
      if (!formatted) return;
      document.querySelectorAll(".gh-star-count").forEach(function (el) {
        el.textContent = formatted;
      });
    })
    .catch(function () {});

  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy") || "";
      if (!text || !navigator.clipboard) return;
      navigator.clipboard.writeText(text).then(function () {
        var original = btn.textContent;
        btn.textContent = btn.getAttribute("data-copied") || "已复制";
        setTimeout(function () {
          btn.textContent = original;
        }, 1600);
      });
    });
  });
})();
