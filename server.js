const express = require("express");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "25mb" }));
app.use(express.static("public"));

app.use((err, req, res, next) => {
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({
      error:
        "The pasted HTML is too large for the server. Increase the limit or paste a smaller page source.",
    });
  }
  return next(err);
});

app.post("/api/summarize", async (req, res) => {
  try {
    const url = (req.body && req.body.url) || "";
    const htmlInput = (req.body && req.body.html) || "";
    const sourceUrl = (req.body && req.body.sourceUrl) || url;
    const debug = Boolean(req.body && req.body.debug);

    if (htmlInput) {
      try {
        const summary = buildSummary(htmlInput, sourceUrl || "pasted-html");
        return res.json(summary);
      } catch (err) {
        return res.status(500).json({
          error:
            "We could not parse that box score. The page may require sign-in or have a different structure.",
          debug: debug ? buildDebug(htmlInput, err) : undefined,
        });
      }
    }

    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: "Please provide a valid URL." });
    }

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    };

    if (process.env.MAXPREPS_COOKIE) {
      headers.Cookie = process.env.MAXPREPS_COOKIE;
    }

    const html = await fetch(url, { headers }).then((r) => r.text());

    if (requiresSignIn(html)) {
      return res.status(403).json({
        error:
          "MaxPreps requires sign-in to view this box score from the server. Open the link in a browser while logged in and use the HTML paste option (coming next) or provide a session cookie so we can fetch it.",
      });
    }

    const summary = buildSummary(html, url);
    return res.json(summary);
  } catch (err) {
    return res.status(500).json({
      error:
        "We could not parse that box score. The page may require sign-in or have a different structure.",
      debug: req.body && req.body.debug ? { message: err.message } : undefined,
    });
  }
});

function buildSummary(html, url) {
  const $ = cheerio.load(html);
  const ogTitle =
    $("meta[property='og:title']").attr("content") ||
    $("title").text().trim();
  const ogDesc =
    $("meta[property='og:description']").attr("content") ||
    $("meta[name='description']").attr("content") ||
    "";

  const { teamA, teamB } = parseTeams(ogTitle);
  const { scoreA, scoreB } = parseScores(ogDesc, html);

  const topPerformers = extractTopPerformers($);

  const lines = [];
  if (teamA && teamB && scoreA != null && scoreB != null) {
    lines.push(`Final: ${teamA} ${scoreA}, ${teamB} ${scoreB}.`);
  } else if (teamA && teamB) {
    lines.push(`${teamA} vs. ${teamB}`);
  } else if (ogTitle) {
    lines.push(ogTitle);
  }

  if (ogDesc) {
    const cleaned = ogDesc.replace(/\s+/g, " ").trim();
    if (!lines[0] || !cleaned.includes(lines[0])) {
      lines.push(cleaned);
    }
  }

  if (topPerformers.length) {
    lines.push("Key performers:");
    topPerformers.forEach((p) => lines.push(`- ${p}`));
  } else if (/has not entered any/i.test(html)) {
    lines.push("Key performers: Stats not entered yet on MaxPreps.");
  }

  lines.push("\n#HighSchoolFootball #GameRecap");

  return {
    title: ogTitle,
    url,
    text: lines.join("\n"),
    extracted: {
      teamA,
      teamB,
      scoreA,
      scoreB,
      topPerformers,
    },
  };
}

function buildDebug(html, err) {
  const $ = cheerio.load(html);
  return {
    message: err && err.message ? err.message : "unknown",
    title: $("title").text().trim(),
    ogTitle: $("meta[property='og:title']").attr("content") || "",
    ogDesc: $("meta[property='og:description']").attr("content") || "",
    hasTables: $("table").length,
    headingCounts: {
      h3: $("h3").length,
      h4: $("h4").length,
      h5: $("h5").length,
    },
    signInGate: requiresSignIn(html),
  };
}

function parseTeams(title) {
  if (!title) return { teamA: "", teamB: "" };
  const core = title.split("|")[0].trim();
  const parts = core.split(" vs ");
  if (parts.length === 2) {
    return { teamA: parts[0].trim(), teamB: parts[1].trim() };
  }
  return { teamA: "", teamB: "" };
}

