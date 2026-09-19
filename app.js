const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => [...root.querySelectorAll(q)];
let MODEL = null;

const esc = value => String(value ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;");

const fmt = (v, digits=3) => {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;
};

const titleCase = s => String(s || "")
  .replaceAll("_"," ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

function scoreClass(n){
  if (n === null || n === undefined) return "score-neutral";
  if (Number(n) > .05) return "score-pos";
  if (Number(n) < -.05) return "score-neg";
  return "score-neutral";
}

function effectClass(effect){
  const e = String(effect || "").toUpperCase();
  if (e.includes("BULLISH") || e.includes("RISK-ON")) return "pos";
  if (e.includes("BEARISH") || e.includes("RISK-OFF")) return "neg";
  return "neutral";
}

function classification(score, context="usd"){
  if (score === null || score === undefined) return "Unavailable";
  const n = Number(score);
  if (context === "risk") {
    if (n > .2) return "Risk-on";
    if (n < -.2) return "Risk-off";
    return "Neutral";
  }
  if (n > .30) return "USD bullish";
  if (n > .10) return "Mild USD bullish";
  if (n >= -.10) return "Neutral";
  if (n >= -.30) return "Mild USD bearish";
  return "USD bearish";
}

function formatTime(iso){
  if(!iso) return "—";
  try{return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(iso))}
  catch{return iso}
}

function qualityClass(q){
  return String(q || "").toLowerCase().replaceAll(" ","_");
}

const INFO = {
  unemployment:"US unemployment rate. MacroLens normalizes it relative to recent labour-market conditions.",
  nfp_surprise:"Nonfarm-payroll actual minus consensus forecast, measured in thousands of jobs.",
  initial_claims:"Weekly initial unemployment-insurance claims; lower claims generally indicate firmer labour conditions.",
  jolts_openings:"JOLTS job openings, a measure of labour demand.",
  jolts_quits:"JOLTS quits rate, often used as a measure of worker confidence and labour-market tightness.",
  core_cpi_saar:"Core CPI momentum annualized from recent monthly changes.",
  core_pce_saar:"Core PCE momentum annualized from recent monthly changes.",
  ppi_core:"Core Producer Price Index, used as an upstream inflation input.",
  us_2y:"Current US two-year Treasury yield.",
  us_10y:"Current US ten-year Treasury yield.",
  de_2y:"Current German two-year government yield.",
  de_10y:"Current German ten-year government yield.",
  us_de_2y_spread:"US two-year yield minus Germany two-year yield. The absolute spread is context; MacroLens also scores how it is changing.",
  us_de_2y_delta:"Recent movement in the US–Germany two-year rate spread.",
  yss:"Yield-spread structure component inside Phase 2.",
  carry:"Relative carry component inside Phase 2.",
  real_rate_tilt:"Real-rate tilt component inside Phase 2.",
  mrs:"Macro-regime score inside Phase 2.",
  cot_z:"Normalized CFTC positioning signal.",
  retail_skew:"Contrarian retail-positioning signal from Myfxbook.",
  etf_z:"Experimental ETF-flow signal. Optional in V1.",
  hf_tilt:"Hedge-fund / CTA positioning tilt.",
  vix_z:"Normalized VIX volatility signal.",
  pcr_z:"Normalized put/call ratio signal.",
  aaii_z:"Normalized AAII sentiment signal.",
  fgi_norm:"Fear & Greed Index normalized to the model scale."
};

function fallbackTechnical(card){
  return (card.contributors || []).map(c => ({
    name: titleCase(c.name),
    display: c.value === null || c.value === undefined ? "Unavailable" : formatRaw(c.name, c.value),
    info: INFO[c.name] || "Underlying observation used by the MacroLens analysis engine."
  }));
}

function formatRaw(name, value){
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  if (name === "unemployment" || name === "jolts_quits" || name.includes("yield")) return `${n.toFixed(2)}%`;
  if (name === "nfp_surprise") return `${n > 0 ? "+" : ""}${n.toFixed(0)}k vs consensus`;
  if (name === "initial_claims") return `${Math.round(n/1000)}k`;
  if (name === "jolts_openings") return `${(n/1000).toFixed(3)}m`;
  if (name.includes("spread")) return `${n.toFixed(2)} pp`;
  return `${n > 0 ? "+" : ""}${n.toFixed(3)}`;
}

function legacyDrivers(card){
  const vals = (card.contributors || []).filter(c => c.value !== null && c.value !== undefined);
  if (!vals.length) return [];
  const max = Math.max(...vals.map(c => Math.abs(Number(c.value)||0)),1);
  return vals.map(c => {
    const raw = Number(c.value) || 0;
    const pseudo = Math.max(-1, Math.min(1, raw / max));
    return {
      name:titleCase(c.name),
      impact:pseudo,
      signal:pseudo,
      effect:pseudo > .05 ? "USD BULLISH" : pseudo < -.05 ? "USD BEARISH" : "NEUTRAL",
      raw_display:formatRaw(c.name,c.value),
      info:INFO[c.name] || "Underlying observation used by the MacroLens engine.",
      detail:"Legacy display fallback. Run the V1.1 explainable engine to populate true model-impact values."
    };
  });
}

function positioningFallbackDrivers(card){
  const values = Object.fromEntries((card.contributors || []).map(c => [c.name, c.value]));
  const specs = [
    {key:"cot_z", name:"CFTC positioning", weight:0.4, signal:v=>Math.max(-1,Math.min(1,Number(v)/2)), info:INFO.cot_z},
    {key:"retail_skew", name:"Retail positioning", weight:0.2, signal:v=>Math.max(-1,Math.min(1,Number(v))), info:INFO.retail_skew},
    {key:"hf_tilt", name:"HF / CTA positioning", weight:0.2, signal:v=>Math.max(-1,Math.min(1,Number(v))), info:INFO.hf_tilt}
  ].filter(s => values[s.key] !== null && values[s.key] !== undefined && !Number.isNaN(Number(values[s.key])));
  const totalWeight = specs.reduce((sum,s)=>sum+s.weight,0) || 1;
  return specs.map(s => {
    const raw = Number(values[s.key]);
    const sig = s.signal(raw);
    const impact = (s.weight / totalWeight) * sig;
    return {
      name:s.name,
      impact,
      signal:sig,
      effect:impact > .05 ? "USD BULLISH" : impact < -.05 ? "USD BEARISH" : "NEUTRAL",
      raw_display:fmt(raw),
      info:s.info,
      detail:`Renormalized positioning weight ${(s.weight/totalWeight*100).toFixed(0)}% × normalized signal ${fmt(sig,2)}.`
    };
  }).sort((a,b)=>Math.abs(b.impact)-Math.abs(a.impact));
}

function pesFallbackDrivers(card){
  const score = Number(card.score);
  if (Number.isNaN(score)) return [];
  const text = String(card.why || card.summary || "");
  const tone = /hawkish/i.test(text) ? "HAWKISH" : /dovish/i.test(text) ? "DOVISH" : /neutral/i.test(text) ? "NEUTRAL" : null;
  const fedImpact = tone === "HAWKISH" ? 0.20 : tone === "DOVISH" ? -0.20 : tone === "NEUTRAL" ? 0 : null;
  const futuresImpact = fedImpact === null ? score : score - fedImpact;
  const cutsMatch = text.match(/([+-]?\d+(?:\.\d+)?)\s+cuts priced/i);
  let futuresDisplay = "Fed funds futures contribution";
  if (cutsMatch){
    const cuts = Number(cutsMatch[1]);
    if (cuts < -0.05) futuresDisplay = `≈${Math.abs(cuts).toFixed(1)} ${Math.abs(cuts)<1.05?"hike":"hikes"} priced`;
    else if (cuts > 0.05) futuresDisplay = `≈${Math.abs(cuts).toFixed(1)} ${Math.abs(cuts)<1.05?"cut":"cuts"} priced`;
    else futuresDisplay = "Policy path near the current rate";
  }
  const rows = [{
    name:"Fed funds futures",
    impact:futuresImpact, signal:futuresImpact,
    effect:futuresImpact > .05 ? "USD BULLISH" : futuresImpact < -.05 ? "USD BEARISH" : "NEUTRAL",
    raw_display:futuresDisplay,
    info:"The futures-implied policy path is standardized relative to its recent history. Fewer cuts or implied hikes are USD-supportive in the current PES methodology."
  }];
  if (fedImpact !== null){
    rows.push({
      name:"Fed communication stance",
      impact:fedImpact, signal:fedImpact,
      effect:fedImpact > .05 ? "USD BULLISH" : fedImpact < -.05 ? "USD BEARISH" : "NEUTRAL",
      raw_display:titleCase(tone),
      info:"Current Federal Reserve communication stance. Hawkish adds +0.20, dovish subtracts 0.20 and neutral adds zero in the current PES methodology."
    });
  }
  return rows.sort((a,b)=>Math.abs(b.impact)-Math.abs(a.impact));
}

function explanationForCard(card){
  const suppliedDrivers = Array.isArray(card.drivers) && card.drivers.length
    ? card.drivers
    : (Array.isArray(card.explanation?.drivers) && card.explanation.drivers.length ? card.explanation.drivers : null);
  const fallbackDrivers = card.key === "positioning"
    ? positioningFallbackDrivers(card)
    : card.key === "pes"
      ? pesFallbackDrivers(card)
      : legacyDrivers(card);
  const drivers = (suppliedDrivers || fallbackDrivers)
    .filter(d => !d.experimental && !String(d.name || "").toLowerCase().includes("etf"));

  const policyDisplay = (d) => {
    if (card.key !== "pes" || d.name !== "Fed funds futures") return d.raw_display;
    const match = String(d.raw_display || "").match(/^([+-]?\d+(?:\.\d+)?)\s+cuts priced$/i);
    if (!match) return d.raw_display;
    const value = Number(match[1]);
    if (value < -0.05) return `≈${Math.abs(value).toFixed(1)} ${Math.abs(value)<1.05?"hike":"hikes"} priced`;
    if (value > 0.05) return `≈${Math.abs(value).toFixed(1)} ${Math.abs(value)<1.05?"cut":"cuts"} priced`;
    return "Policy path near the current rate";
  };

  const inputGuide = drivers.map(d => ({
    name: d.name === "Fedspeak tone" ? "Fed communication stance" : d.name,
    value: policyDisplay(d),
    display: d.name === "Fedspeak tone"
      ? "Current Federal Reserve communication stance. In the present methodology, a hawkish stance adds +0.20, a dovish stance subtracts 0.20 and a neutral stance adds zero."
      : (d.info || "Underlying input used by the MacroLens analysis engine.")
  }));

  return {
    summary: card.summary || card.explanation?.summary || card.why || "No interpretation available.",
    drivers: drivers.map(d => d.name === "Fedspeak tone" ? {...d, name:"Fed communication stance"} : d),
    technical_data: inputGuide,
    notes: []
  };
}


const UNDERLYING_GUIDE = {
  phase1_mbs: {
    name:"First Underlying Dynamic",
    description:"Macro fundamentals. It combines LHI, IMS, RDS and PES to convert labour-market, inflation, relative-rate and Federal Reserve policy data into a structured view of the US macro environment and its implications for the dollar."
  },
  phase2_scenario: {
    name:"Second Underlying Dynamic",
    description:"Scenario and yield analysis. It tests whether yield spreads, carry, real-rate differentials and broader market conditions confirm or challenge the fundamental view, then updates the weighting of alternative macro scenarios."
  },
  crowding_dampener: {
    name:"Third Underlying Dynamic",
    description:"Positioning and market context. It measures how institutional, retail and hedge-fund positioning is skewed around the USD and uses crowding as a conviction overlay. Risk sentiment is displayed separately as supporting market context, while the crowding overlay is driven by USD positioning."
  }
};

function sanitizeDynamicLanguage(text){
  return String(text || "")
    .replaceAll("Phase 1 Macro","First Underlying Dynamic")
    .replaceAll("Phase 2 Scenario","Second Underlying Dynamic")
    .replaceAll("Crowding overlay","Third Underlying Dynamic")
    .replaceAll("Phase 1","First Underlying Dynamic")
    .replaceAll("Phase 2","Second Underlying Dynamic");
}

function finalExplanation(fb){
  const contributions = fb.contributions || {};
  const inputs = fb.inputs || {};
  const rows = [
    ["phase1_mbs", inputs.phase1_mbs, contributions.phase1_mbs],
    ["phase2_scenario", inputs.phase2_scenario, contributions.phase2_scenario],
    ["crowding_dampener", inputs.crowding, contributions.crowding_dampener]
  ];

  const drivers = rows.map(([key, rawScore, contribution]) => {
    const guide = UNDERLYING_GUIDE[key];
    return {
      name: guide.name,
      impact: contribution,
      signal: rawScore,
      effect: Number(contribution) > 0 ? "USD BULLISH" : Number(contribution) < 0 ? "USD BEARISH" : "NEUTRAL",
      info: guide.description
    };
  });

  const sourceSummary = fb.explanation?.summary ||
    `The weighted model produces a final USD bias of ${fmt(fb.score)} (${fb.label || titleCase(fb.direction)}).`;

  return {
    summary: sanitizeDynamicLanguage(sourceSummary),
    drivers,
    technical_data: rows.map(([key]) => ({
      name: UNDERLYING_GUIDE[key].name,
      display: UNDERLYING_GUIDE[key].description
    }))
  };
}

function overallDataState(data){
  const missing = (data.source_status || []).filter(s => String(s.status).toUpperCase() === "MISSING");
  if(missing.length) return {label:"PARTIAL DATA",className:"partial"};
  return {label:"LIVE DATA",className:"live"};
}

function renderOverview(data){
  const fb = data.final_bias || {};
  const ex = finalExplanation(fb);
  const state = overallDataState(data);

  $("#header-status-text").textContent = state.label;
  $("#header-status").classList.toggle("partial", state.className === "partial");
  if ($("#data-state")) $("#data-state").textContent = state.label;
  if ($("#generated-at")) $("#generated-at").textContent = formatTime(data.status?.generated_at);
  $("#footer-generated").textContent = `Latest model update: ${formatTime(data.status?.generated_at)}`;
  $("#freshness-note").textContent = `Generated ${formatTime(data.status?.generated_at)}`;
  if ($("#model-version")) $("#model-version").textContent = data.project?.version || "—";

  if ($("#final-label")) $("#final-label").textContent = fb.label || titleCase(fb.direction || "—");
  $("#final-direction").textContent = fb.label || titleCase(fb.direction || "—");
  const regimeSummary = $("#final-regime-summary");
  if (regimeSummary) {
    const score = Number(fb.score || 0);
    if (score > .30) regimeSummary.textContent = "The model sees a clear mix of forces favouring a stronger US dollar.";
    else if (score > .10) regimeSummary.textContent = "The model shows a modest USD-supportive tilt, but the signal is not yet strongly directional.";
    else if (score >= -.10) regimeSummary.textContent = "The model sees a balanced mix of forces, with no clear directional edge for the USD.";
    else if (score >= -.30) regimeSummary.textContent = "The model shows a modest bearish tilt, with negative forces slightly outweighing USD support.";
    else regimeSummary.textContent = "The model sees a clear mix of forces weighing against the US dollar.";
  }
  $("#final-score").textContent = fmt(fb.score);
  $("#final-score").className = scoreClass(fb.score);
  $("#confidence-text").textContent = `${titleCase(fb.confidence || "—")} confidence`;
  if ($("#confidence-badge")) $("#confidence-badge").textContent = `${titleCase(fb.confidence || "—")} confidence`;
  $("#p1-score").textContent = fmt(fb.inputs?.phase1_mbs);
  $("#p2-score").textContent = fmt(fb.inputs?.phase2_scenario);
  $("#crowding-score").textContent = fmt(fb.inputs?.crowding);
  if ($("#formula")) $("#formula").textContent = fb.formula || "—";
  $("#outlook-title").textContent = `${fb.label || titleCase(fb.direction || "—")} USD Outlook`;
  
  const outlookCards = (data.cards || []).filter(c =>
    ["lhi","ims","rds","pes","phase2","positioning"].includes(c.key) &&
    c.score !== null && c.score !== undefined
  );
  const strongestPositive = [...outlookCards]
    .filter(c => Number(c.score) > 0.10)
    .sort((a,b)=>Number(b.score)-Number(a.score))[0];
  const strongestNegative = [...outlookCards]
    .filter(c => Number(c.score) < -0.10)
    .sort((a,b)=>Number(a.score)-Number(b.score))[0];
  let outlookText = "The model is currently receiving a balanced mix of macro, scenario and positioning signals.";
  if (strongestPositive && strongestNegative) {
    outlookText = `Signals are mixed. ${strongestPositive.title} is the strongest USD-supportive component, while ${strongestNegative.title} is the strongest drag. No single side currently dominates the combined outlook.`;
  } else if (strongestPositive) {
    outlookText = `${strongestPositive.title} is currently leading the USD-supportive side of the model, with fewer offsetting bearish components.`;
  } else if (strongestNegative) {
    outlookText = `${strongestNegative.title} is currently the strongest drag on the dollar, while the remaining components provide only limited offset.`;
  }
  $("#outlook-summary").textContent = outlookText;


  const badge = $("#bias-badge");
  badge.classList.remove("neg","neutral");
  const n = Number(fb.score || 0);
  if(n < -.10) badge.classList.add("neg");
  else if(n <= .10) badge.classList.add("neutral");
  $("#bias-arrow").textContent = n > .10 ? "↗" : n < -.10 ? "↘" : "↔";

  const pos = Math.max(0,Math.min(100,((Number(fb.score || 0)+1)/2)*100));
  $("#bias-marker").style.left = `${pos}%`;

  
  const byKey = Object.fromEntries((data.cards || []).map(c => [c.key, c]));
  const setHeroSignal = (key, scoreId, labelId) => {
    const c = byKey[key] || {};
    const s = $(scoreId);
    const l = $(labelId);
    if (s) {
      s.textContent = fmt(c.score, 2);
      s.className = scoreClass(c.score);
    }
    if (l) l.textContent = classification(c.score, "usd");
  };
  setHeroSignal("lhi", "#hero-lhi", "#hero-lhi-label");
  setHeroSignal("ims", "#hero-ims", "#hero-ims-label");
  setHeroSignal("rds", "#hero-rds", "#hero-rds-label");
  setHeroSignal("pes", "#hero-pes", "#hero-pes-label");
  $("#hero-final-score").textContent = fmt(fb.score, 2);
  $("#hero-final-score").className = scoreClass(fb.score);
  $("#hero-final-label").textContent = fb.label || titleCase(fb.direction || "—");


  const coreKeys = ["lhi","ims","rds","pes","phase2","positioning"];
  const top = (data.cards || [])
    .filter(c=>coreKeys.includes(c.key) && c.score !== null && c.score !== undefined)
    .sort((a,b)=>Math.abs(Number(b.score))-Math.abs(Number(a.score)))
    .slice(0,4);

  $("#primary-driver-list").innerHTML = top.map((c,i)=>`
    <div class="primary-driver-row">
      <span class="driver-num">${i+1}</span>
      <div><strong>${esc(c.key==="phase2" ? "Second Underlying Dynamic" : c.title)}</strong><small>${esc((c.summary || c.why || c.subtitle || "").split(".")[0])}</small></div>
      <span class="driver-score ${scoreClass(c.score)}">${fmt(c.score,2)}</span>
    </div>`).join("");

  const s = data.scenario_probabilities || {};
  const rows = [["Base",s.base],["Hawkish USD",s.hawkish_usd],["Dovish / Risk-On",s.dovish_risk_on]];
  $("#scenario-list").innerHTML = rows.map(([name,v])=>`
    <div class="scenario-row"><span>${esc(name)}</span><div class="scenario-bar"><i style="width:${v==null?0:Math.max(0,Math.min(100,v*100))}%"></i></div><b>${v==null?"—":(v*100).toFixed(1)+"%"}</b></div>
  `).join("");
}

function renderSignals(data){
  const cards = (data.cards || []).filter(c=>c.key !== "crowding");
  $("#signal-grid").innerHTML = cards.map(card=>{
    const ex = explanationForCard(card);
    const context = card.key === "sentiment" ? "risk" : "usd";
    return `
      <article class="signal-card">
        <div class="signal-top">
          <div><div class="signal-code">${esc(card.key==="phase2" ? "Second Underlying Dynamic" : card.title)}</div><div class="signal-subtitle">${esc(card.subtitle || "")}</div></div>
          <span class="quality ${String(card.data_quality || "").toUpperCase()==="MISSING"?"missing":""}">${String(card.data_quality || "").toUpperCase()==="MISSING"?"MISSING":"LIVE DATA"}</span>
        </div>
        <div class="signal-score ${scoreClass(card.score)}">${fmt(card.score)}</div>
        <div class="signal-classification ${scoreClass(card.score)}">${esc(classification(card.score,context))}</div>
        <p class="signal-summary">${esc(ex.summary)}</p>
        <button class="signal-why" type="button" data-modal-key="${esc(card.key)}"><span class="why-icon">?</span><span>Why this result?</span><span>→</span></button>
      </article>`;
  }).join("");

  const candidateReasons = cards
    .filter(c=>["lhi","ims","rds","pes","phase2","positioning"].includes(c.key))
    .sort((a,b)=>Math.abs(Number(b.score||0))-Math.abs(Number(a.score||0)))
    .slice(0,5)
    .map(c=>sanitizeDynamicLanguage(explanationForCard(c).summary.split(/(?<=[.!?])\s/)[0]));

  $("#reason-list").innerHTML = candidateReasons.map(r=>`<li>${esc(r)}</li>`).join("");
}

function renderSources(data){
  $("#source-grid").innerHTML = (data.source_status || []).map(s=>{
    const st=String(s.status || "").toUpperCase();
    const missing = st==="MISSING";
    const sourceCopy = {
      "FRED":"Economic and interest-rate data",
      "CFTC":"Institutional and hedge-fund positioning data",
      "Yahoo Finance":"Market and volatility inputs",
      "Myfxbook":"Authenticated retail positioning data",
      "NFP Surprise":"Latest payroll result relative to the market consensus forecast",
      "Fedspeak":"Current Federal Reserve communication stance",
      "AAII":"Latest AAII investor sentiment survey readings"
    };
    let note = sourceCopy[s.source] || s.note || "";
    note = note.replace(/;?\s*ETF flows remain experimental\.?/gi,"").replace(/ETF[^.]*experimental\.?/gi,"").trim();
    return `<article class="source-card"><div class="source-head"><strong>${esc(s.source)}</strong><span class="source-state ${missing?"missing":"live"}">${missing?"MISSING":"LIVE DATA"}</span></div><p>${esc(note)}</p></article>`;
  }).join("");
}

function infoDot(info){
  return "";
}

function driverHTML(drivers){
  if(!drivers || !drivers.length) return `<div class="modal-note">No component-level driver impacts are available for this score.</div>`;

  return drivers.map((d,i)=>{
    const impact = Number(d.impact) || 0;
    const width = Math.min(50, Math.abs(impact) * 50);
    const cls = impact > 0 ? "pos" : impact < 0 ? "neg" : "neutral";

    return `
      <div class="modal-driver">
        <div>
          <div class="driver-title">
            <span class="driver-rank">${i+1}</span>
            <strong>${esc(d.name)}</strong>
          </div>
          <div class="driver-meta">
            <span class="effect-pill ${effectClass(d.effect)}">${esc(d.effect || "NEUTRAL")}</span>
          </div>
          ${d.current_display ? `<span class="driver-current"><b>${esc(d.current_display)}</b></span>` : ""}
        </div>
        <div class="impact-wrap">
          <div class="impact-bar"><i class="${cls}" style="width:${width}%"></i></div>
          <span class="impact-value ${scoreClass(impact)}">${fmt(impact)}</span>
        </div>
      </div>`;
  }).join("");
}

function technicalHTML(rows){
  if(!rows || !rows.length) return `<div class="modal-note">No additional input definitions are exposed for this score.</div>`;
  return rows.map(r=>`
    <div class="tech-row">
      <div class="tech-name">
        <span>${esc(r.name)}</span>
        ${r.value ? `<span class="input-value">${esc(r.value)}</span>` : ""}
      </div>
      <strong>${esc(r.display ?? "—")}</strong>
    </div>`).join("");
}

function openModal(key){
  if(!MODEL) return;
  const modal=$("#explain-modal");
  let title, subtitle, score, quality, ex, context="usd";

  if(key==="final"){
    const fb=MODEL.final_bias || {};
    title="Final USD Bias";
    subtitle=fb.label || titleCase(fb.direction || "—");
    score=fb.score;
    quality=fb.confidence ? `${titleCase(fb.confidence)} confidence` : "Model output";
    ex=finalExplanation(fb);
  } else {
    const card=(MODEL.cards || []).find(c=>c.key===key);
    if(!card) return;
    title=`${card.key==="phase2" ? "Second Underlying Dynamic" : card.title} — ${card.subtitle || ""}`;
    subtitle=classification(card.score,card.key==="sentiment"?"risk":"usd");
    score=card.score;
    quality=String(card.data_quality || "").toUpperCase()==="MISSING" ? "MISSING" : "LIVE DATA";
    ex=explanationForCard(card);
    context=card.key==="sentiment"?"risk":"usd";
  }

  $("#modal-title").textContent=title;
  if(key==="final"){
    $("#modal-left-subtitle").textContent="Weighted impact on the final score";
    $("#modal-right-title").textContent="UNDERLYING DYNAMICS";
    $("#modal-right-subtitle").textContent="How the three layers work";
  } else {
    $("#modal-left-subtitle").textContent="Ranked by model impact";
    $("#modal-right-title").textContent="INPUT GUIDE";
    $("#modal-right-subtitle").textContent="What the model is measuring";
  }
  $("#modal-score").textContent=fmt(score);
  $("#modal-score").className=scoreClass(score);
  $("#modal-effect").textContent=subtitle;
  $("#modal-effect").className=`effect-chip ${effectClass(subtitle)}`;
  $("#modal-quality").textContent=quality;
  $("#modal-summary").textContent=ex.summary || "No explanation available.";
  $("#modal-drivers").innerHTML=driverHTML(ex.drivers || []);
  $("#modal-technical").innerHTML=technicalHTML(ex.technical_data || []);
  $("#modal-notes").innerHTML=(ex.notes || []).map(n=>`<div class="modal-note">${esc(n)}</div>`).join("");
  modal.hidden=false;
  document.body.classList.add("modal-open");
  $("#modal-close").focus();
}

function closeModal(){
  $("#explain-modal").hidden=true;
  document.body.classList.remove("modal-open");
}

function bindModalEvents(){
  document.addEventListener("click",e=>{
    const trigger=e.target.closest("[data-modal-key]");
    if(trigger){openModal(trigger.dataset.modalKey);return}
    if(e.target.id==="modal-close"){closeModal();return}
    if(e.target.id==="explain-modal"){closeModal()}
  });
  document.addEventListener("keydown",e=>{if(e.key==="Escape" && !$("#explain-modal").hidden) closeModal()});
}

function enableActiveNav(){
  const links = $$(".nav a");
  const sections = links.map(a => $(a.getAttribute("href"))).filter(Boolean);

  const update = () => {
    const marker = window.scrollY + 150;
    let active = sections[0];

    for (const section of sections) {
      if (section.offsetTop <= marker) active = section;
    }

    const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
    if (nearBottom && sections.length) active = sections[sections.length - 1];

    links.forEach(a => a.classList.toggle("active", a.getAttribute("href") === `#${active.id}`));
  };

  window.addEventListener("scroll", update, {passive:true});
  window.addEventListener("resize", update);
  links.forEach(a => a.addEventListener("click", () => {
    links.forEach(x => x.classList.toggle("active", x === a));
  }));
  update();
}

async function boot(){
  try{
    const res=await fetch("./data/macrolens_output.json",{cache:"no-store"});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    MODEL=await res.json();
    renderOverview(MODEL);
    renderSignals(MODEL);
    renderSources(MODEL);
  }catch(err){
    $("#header-status-text").textContent="DATA ERROR";
    $("#header-status").classList.add("partial");
    $("#freshness-note").textContent="Could not load data/macrolens_output.json";
    console.error(err);
  }
}

bindModalEvents();
enableActiveNav();
boot();
