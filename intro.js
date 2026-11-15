// Opening video (7 s): a satellite passes at orbital sunrise, the camera dives
// through the clouds onto a relief model of the Pacific Northwest, and Washington
// lights up under the page's question. It is pre-rendered (see the claude-ui-intro
// branch for the WebGL source), so the browser only plays a video.
// Plays once per session, skippable (button, Esc/Enter/Space), skipped for reduced
// motion, and abandoned if it has not started within 4 s. ?intro forces it.
(function () {
  const overlay = document.getElementById("intro");
  if (!overlay || !document.documentElement.classList.contains("intro-active")) return;
  const video = overlay.querySelector("video");
  // H.264 MP4 for most browsers; VP9 WebM where H.264 is unavailable.
  video.src = video.canPlayType('video/mp4; codecs="avc1.640028"') ? "assets/intro/intro.mp4" : "assets/intro/intro.webm";
  let finished = false;

  function finish(immediate) {
    if (finished) return;
    finished = true;
    try {
      sessionStorage.setItem("tc-intro-seen", "1");
    } catch (error) {
      /* storage unavailable */
    }
    window.removeEventListener("keydown", onKey);
    const done = () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      overlay.remove();
      document.documentElement.classList.remove("intro-active");
    };
    if (immediate) {
      done();
      return;
    }
    overlay.classList.add("intro-leaving");
    setTimeout(done, 650);
  }

  function onKey(event) {
    if (["Escape", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      finish(false);
    }
  }

  overlay.querySelector(".intro-skip").addEventListener("click", () => finish(false));
  window.addEventListener("keydown", onKey);
  video.addEventListener("playing", () => {
    window.__introStarted = true;
    overlay.classList.add("intro-ready");
  });
  video.addEventListener("ended", () => finish(false));
  video.addEventListener("error", () => finish(true));
  const started = video.play();
  if (started && started.catch) started.catch(() => finish(true));
})();