function parseScores(desc, html) {
  let scoreA = null;
  let scoreB = null;

  if (desc) {
    const scoreMatch = desc.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (scoreMatch) {
      scoreA = Number(scoreMatch[1]);
      scoreB = Number(scoreMatch[2]);
    }
  }

  if (scoreA == null || scoreB == null) {
    const htmlMatch = html.match(/by a score of\s+(\d+)\s*[-–]\s*(\d+)/i);
    if (htmlMatch) {
      scoreA = Number(htmlMatch[1]);
      scoreB = Number(htmlMatch[2]);
    }
  }

  return { scoreA, scoreB };
}

function requiresSignIn(html) {
  return (
    /Get Unlimited Access\s*–\s*for Free/i.test(html) ||
    /unlock this page/i.test(html) ||
    /Sign In/i.test(html)
  );
}

function extractTopPerformers($) {
  const performers = [];
  let currentTeam = "";
  let currentCategory = "";

  const nodes = $("body").find("h3, h4, h5, table");
  nodes.each((_, node) => {
    const $node = $(node);
    const tag = (node.tagName || "").toLowerCase();

    if (tag === "h3") {
      currentTeam = cleanCell($node.text()).replace(/\(.*?\)/g, "").trim();
      return;
    }

    if (tag === "h4" || tag === "h5") {
      currentCategory = cleanCell($node.text());
      return;
    }

    if (tag === "table") {
      if (!currentTeam || !currentCategory) return;

      const headers = extractHeaders($node, $);
      if (!headers.length) return;

      const rows = extractRows($node, headers, $);
      if (!rows.length) return;

      if (/passing/i.test(currentCategory)) {
        const top = pickTop(rows, "Yds");
        if (top) {
          const td = top.TD ? `, ${top.TD} TD` : "";
          performers.push(
            `${currentTeam}: ${top.Name} threw ${top.Yds} yds${td}.`
          );
        }
      }

      if (/rushing/i.test(currentCategory)) {
        const top = pickTop(rows, "Yds");
        if (top) {
          const td = top.TD ? `, ${top.TD} TD` : "";
          performers.push(
            `${currentTeam}: ${top.Name} rushed for ${top.Yds} yds${td}.`
          );
        }
      }

      if (/receiving/i.test(currentCategory)) {
        const top = pickTop(rows, "Yds");
        if (top) {
          const td = top.TD ? `, ${top.TD} TD` : "";
          performers.push(
            `${currentTeam}: ${top.Name} had ${top.Yds} rec yds${td}.`
          );
        }
      }

      if (/tackles/i.test(currentCategory)) {
        const top = pickTop(rows, "Tot Tckls") || pickTop(rows, "Tot");
        if (top) {
          const val = top["Tot Tckls"] || top.Tot || "";
          performers.push(
            `${currentTeam}: ${top.Name} led with ${val} tackles.`
          );
        }
      }
    }
  });

  return performers.slice(0, 5);
}

function nearestHeadingText($el, selector) {
  const heading = $el.prevAll(selector).first();
  const text = heading.text().replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.replace(/\(.*?\)/g, "").trim();
}

function extractHeaders($table, $) {
  const headers = [];
  const headerCells = $table.find("thead th");
  if (headerCells.length) {
    headerCells.each((_, th) => headers.push(cleanCell($(th).text())));
    return headers;
  }

  const firstRow = $table.find("tr").first();
  firstRow
    .find("th, td")
    .each((_, cell) => headers.push(cleanCell($(cell).text())));
  return headers;
}

function extractRows($table, headers, $) {
  const rows = [];
  $table.find("tbody tr").each((_, tr) => {
    const row = {};
    const cells = $(tr).find("td");
    if (!cells.length) return;

    cells.each((i, cell) => {
      const key = headers[i] || `col_${i}`;
      row[key] = cleanCell($(cell).text());
    });

    const name = row["Athlete Name"] || row["Name"] || row["Player"] || row.col_1 || "";
    if (!name || /team totals/i.test(name)) return;
    row.Name = name;
    rows.push(row);
  });
  return rows;
}

function pickTop(rows, key) {
  let best = null;
  let bestVal = -Infinity;
  rows.forEach((row) => {
    const raw = row[key] || row[key.replace(/\s+/g, " ")] || "";
    const val = toNumber(raw);
    if (val > bestVal) {
      bestVal = val;
      best = row;
    }
  });
  return best;
}

function cleanCell(text) {
  return text.replace(/\s+/g, " ").trim();
}

function toNumber(text) {
  const num = parseFloat(String(text).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

app.listen(PORT, () => {
  console.log(`sportsposter running on http://localhost:${PORT}`);
});
