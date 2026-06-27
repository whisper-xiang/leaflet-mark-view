// Resolve and fetch remote Markdown (GitHub repos/files + generic https .md links).
const RemoteMD = (() => {
  const MD_RE = /\.(md|markdown|mdown|mkd)$/i;

  function isMarkdownPath(path) {
    return MD_RE.test(path);
  }

  function decodeBase64Utf8(b64) {
    const bin = atob(b64.replace(/\n/g, ""));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function parseInput(raw) {
    let url = raw.trim();
    if (!url) throw new Error("请输入链接");
    if (!/^https?:\/\//i.test(url)) {
      if (/^github\.com\//i.test(url) || /^www\.github\.com\//i.test(url)) {
        url = "https://" + url.replace(/^www\./i, "");
      } else {
        throw new Error("请输入以 http:// 或 https:// 开头的链接");
      }
    }
    return new URL(url);
  }

  function rawGithubUrl(owner, repo, branch, path) {
    const encodedPath = path
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodedPath}`;
  }

  function parseGithub(u) {
    const host = u.hostname.replace(/^www\./, "");

    if (host === "raw.githubusercontent.com") {
      const [owner, repo, branch, ...rest] = u.pathname
        .split("/")
        .filter(Boolean);
      if (!owner || !repo || !branch || !rest.length) return null;
      const path = rest.map(decodeURIComponent).join("/");
      return {
        kind: "file",
        owner,
        repo,
        branch,
        path,
        srcUrl: u.href,
        name: path.split("/").pop(),
      };
    }

    if (host !== "github.com") return null;

    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const [owner, repo, ...rest] = parts;

    if (rest[0] === "blob" && rest.length >= 3) {
      const branch = rest[1];
      const path = rest.slice(2).map(decodeURIComponent).join("/");
      return {
        kind: "file",
        owner,
        repo,
        branch,
        path,
        srcUrl: rawGithubUrl(owner, repo, branch, path),
        name: path.split("/").pop(),
      };
    }

    if (rest[0] === "tree" && rest.length >= 2) {
      const branch = rest[1];
      const path = rest.slice(2).map(decodeURIComponent).join("/");
      return { kind: "tree", owner, repo, branch, path };
    }

    if (!rest.length) {
      return { kind: "repo", owner, repo };
    }

    return null;
  }

  async function githubApi(path) {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.json()).message;
      } catch (_) {}
      throw new Error(detail || `GitHub API 请求失败 (${res.status})`);
    }
    return res.json();
  }

  async function getDefaultBranch(owner, repo) {
    const data = await githubApi(`/repos/${owner}/${repo}`);
    return data.default_branch;
  }

  async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`无法获取文件 (${res.status})`);
    return res.text();
  }

  // GitHub origins are granted at install time; any other https origin is
  // requested on demand ("secure by design" — no blanket host access). Must run
  // inside a user gesture, so it's called straight from the Open-URL action.
  async function ensureOriginPermission(url) {
    if (typeof chrome === "undefined" || !chrome.permissions) return;
    let origin;
    try {
      origin = new URL(url).origin + "/*";
    } catch (_) {
      return;
    }
    const has = await chrome.permissions.contains({ origins: [origin] });
    if (has) return;
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) throw new Error("未授权访问该网站，已取消打开");
  }

  async function fetchReadme(owner, repo) {
    const data = await githubApi(`/repos/${owner}/${repo}/readme`);
    const text = decodeBase64Utf8(data.content);
    const name = data.name || "README.md";
    const branch = await getDefaultBranch(owner, repo);
    const srcUrl =
      data.download_url || rawGithubUrl(owner, repo, branch, name);
    return { name, path: name, srcUrl, text };
  }

  async function listMarkdownFiles(owner, repo, branch) {
    if (!branch) branch = await getDefaultBranch(owner, repo);
    const data = await githubApi(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    );
    const files = (data.tree || [])
      .filter((t) => t.type === "blob" && isMarkdownPath(t.path))
      .map((t) => ({
        path: t.path,
        name: t.path.split("/").pop(),
        srcUrl: rawGithubUrl(owner, repo, branch, t.path),
      }));
    files.sort((a, b) =>
      a.path.localeCompare(b.path, undefined, {
        sensitivity: "base",
        numeric: true,
      }),
    );
    return { branch, files, owner, repo };
  }

  // Parse user input into a fetchable remote target.
  async function resolve(input) {
    const u = parseInput(input);
    const host = u.hostname.replace(/^www\./, "");

    if (
      host !== "github.com" &&
      host !== "raw.githubusercontent.com"
    ) {
      if (!isMarkdownPath(u.pathname)) {
        throw new Error("仅支持 Markdown 直链，或 GitHub 仓库/文件链接");
      }
      // Arbitrary origin → request access on demand (kept out of install perms).
      await ensureOriginPermission(u.href);
      const name = decodeURIComponent(u.pathname.split("/").pop());
      return {
        kind: "file",
        name,
        path: name,
        srcUrl: u.href,
        github: false,
      };
    }

    const gh = parseGithub(u);
    if (!gh) throw new Error("无法识别的 GitHub 链接");

    if (gh.kind === "file") {
      return {
        kind: "file",
        name: gh.name,
        path: gh.path,
        srcUrl: gh.srcUrl,
        github: true,
        owner: gh.owner,
        repo: gh.repo,
        branch: gh.branch,
      };
    }

    if (gh.kind === "repo") {
      const readme = await fetchReadme(gh.owner, gh.repo);
      return {
        kind: "repo",
        name: readme.name,
        path: readme.path,
        srcUrl: readme.srcUrl,
        text: readme.text,
        github: true,
        owner: gh.owner,
        repo: gh.repo,
        displayName: `${gh.owner}/${gh.repo}`,
      };
    }

    if (gh.kind === "tree") {
      const { branch, files, owner, repo } = await listMarkdownFiles(
        gh.owner,
        gh.repo,
        gh.branch,
      );
      const prefix = gh.path ? gh.path.replace(/\/?$/, "/") : "";
      const scoped = prefix
        ? files.filter((f) => f.path.startsWith(prefix))
        : files;
      if (!scoped.length) throw new Error("该目录下没有 Markdown 文件");
      const first = scoped[0];
      const text = await fetchText(first.srcUrl);
      return {
        kind: "repo",
        name: first.name,
        path: first.path,
        srcUrl: first.srcUrl,
        text,
        github: true,
        owner,
        repo,
        branch,
        displayName: `${owner}/${repo}`,
      };
    }

    throw new Error("无法识别的链接");
  }

  function sortTreeNodes(nodes) {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
        numeric: true,
      });
    });
    nodes.forEach((n) => {
      if (n.children) sortTreeNodes(n.children);
    });
  }

  function buildTree(files, currentPath, currentText, memHandle, urlHandle) {
    const roots = [];
    const dirIndex = new Map();

    function ensureDir(segments) {
      let parentPath = "";
      let list = roots;
      for (const seg of segments) {
        const dirPath = parentPath ? `${parentPath}${seg}/` : `${seg}/`;
        let dir = dirIndex.get(dirPath);
        if (!dir) {
          dir = { kind: "dir", name: seg, path: dirPath, children: [] };
          dirIndex.set(dirPath, dir);
          list.push(dir);
        }
        parentPath = dirPath;
        list = dir.children;
      }
      return list;
    }

    for (const f of files) {
      const parts = f.path.split("/");
      const fileName = parts.pop();
      const list = parts.length ? ensureDir(parts) : roots;
      list.push({
        kind: "file",
        name: fileName,
        path: f.path,
        url: f.srcUrl,
        handle:
          f.path === currentPath && currentText != null
            ? memHandle(fileName, currentText)
            : urlHandle(f.srcUrl, fileName),
      });
    }

    sortTreeNodes(roots);
    return roots;
  }

  async function loadGithubSiblings(
    srcUrl,
    currentPath,
    currentText,
    memHandle,
    urlHandle,
  ) {
    const m = srcUrl.match(
      /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\//,
    );
    if (!m) throw new Error("not github");
    const [, owner, repo, branch] = m;
    const { files } = await listMarkdownFiles(owner, repo, branch);
    const nodes = buildTree(
      files,
      currentPath,
      currentText,
      memHandle,
      urlHandle,
    );
    return { owner, repo, label: `${owner}/${repo}`, nodes };
  }

  async function openInViewer(input) {
    const result = await resolve(input);
    await LMV.addRecentRemote(
      result.srcUrl,
      result.displayName || result.name,
    );

    let href =
      "viewer.html?name=" +
      encodeURIComponent(result.name) +
      "&src=" +
      encodeURIComponent(result.srcUrl);
    if (result.path && result.path !== result.name) {
      href += "&path=" + encodeURIComponent(result.path);
    }

    if (result.text != null) {
      const key = "lmv-remote-" + Date.now();
      await chrome.storage.session.set({ [key]: result.text });
      href += "&pending=" + encodeURIComponent(key);
    }

    location.href = href;
  }

  function bindUrlModal() {
    const backdrop = document.getElementById("urlModalBackdrop");
    const modal = document.getElementById("urlModal");
    const input = document.getElementById("urlModalInput");
    const clearBtn = document.getElementById("urlModalClear");
    const errorEl = document.getElementById("urlModalError");
    if (!modal || !input) return { openUrlModal() {}, closeUrlModal() {} };

    let opening = false;

    function showError(msg) {
      if (!errorEl) return;
      if (msg) {
        errorEl.textContent = msg;
        errorEl.hidden = false;
      } else {
        errorEl.textContent = "";
        errorEl.hidden = true;
      }
    }

    function openUrlModal() {
      backdrop.classList.add("open");
      modal.classList.add("open");
      input.value = "";
      input.disabled = false;
      showError("");
      input.focus();
    }

    function closeUrlModal() {
      backdrop.classList.remove("open");
      modal.classList.remove("open");
      showError("");
      opening = false;
      input.disabled = false;
    }

    async function submit() {
      if (opening) return;
      const url = input.value.trim();
      if (!url) {
        showError("请输入链接");
        return;
      }
      opening = true;
      showError("");
      input.disabled = true;
      try {
        await openInViewer(url);
      } catch (e) {
        showError(e.message || "无法打开链接");
        opening = false;
        input.disabled = false;
      }
    }

    backdrop.addEventListener("click", closeUrlModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeUrlModal();
    });
    clearBtn.addEventListener("click", () => {
      if (input.value) {
        input.value = "";
        input.focus();
        showError("");
      } else {
        closeUrlModal();
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeUrlModal();
      }
    });

    return { openUrlModal, closeUrlModal };
  }

  return {
    resolve,
    fetchText,
    loadGithubSiblings,
    openInViewer,
    bindUrlModal,
  };
})();
