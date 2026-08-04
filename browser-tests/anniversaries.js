import { ANNIVERSARY_CATEGORIES, ANNIVERSARY_SCORE_WEIGHTS } from "../src/config/anniversary-config.js";
import { mockProviderPayload } from "../src/data/mock-provider.js";
import { mockStatsProviderPayload } from "../src/data/mock-stats-provider.js";
import { createAnniversaryService, parseAnniversaryQuery, resolveAnniversaryDate } from "../src/services/anniversary-service.js";
import { createEntityRegistry } from "../src/services/entity-registry-service.js";
import { createHistoricalExplorerService } from "../src/services/historical-service.js";
import { createSportsRepository } from "../src/services/sports-repository.js";
import { createStatsRepository } from "../src/services/stats-provider.js";

const checks=[];const failures=[];const check=(condition,label)=>{checks.push(label);if(!condition)failures.push(label);};
const wait=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const appFrame=document.querySelector("#app");
appFrame.contentWindow.addEventListener("error",(event)=>window.testErrors.push(`app: ${event.message}`));
appFrame.contentWindow.addEventListener("unhandledrejection",(event)=>window.testErrors.push(`app: ${String(event.reason)}`));
const sportsRepository=createSportsRepository(mockProviderPayload);
const statsRepository=createStatsRepository(mockStatsProviderPayload,{generatedAt:"2026-08-03T12:00:00.000Z"});
const entityRegistry=createEntityRegistry();
const historicalService=createHistoricalExplorerService({sportsRepository,statsRepository,entityRegistry});
const service=createAnniversaryService({historicalService,sportsRepository,statsRepository,entityRegistry,clock:()=>new Date(2026,7,3,12)});

check(ANNIVERSARY_CATEGORIES.length===21,"1 normalized category registry contains all supported categories");
check(!Object.keys(ANNIVERSARY_SCORE_WEIGHTS).some((key)=>/bet|confidence|probability/i.test(key)),"2 anniversary scoring excludes betting confidence and probability");
check(resolveAnniversaryDate("2028-02-29")?.iso==="2028-02-29","3 valid leap day resolves deterministically");
check(resolveAnniversaryDate("2026-02-29")===null,"4 invalid non-leap day fails safely");
check(parseAnniversaryQuery("what happened yesterday",{today:"2026-08-03"}).date==="2026-08-02","5 yesterday uses local calendar math");
check(parseAnniversaryQuery("what happened tomorrow",{today:"2026-08-03"}).date==="2026-08-04","6 tomorrow uses local calendar math");
check(parseAnniversaryQuery("anniversaries in 2025",{today:"2026-08-03"}).originalYear===2025,"7 original-year filter is structured");
check(parseAnniversaryQuery("race anniversaries",{today:"2026-08-03"}).category==="Race","8 sport-aware category parsing is deterministic");

const all=service.getAnniversaries({date:"2026-08-03",limit:50});
check(all.total===10,"9 ten supported sport fixtures render for the selected date");
check(new Set(all.items.map((item)=>item.sportId)).size>=9,"10 fixtures span broad sport coverage");
check(all.items.some((item)=>item.leagueId==="olympic-basketball"),"11 Olympic event coverage is represented");
check(all.items.every((item)=>item.type==="historical_anniversary"&&item.schemaVersion===1),"12 every anniversary uses one normalized model");
check(all.items.every((item)=>item.originalYear===2025&&item.yearsAgo===1),"13 year and years-ago derive from evidence dates");
check(all.items.every((item)=>item.supportingEvidence.length&&item.sources.length),"14 every card has evidence and source attribution");
check(all.items.every((item)=>item.coverage&&item.coverageLabel&&item.validationStatus),"15 every card exposes coverage and validation");
check(all.items.every((item)=>item.edgeTrust&&item.researchQuality?.isProbability===false),"16 Edge Trust applies and Research Quality is not probability");
check(all.items.every((item)=>item.sample&&/(sample|illustrative)/i.test(item.summary)),"17 sample fixtures are explicitly disclosed");
check(all.items.every((item)=>item.story.claimSource==="structured_historical_item"),"18 structured historical claim remains the factual source");
check(all.items.every((item)=>Number.isFinite(item.score)),"19 deterministic score is finite");
check(all.items.map((item)=>item.id).join("|")===service.getAnniversaries({date:"2026-08-03",limit:50}).items.map((item)=>item.id).join("|"),"20 ranking and cache output are stable");

const wnba=service.getAnniversaries({date:"2026-08-03",leagueId:"wnba",limit:50});
check(wnba.total===1&&wnba.items.every((item)=>item.leagueId==="wnba"),"21 WNBA scope never falls back to unrelated leagues");
check(service.getAnniversaries({date:"2026-08-03",leagueId:"ufc",limit:50}).items.every((item)=>item.sportId==="mma"),"22 UFC excludes Boxing");
check(service.getAnniversaries({date:"2026-08-03",leagueId:"f1",limit:50}).items.every((item)=>item.leagueId==="f1"),"23 Formula 1 excludes NASCAR");
check(service.getAnniversaries({date:"2026-08-03",sportId:"soccer",limit:50}).items.every((item)=>item.sportId==="soccer"),"24 sport selection isolates soccer");
check(service.getAnniversaries({date:"2026-08-04",limit:50}).items.length===0,"25 empty date returns honest empty state without fallback");
check(service.getAnniversaries({date:"invalid",limit:50}).warnings[0].includes("valid"),"26 invalid date returns defensive warning");
check(service.getAnniversaries({date:"2026-08-03",year:2024,limit:50}).items.length===0,"27 unavailable original year does not substitute another year");
check(service.getAnniversaries({date:"2026-08-03",category:"Fight",limit:50}).items.every((item)=>item.category==="Fight"),"28 category filter is exact");

