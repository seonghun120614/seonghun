const JUDGE0_HOST = "judge0-ce.p.rapidapi.com";

// 키를 스토리지에 저장하지 않고 메모리(JS 변수)에만 보관.
// 페이지를 벗어나거나 새로고침하면 즉시 사라짐.
let _apiKey = "";

const CM_MODE_MAP = {
  "71": "python",
  "63": "javascript",
  "62": "text/x-java",
  "54": "text/x-c++src",
  "60": "go",
  "46": "shell",
};

function getApiKey() {
  return _apiKey;
}

function showKeyModal(onSave) {
  const existing = document.getElementById("j0-key-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "j0-key-modal";
  modal.innerHTML = `
    <div class="j0-backdrop"></div>
    <div class="j0-box">
      <h3>RapidAPI Key 설정</h3>
      <p>코드를 실행하려면 Judge0 CE API 키가 필요합니다.<br>
        <a href="https://rapidapi.com/judge0-official/api/judge0-ce" target="_blank" rel="noopener">무료 키 발급받기 ↗</a>
      </p>
      <p class="j0-note">키는 이 페이지를 벗어나면 자동으로 사라집니다.</p>
      <input id="j0-key-input" type="text" placeholder="RapidAPI Key를 입력하세요" value="${_apiKey}" />
      <div class="j0-actions">
        <button id="j0-save">확인${onSave ? " 후 실행" : ""}</button>
        <button id="j0-cancel">취소</button>
        ${_apiKey ? '<button id="j0-clear">키 초기화</button>' : ""}
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector(".j0-backdrop").addEventListener("click", close);
  modal.querySelector("#j0-cancel").addEventListener("click", close);

  const clearBtn = modal.querySelector("#j0-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      _apiKey = "";
      close();
    });
  }

  modal.querySelector("#j0-save").addEventListener("click", () => {
    const key = modal.querySelector("#j0-key-input").value.trim();
    if (!key) return;
    _apiKey = key;
    close();
    if (onSave) onSave(key);
  });

  modal.querySelector("#j0-key-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") modal.querySelector("#j0-save").click();
    if (e.key === "Escape") close();
  });

  modal.querySelector("#j0-key-input").focus();
}

function initCodeRunners() {
  document.querySelectorAll(".code-runner-widget").forEach((widget) => {
    const textarea = widget.querySelector(".code-runner-source");
    const select = widget.querySelector(".code-runner-lang-select");
    const runBtn = widget.querySelector(".code-runner-run-btn");
    const keyBtn = widget.querySelector(".code-runner-key-btn");
    const result = widget.querySelector(".code-runner-result");

    let getCode = () => textarea.value;

    if (typeof CodeMirror !== "undefined") {
      try {
        const editor = CodeMirror.fromTextArea(textarea, {
          lineNumbers: true,
          theme: document.body.classList.contains("dark") ? "dracula" : "default",
          mode: CM_MODE_MAP[select.value] || "python",
          indentUnit: 4,
          tabSize: 4,
          lineWrapping: true,
        });

        getCode = () => editor.getValue();

        select.addEventListener("change", () => {
          editor.setOption("mode", CM_MODE_MAP[select.value] || "text/plain");
        });

        const observer = new MutationObserver(() => {
          editor.setOption("theme", document.body.classList.contains("dark") ? "dracula" : "default");
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
      } catch (e) {
        console.warn("CodeMirror init failed, falling back to textarea", e);
      }
    }

    keyBtn.addEventListener("click", () => showKeyModal(null));

    async function runCode(apiKey) {
      const DAILY_LIMIT = 80;
      const today = new Date().toISOString().slice(0, 10);
      const storageKey = `code_runner_${today}`;
      const usedToday = parseInt(localStorage.getItem(storageKey) || "0", 10);
      if (usedToday >= DAILY_LIMIT) {
        result.textContent = `[제한] 오늘 실행 횟수(${DAILY_LIMIT}회)를 초과했습니다. 내일 다시 시도해주세요.`;
        return;
      }

      runBtn.disabled = true;
      runBtn.textContent = "Running...";
      result.textContent = "실행 중...";

      try {
        const res = await fetch(`https://${JUDGE0_HOST}/submissions?base64_encoded=false&wait=true`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-RapidAPI-Key": apiKey,
            "X-RapidAPI-Host": JUDGE0_HOST,
          },
          body: JSON.stringify({
            source_code: getCode(),
            language_id: parseInt(select.value, 10),
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          result.textContent = `[${res.status} 오류] ${errData.message || res.statusText}\n\nRapidAPI에서 Judge0 CE API를 구독했는지 확인하세요.`;
          return;
        }

        localStorage.setItem(storageKey, usedToday + 1);

        const data = await res.json();
        const stdout = data.stdout || "";
        const stderr = data.stderr || data.compile_output || "";
        result.textContent = stdout + (stderr ? "\n[stderr]\n" + stderr : "") || `(출력 없음 — status: ${data.status?.description || "unknown"})`;
      } catch (e) {
        result.textContent = "[네트워크 오류] " + e.message;
      } finally {
        runBtn.disabled = false;
        runBtn.textContent = "▶ Run";
      }
    }

    runBtn.addEventListener("click", async () => {
      const apiKey = getApiKey();
      if (!apiKey) {
        showKeyModal((key) => runCode(key));
        return;
      }
      await runCode(apiKey);
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCodeRunners);
} else {
  initCodeRunners();
}
