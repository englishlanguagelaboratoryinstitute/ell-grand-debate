"use strict";

/* ============================================================================
 * api.js — Ell Grand Debate Voting Suite
 * PHASE 1: Core Data Wrapper
 *
 * ⚠️  CONFIG VERIFICATION REQUIRED BEFORE GOING LIVE  ⚠️
 * ----------------------------------------------------------------------------
 * The entry IDs in CONFIG.matches below were supplied as
 * "entry.XXXXXXX_sentinel". Real Google Forms input fields are always named
 * "entry.XXXXXXX" with no suffix — there is no documented "_sentinel"
 * pattern in Google Forms markup. These values are UNVERIFIED and may not
 * register submissions.
 *
 * Before the event, verify them yourself:
 *   1. Open the live public form in a browser (not the editor).
 *   2. Open DevTools → Network tab, filter for "formResponse".
 *   3. Fill out one real answer per question and submit.
 *   4. Click the formResponse request → inspect its payload. Those exact
 *      field names are the real entry IDs. Copy them into CONFIG.matches.
 *   5. Run VoteAPI.verifyConfig() in the console — it will flag any field
 *      that still contains "_sentinel".
 *
 * Until that's done, use { dryRun: true } (see submitVote below) to inspect
 * outgoing payloads without actually POSTing anything.
 * ==========================================================================*/