const first=all.items[0];
check(service.getAnniversary(first.id)?.id===first.id,"29 stable detail ID resolves");
check(service.getAnniversary("missing")===null,"30 invalid detail ID fails safely");
check(first.timeline.event.eventId===first.eventId&&first.timeline.accessibleSummary.includes(first.title),"31 timeline uses canonical evidence and has text summary");
check(first.currentConnections.currentMarkets.length===0,"32 Stats mode does not attach betting markets");
check(first.currentConnections.marketsMessage.includes("No compatible"),"33 unavailable market state is explicit");
check(service.getResearchPaths(first).length===8,"34 guided research paths are deterministic");
const share=service.shareSnapshot(first);
check(share.type==="historical_anniversary_share"&&share.source&&share.coverage&&share.researchQuality,"35 share snapshot preserves source coverage and quality");
check(!JSON.stringify(share).includes("private"),"36 share snapshot contains no private notes");
check(service.searchAnniversaries("on this day",{date:"2026-08-03",limit:50}).items.length===10,"37 anniversary search finds current-date history");
check(service.searchAnniversaries("Formula 1",{date:"2026-08-03",limit:50}).items.every((item)=>item.leagueId==="f1"),"38 text search remains evidence-linked");

const controller=new AbortController();controller.abort();
try{await service.getAnniversariesAsync({date:"2026-08-03"},{signal:controller.signal});check(false,"39 aborted async request cannot render");}catch(error){check(error.name==="AbortError","39 aborted async request cannot render");}
service.invalidateHistoricalItem(first.historicalItemId);
check(service.getAnniversaries({date:"2026-08-03",limit:50}).total===10,"40 targeted invalidation safely rebuilds the date");

const frame=appFrame;
await new Promise((resolve)=>frame.addEventListener("load",resolve,{once:true}));await wait(500);
const doc=frame.contentDocument;const win=frame.contentWindow;
check(doc.body.classList.contains("history-active"),"41 anniversary route restores after refresh");
check(doc.querySelector("#historicalExplorerTitle")?.textContent==="On This Day","42 explorer heading identifies On This Day");
check(doc.querySelectorAll(".anniversary-card").length===10,"43 UI renders exact filtered count");
check(doc.querySelector("[data-anniversary-filters] input[type=date]")?.value==="2026-08-03","44 semantic date control restores route state");
check(doc.querySelectorAll("[data-anniversary-offset]").length===2,"45 yesterday and tomorrow controls are buttons");
check(doc.querySelectorAll(".anniversary-card .sample-badge").length===10,"46 every visible card is sample-labeled");
check([...doc.querySelectorAll(".anniversary-card")].every((card)=>card.querySelector("h3 a[data-history-route]")),"47 every card links to a canonical detail route");
check(doc.querySelectorAll(".anniversary-card [data-share-anniversary]").length===10,"48 every card has a share action");

doc.querySelector(".anniversary-card a[data-history-route]").click();await wait(300);
check(doc.querySelector(".anniversary-detail"),"49 detail route renders without replacing the application");
check(doc.querySelector("#anniversaryTimeline"),"50 detail includes accessible before-event-after timeline");
check(doc.querySelector(".anniversary-detail .stats-table caption")?.textContent.includes("Supporting historical evidence"),"51 supporting data action exposes source evidence");
check(doc.querySelector("#currentConnectionsTitle"),"52 current connections remain visibly separate");
check(doc.querySelectorAll("[data-anniversary-query]").length===8,"53 detail exposes deterministic research paths");
check(!doc.querySelector("#historicalExplorer").textContent.includes("win probability"),"54 anniversary view does not represent quality as win probability");
win.history.back();await wait(300);
check(doc.querySelector("#historicalExplorerTitle")?.textContent==="On This Day","55 browser back restores anniversary list");

doc.querySelector('[data-theme-option="light"]').click();
check(doc.body.dataset.theme==="light","56 light theme remains functional");
doc.querySelector('[data-theme-option="dark"]').click();
check(doc.body.dataset.theme==="dark","57 dark theme remains functional");
frame.style.width="390px";await wait(100);
check(doc.documentElement.scrollWidth<=doc.documentElement.clientWidth+2,"58 mobile anniversary view has no horizontal overflow");
check(doc.querySelector("[data-anniversary-filters] button[type=submit]")?.tagName==="BUTTON","59 filter action has button semantics");
check(window.testErrors.length===0,"60 no browser console or unhandled promise errors were recorded");

document.querySelector("#results").textContent=failures.length?`FAIL ${failures.length}/${checks.length}\n${failures.join("\n")}`:`PASS ${checks.length} checks`;
if(failures.length)throw new Error(failures.join("; "));
