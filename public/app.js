const form = document.getElementById("summary-form");
const boxUrl = document.getElementById("boxUrl");
const useHtml = document.getElementById("useHtml");
const sourceUrl = document.getElementById("sourceUrl");
const boxHtml = document.getElementById("boxHtml");
const urlFields = document.getElementById("urlFields");
const htmlFields = document.getElementById("htmlFields");
const statusEl = document.getElementById("status");
const output = document.getElementById("output");
const copyBtn = document.getElementById("copyBtn");

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Generating summary...", "loading");
  output.value = "";

  try {
    const payload = {};

    if (useHtml.checked) {
      const htmlValue = boxHtml.value.trim();
      if (!htmlValue) {
        setStatus("Please paste the box score HTML.", "error");
        return;
      }
      payload.html = htmlValue;
      payload.sourceUrl = sourceUrl.value.trim();
    } else {
      const urlValue = boxUrl.value.trim();
      if (!urlValue) {
        setStatus("Please enter a box score URL.", "error");
        return;
      }
      payload.url = urlValue;
    }

    const response = await fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      let message = data.error || "Could not summarize this game.";
      if (data.debug) {
        message += ` Debug: ${JSON.stringify(data.debug)}`;
      }
      setStatus(message, "error");
      return;
    }

    output.value = data.text || "No summary generated.";
    setStatus("Summary ready.", "success");
  } catch (err) {
    setStatus("Network error while summarizing.", "error");
  }
});

copyBtn.addEventListener("click", async () => {
  if (!output.value) return;
  try {
    await navigator.clipboard.writeText(output.value);
    setStatus("Copied to clipboard.", "success");
  } catch (err) {
    setStatus("Copy failed. You can select and copy manually.", "error");
  }
});

useHtml.addEventListener("change", () => {
  const isHtml = useHtml.checked;
  htmlFields.classList.toggle("hidden", !isHtml);
  urlFields.classList.toggle("hidden", isHtml);
  if (isHtml) {
    boxUrl.value = "";
  } else {
    boxHtml.value = "";
  }
  setStatus("", "");
});