const VoteAPI = (() => {

  const CONFIG = {
    endpoint:
      "https://docs.google.com/forms/d/e/1FAIpQLSeyiQBjAGY6fyXZ7x2PYK3NEgI5C1lP7CM74HlpdLLxI3nyrQ/formResponse",

    hiddenFields: {
      fvv: "1",
      pageHistory: "0",
      fbzx: "-6044623654662765961",
      submissionTimestamp: "-1",
      partialResponse: '[null,null,"-6044623654662765961"]'
    },

    matches: {
      1: {
        winnerEntry: "entry.906434186_sentinel",
        winnerValues: ["TEAM 1", "TEAM 2"],
        speakerEntry: "entry.582642887_sentinel",
        speakerValues: [
          "The best speaker of TEAM 1",
          "The best speaker of TEAM 2"
        ]
      },
      2: {
        winnerEntry: "entry.2099640570_sentinel",
        winnerValues: ["TEAM 3", "TEAM 4"],
        speakerEntry: "entry.1646500844_sentinel",
        speakerValues: [
          "The best speaker of TEAM 3",
          "The best speaker of TEAM 4"
        ]
      },
      3: {
        winnerEntry: "entry.1767814271_sentinel",
        winnerValues: ["TEAM 5", "TEAM 6"],
        speakerEntry: "entry.90920490_sentinel",
        speakerValues: [
          "The best speaker of TEAM 5",
          "The best speaker of TEAM 6"
        ]
      },
      4: {
        winnerEntry: "entry.1015563530_sentinel",
        winnerValues: ["TEAM 7", "TEAM 8"],
        speakerEntry: "entry.40306143_sentinel",
        speakerValues: [
          "The best speaker of TEAM 7",
          "The best speaker of TEAM 8"
        ]
      },
      5: {
        winnerEntry: "entry.1563472660_sentinel",
        winnerValues: ["TEAM 9", "TEAM 10"],
        speakerEntry: "entry.1723104247_sentinel",
        speakerValues: [
          "The best speaker of TEAM 9",
          "The best speaker of TEAM 10"
        ]
      }
    },

    // ------------------------------------------------------------------
    // GVIZ READ-SIDE CONFIG (Phase 2 — screen.html result polling)
    // ------------------------------------------------------------------
    // ⚠️ sheetId is a PLACEHOLDER. Every Google Form has its own linked
    // response Spreadsheet with its OWN id — this is NOT the same as the
    // form's id in the formResponse URL above and cannot be derived from it.
    //
    // To get the real value:
    //   1. Open the live Form in edit mode → "Responses" tab.
    //   2. Click the green Sheets icon ("View responses in Sheets").
    //   3. The Sheet's URL looks like:
    //      https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit#gid=0
    //      Copy the <SHEET_ID> portion into gviz.sheetId below.
    //   4. Confirm the tab name matches gviz.sheetName (Forms defaults to
    //      "Form Responses 1" — rename here if you renamed the tab).
    //
    // columns assumes the form's questions are laid out in the same order
    // as CONFIG.matches above (Match1 winner, Match1 speaker, Match2
    // winner, Match2 speaker, ...) with column 0 reserved for the
    // automatic Timestamp column GViz always adds first. VERIFY this
    // against row 1 of the real Sheet before relying on it — if any
    // question was reordered in the Form editor, these indices will be
    // wrong and screen.html will silently tally the wrong column.
    gviz: {
      sheetId: "REPLACE_WITH_REAL_SHEET_ID",
      sheetName: "Form Responses 1",
      columns: {
        1: { winnerCol: 1, speakerCol: 2 },
        2: { winnerCol: 3, speakerCol: 4 },
        3: { winnerCol: 5, speakerCol: 6 },
        4: { winnerCol: 7, speakerCol: 8 },
        5: { winnerCol: 9, speakerCol: 10 }
      }
    },

    // HAZARD 1 DECISION POINT:
    // If the live Google Form has every question marked "Required", a
    // single-match submission will be missing 8 fields and may be rejected.
    // Recommended fix: open the Form editor and toggle "Required" OFF for
    // all 10 questions — leave this false.
    // Only set this true as a last resort, since it writes filler answers
    // into every unvoted match on every submission, polluting raw results
    // (screen.html's aggregation would then need to filter it back out).
    padUnvotedMatches: false
  };

  // Only consulted if padUnvotedMatches is true.
  const FALLBACK = {
    1: { winner: "TEAM 1", speaker: "The best speaker of TEAM 1" },
    2: { winner: "TEAM 3", speaker: "The best speaker of TEAM 3" },
    3: { winner: "TEAM 5", speaker: "The best speaker of TEAM 5" },
    4: { winner: "TEAM 7", speaker: "The best speaker of TEAM 7" },
    5: { winner: "TEAM 9", speaker: "The best speaker of TEAM 9" }
  };

  /**
   * Scans CONFIG for unverified entry IDs and logs a console warning.
   * Run this manually after wiring in real IDs to confirm cleanup.
   * @returns {string[]} list of problems found (empty array = clean)
   */
  function verifyConfig() {
    const problems = [];
    for (const [num, m] of Object.entries(CONFIG.matches)) {
      if (m.winnerEntry.includes("_sentinel")) {
        problems.push(`Match ${num} winnerEntry ("${m.winnerEntry}") is unverified.`);
      }
      if (m.speakerEntry.includes("_sentinel")) {
        problems.push(`Match ${num} speakerEntry ("${m.speakerEntry}") is unverified.`);
      }
    }
    if (CONFIG.gviz.sheetId === "REPLACE_WITH_REAL_SHEET_ID") {
      problems.push(
        "gviz.sheetId is still a placeholder — screen.html cannot poll live results until this is set."
      );
    }
    if (problems.length) {
      console.warn(
        "[VoteAPI] CONFIG VERIFICATION FAILED — submissions are likely to silently fail:\n" +
          problems.join("\n")
      );
    } else {
      console.log("[VoteAPI] Config looks clean — no unverified entry IDs detected.");
    }
    return problems;
  }

  function getMatchConfig(matchNumber) {
    const m = CONFIG.matches[matchNumber];
    if (!m) {
      throw new Error(`[VoteAPI] Unknown match number: ${matchNumber}. Must be 1-5.`);
    }
    return m;
  }

  /**
   * Fetches and parses the live results Sheet via the Google Visualization
   * API. GViz wraps its JSON in a non-JSON callback shell, e.g.:
   *   /*O_o*\/
   *   google.visualization.Query.setResponse({ ...real JSON... });
   * This strips that shell and returns the parsed `table` object
   * ({ cols: [...], rows: [...] }).
   *
   * Includes a cache-busting query param on every call — GViz has been
   * observed caching responses for 30-60s otherwise, which would make a
   * live projector screen look frozen after a burst of votes (Hazard 3).
   *
   * @returns {Promise<{cols: any[], rows: any[]}>}
   */
  function fetchGvizSheet() {
    const { sheetId, sheetName } = CONFIG.gviz;
    const url =
      `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq` +
      `?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&_cb=${Date.now()}`;

    return fetch(url)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`[VoteAPI] GViz HTTP ${res.status} — sheet unreachable or private.`);
        }
        return res.text();
      })
      .then((text) => {
        const match = text.match(/setResponse\(([\s\S]*)\);\s*$/);
        if (!match) {
          throw new Error("[VoteAPI] Unexpected GViz response shape — could not strip JSONP wrapper.");
        }
        const parsed = JSON.parse(match[1]);
        if (!parsed.table) {
          throw new Error("[VoteAPI] GViz response had no `table` field.");
        }
        return parsed.table;
      });
  }

  /**
   * Tallies vote counts for one match out of a parsed GViz table.
   * @param {{cols: any[], rows: any[]}} table result of fetchGvizSheet()
   * @param {number} matchNumber 1-5
   * @returns {{winner: Record<string, number>, speaker: Record<string, number>}}
   */
  function tallyMatch(table, matchNumber) {
    const colMap = CONFIG.gviz.columns[matchNumber];
    const match = getMatchConfig(matchNumber);
    if (!colMap) {
      throw new Error(`[VoteAPI] No GViz column mapping for match ${matchNumber}.`);
    }

    const winner = {};
    match.winnerValues.forEach((v) => (winner[v] = 0));
    const speaker = {};
    match.speakerValues.forEach((v) => (speaker[v] = 0));

    (table.rows || []).forEach((row) => {
      const winnerCell = row.c[colMap.winnerCol];
      const winnerVal = winnerCell && winnerCell.v;
      if (winnerVal != null && Object.prototype.hasOwnProperty.call(winner, winnerVal)) {
        winner[winnerVal]++;
      }

      const speakerCell = row.c[colMap.speakerCol];
      const speakerVal = speakerCell && speakerCell.v;
      if (speakerVal != null && Object.prototype.hasOwnProperty.call(speaker, speakerVal)) {
        speaker[speakerVal]++;
      }
    });

    return { winner, speaker };
  }

  /**
   * Builds the URLSearchParams body for a vote submission, validating that
   * the supplied values are legal for the given match. Does not send
   * anything — pure data-shaping, reusable by submitVote and by the Phase 4
   * simulation script.
   */
  function buildPayload(matchNumber, winnerValue, speakerValue) {
    const match = getMatchConfig(matchNumber);

    if (!match.winnerValues.includes(winnerValue)) {
      throw new Error(
        `[VoteAPI] "${winnerValue}" is not a valid winner value for Match ${matchNumber}. ` +
          `Expected one of: ${match.winnerValues.join(", ")}`
      );
    }
    if (!match.speakerValues.includes(speakerValue)) {
      throw new Error(
        `[VoteAPI] "${speakerValue}" is not a valid speaker value for Match ${matchNumber}. ` +
          `Expected one of: ${match.speakerValues.join(", ")}`
      );
    }

    const params = new URLSearchParams();
    params.append(match.winnerEntry, winnerValue);
    params.append(match.speakerEntry, speakerValue);

    if (CONFIG.padUnvotedMatches) {
      for (const [num, m] of Object.entries(CONFIG.matches)) {
        if (Number(num) === Number(matchNumber)) continue;
        const fb = FALLBACK[num];
        params.append(m.winnerEntry, fb.winner);
        params.append(m.speakerEntry, fb.speaker);
      }
    }

    for (const [key, value] of Object.entries(CONFIG.hiddenFields)) {
      params.append(key, value);
    }

    return params;
  }

  /**
   * Submits a vote for a given match.
   *
   * Because the live POST uses mode: 'no-cors', the browser returns an
   * opaque response no matter what actually happened server-side (200,
   * 400, and a dropped connection are all indistinguishable). This
   * function therefore does NOT branch its resolution on the fetch
   * outcome — it fires the request, logs any hard network failure to the
   * console for debugging, and resolves the caller's promise optimistically
   * after a fixed delay so the UI has something deterministic to animate
   * against. See HAZARD 4 in the project review for the full rationale.
   *
   * @param {number} matchNumber 1-5
   * @param {string} winnerValue e.g. "TEAM 1"
   * @param {string} speakerValue e.g. "The best speaker of TEAM 1"
   * @param {object} [options]
   * @param {boolean} [options.dryRun=false] If true, builds and logs the
   *   payload but never sends it. Use this until entry IDs are verified.
   * @param {number} [options.optimisticDelayMs=700] Delay before the
   *   returned promise resolves, used by vote.html to time its success
   *   animation.
   * @returns {Promise<{dryRun?: boolean, params?: URLSearchParams, optimistic?: boolean}>}
   */
  function submitVote(matchNumber, winnerValue, speakerValue, options = {}) {
    const { dryRun = false, optimisticDelayMs = 700 } = options;

    let params;
    try {
      params = buildPayload(matchNumber, winnerValue, speakerValue);
    } catch (err) {
      return Promise.reject(err);
    }

    if (dryRun) {
      console.log("[VoteAPI] DRY RUN — payload that would be sent:");
      for (const [k, v] of params.entries()) {
        console.log(`  ${k} = ${v}`);
      }
      return Promise.resolve({ dryRun: true, params });
    }

    const fetchPromise = fetch(CONFIG.endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    }).catch((err) => {
      // Genuine network-level failures (offline, DNS, blocked request)
      // land here. Opaque-response successes/400s do not — they resolve
      // fetchPromise normally with no readable status.
      console.warn(
        "[VoteAPI] Network-level fetch error — vote may not have been sent:",
        err
      );
    });

    return new Promise((resolve) => {
      fetchPromise.finally(() => {
        setTimeout(() => resolve({ optimistic: true }), optimisticDelayMs);
      });
    });
  }

  return {
    CONFIG,
    verifyConfig,
    getMatchConfig,
    buildPayload,
    submitVote,
    fetchGvizSheet,
    tallyMatch
  };
})();

/* ----------------------------------------------------------------------------
 * Quick manual test, run in browser console after loading this file:
 *
 *   VoteAPI.verifyConfig();
 *   VoteAPI.submitVote(1, "TEAM 1", "The best speaker of TEAM 1", { dryRun: true });
 *
 * The second call will print the exact outgoing payload without sending it.
 * --------------------------------------------------------------------------*/
