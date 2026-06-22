// New-tab takeover gate. Loaded as the first <head> script in home.html so it
// runs before anything renders. When the user has turned the home page off, a
// bare new-tab load (no ?open=1) sends the tab to Google instead. Explicit opens
// from the popup carry ?open=1 and are never suppressed. localStorage is
// synchronous, so there is no flash. replace() keeps it out of history, so Back
// doesn't bounce to home.html. (Inline scripts are blocked by the MV3 CSP, hence
// this external file.)
if (
  !location.search.includes("open=1") &&
  localStorage.getItem("lmv-newtab-home") === "0"
) {
  location.replace("https://www.google.com");
}
