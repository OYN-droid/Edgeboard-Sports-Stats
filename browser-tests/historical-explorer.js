import { HISTORICAL_ITEM_TYPES, HISTORICAL_QUERY_INTENTS, HISTORICAL_VALIDATION_STATES, SPORT_HISTORICAL_CATEGORIES } from "../src/config/historical-config.js";
import { MOCK_HISTORICAL_COVERAGE, MOCK_HISTORICAL_ITEMS } from "../src/data/mock-historical-fixtures.js";
import { mockProviderPayload } from "../src/data/mock-provider.js";
import { mockStatsProviderPayload } from "../src/data/mock-stats-provider.js";
import { createEntityRegistry } from "../src/services/entity-registry-service.js";
import { createHistoricalExplorerService, createHistoricalItem, historicalCoverageLabel, validateHistoricalClaim, validateHistoricalItem } from "../src/services/historical-service.js";
import { parseHistoricalQuery } from "../src/services/historical-query-service.js";
import { createResearchPlan } from "../src/services/research-planner-service.js";
import { createSportsRepository } from "../src/services/sports-repository.js";
import { createStatsRepository } from "../src/services/stats-provider.js";

const checks=[]; const failures=[]; const check=(condition,label)=>{checks.push(label);if(!condition)failures.push(label);};
const wait=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const sportsRepository=createSportsRepository(mockProviderPayload);
const statsRepository=createStatsRepository(mockStatsProviderPayload,{generatedAt:"2026-07-30T12:30:00.000Z"});
const entityRegistry=createEntityRegistry();
const service=createHistoricalExplorerService({sportsRepository,statsRepository,entityRegistry});

HISTORICAL_VALIDATION_STATES.forEach((state,index)=>check(Boolean(validateHistoricalClaim({validationStatus:state,claim:"bounded sample high"}).label),`${index+1} ${state} has reusable validation language`));
HISTORICAL_ITEM_TYPES.forEach((type,index)=>check(typeof type==="string"&&type.length>0,`${index+8} historical type ${type} is normalized`));
HISTORICAL_QUERY_INTENTS.forEach((intent,index)=>check(typeof intent==="string"&&intent.includes("_")||intent==="head_to_head_history",`${index+34} historical intent ${intent} is registered`));

check(MOCK_HISTORICAL_COVERAGE.length>=10,"64 coverage fixtures span supported team individual combat and motorsports");
check(MOCK_HISTORICAL_COVERAGE.every((entry)=>entry.source.sample&&entry.providerLimitations.length),"65 every coverage fixture discloses sample source and limitations");
check(service.getHistoricalCoverage({leagueId:"wnba"}).eventCompleteness==="current-season-only","66 current-season-only coverage is explicit");
check(service.getHistoricalCoverage({leagueId:"ufc"}).eventCompleteness==="partial","67 partial historical coverage is explicit");
check(service.getHistoricalCoverage({leagueId:"missing"}).validationStatus==="unknown","68 missing league coverage fails safely");
check(historicalCoverageLabel({...service.getHistoricalCoverage({leagueId:"wnba"}),validationStatus:"verified_complete",earliestSeason:"2010",latestCompleteSeason:"2026"}).includes("2010–2026"),"69 complete bounded coverage label exposes dates");
check(!service.getHistoricalCoverage({leagueId:"mlb"}).allTimeClaimsSupported,"70 sample MLB coverage cannot support all-time claims");
check(service.getHistoricalCoverage({leagueId:"ufc"}).missingSeasons.length===0,"71 missing-season collection is represented");

const verified=validateHistoricalClaim({validationStatus:"verified_complete",claim:"bounded competition record"});
check(verified.eligible&&verified.allowedRecordWording,"72 verified bounded record wording is allowed");
check(validateHistoricalClaim({validationStatus:"provider_asserted",claim:"provider record"}).preferredHighWording.includes("provider"),"73 provider assertion retains attribution wording");
check(!validateHistoricalClaim({validationStatus:"dataset_only",claim:"all-time record"}).eligible,"74 dataset-only all-time claim is rejected");
check(validateHistoricalClaim({validationStatus:"dataset_only",claim:"available dataset high"}).preferredHighWording.includes("available dataset"),"75 dataset high uses limited wording");
check(validateHistoricalClaim({validationStatus:"partial_coverage",claim:"notable performance"}).label.includes("Partial"),"76 partial coverage is visibly labeled");
check(!validateHistoricalClaim({validationStatus:"unknown",claim:"record"}).eligible,"77 unknown record claim is suppressed");
check(!validateHistoricalClaim({validationStatus:"dataset_only",claim:"league record"}).eligible,"77.a dataset-only league-record wording is suppressed");
check(!validateHistoricalClaim({validationStatus:"provider_asserted",claim:"passing record"}).eligible,"77.b unattributed provider record wording is suppressed");
check(validateHistoricalClaim({validationStatus:"provider_asserted",claim:"provider-recognized passing record"}).eligible,"77.c attributed provider record wording is allowed");
const verifiedFixture=MOCK_HISTORICAL_ITEMS.find((item)=>item.id==="history-verified-fixture-record");
const unboundedVerified=createHistoricalItem({...verifiedFixture,id:"history-unbounded-verified",scope:{}},{entityRegistry,sportsRepository,coverage:service.getHistoricalCoverage({leagueId:"wnba"})});
check(!validateHistoricalItem(unboundedVerified,sportsRepository).valid,"77.d verified record wording requires explicit bounded coverage");
const mismatchedEvent=createHistoricalItem({...MOCK_HISTORICAL_ITEMS[0],id:"history-mismatched-event",eventIds:["different-event"]},{entityRegistry,sportsRepository,coverage:service.getHistoricalCoverage({leagueId:"wnba"})});
check(!validateHistoricalItem(mismatchedEvent,sportsRepository).valid,"77.e historical event IDs require matching normalized evidence");
const incompleteEvent=createHistoricalItem({...MOCK_HISTORICAL_ITEMS[0],id:"history-incomplete-event",supportingEvidence:MOCK_HISTORICAL_ITEMS[0].supportingEvidence.map((entry)=>({...entry,status:"postponed"}))},{entityRegistry,sportsRepository,coverage:service.getHistoricalCoverage({leagueId:"wnba"})});
check(!validateHistoricalItem(incompleteEvent,sportsRepository).valid,"77.f postponed evidence cannot support a historical event claim");
check(!service.index.has("history-incomplete-all-time"),"78 incomplete fixture never enters renderable history index");
check(service.getItem("history-mlb-pitching-high").correction.oldValue===9&&service.getItem("history-mlb-pitching-high").correction.newValue===8,"79 correction retains old and new values");
check(service.getItem("history-mlb-pitching-high").edgeTrust.researchQuality.isProbability===false,"80 Research Quality is not probability");

const records=service.getRecordResults({});
check(records.verified.some((item)=>item.id==="history-verified-fixture-record"),"81 verified record is separated");
check(records.providerAsserted.some((item)=>item.id==="history-provider-record"),"82 provider-asserted record is separated");
check(records.datasetHighs.some((item)=>item.id==="history-mlb-pitching-high"),"83 dataset highs and corrected highs are separated");
check(records.unsupported.some((item)=>item.id==="history-incomplete-all-time"),"84 unsupported all-time query has an honest result group");
check(service.searchHistoricalItems({leagueId:"wnba",pageSize:1}).items.length===1&&service.searchHistoricalItems({leagueId:"wnba",pageSize:1}).hasMore,"85 record and item pagination is bounded");
check(service.searchHistoricalItems({leagueId:"wnba"}).items.every((item)=>item.leagueId==="wnba"),"86 selected league never falls back to unrelated history");
check(service.searchHistoricalItems({leagueId:"ufc"}).items.every((item)=>item.leagueId==="ufc"),"87 UFC history excludes Boxing");
check(service.searchHistoricalItems({leagueId:"f1"}).items.every((item)=>item.leagueId==="f1"),"88 Formula 1 history excludes NASCAR");
check(service.searchHistoricalItems({query:"Lakers"}).items.some((item)=>item.id==="history-nba-lakers-rivalry"),"89 historical search finds canonical rivalry evidence");

const rankings=service.getPerformanceRankings({});
check(rankings.length>=5&&rankings.every((item)=>item.components[0].id==="raw_value"),"90 performance ranking exposes deterministic raw components");
check(rankings.map((item)=>item.id).join("|")===service.getPerformanceRankings({}).map((item)=>item.id).join("|"),"91 performance ranking is stable");
check(service.getPerformanceRankings({sortDirection:"asc"})[0].rankingMethod.includes("lower is better"),"92 lower-is-better ranking is explicit");
check(rankings.every((item)=>item.rank===1),"93 incomparable sport stat and unit cohorts are never ranked against each other");
check(service.getPerformanceRankings({leagueId:"wnba"})[0].titleData.value===30,"94 WNBA single-game scoring sample high is sourced");
check(service.getPerformanceRankings({leagueId:"nfl"})[0].titleData.value===331,"95 NFL passing performance is sourced");
check(service.getPerformanceRankings({leagueId:"ufc"})[0].titleData.unit==="seconds","96 UFC fastest finish preserves unit");
check(service.getPerformanceRankings({leagueId:"nascar-cup"})[0].titleData.value===22,"97 NASCAR position-gain performance is sourced");
const tiedPerformance={...MOCK_HISTORICAL_ITEMS[0],id:"history-wnba-tied-performance",entityIds:["wnba-aja-wilson"],eventIds:[],title:"Tied scoring performance in the available WNBA sample",titleData:{value:30,rank:1},supportingEvidence:[{id:"hist-tie",label:"Completed tied sample row",values:{points:30},eventId:null,occurredAt:"2026-07-29T12:30:00.000Z",sourceId:"edgeboard-history-fixtures-v1",status:"completed"}],metadata:{qualificationStatus:"qualified",qualificationRule:"Completed sample game"}};
const unqualifiedPerformance={...tiedPerformance,id:"history-wnba-unqualified-performance",title:"Unqualified scoring performance in the available WNBA sample",titleData:{value:99},metadata:{qualificationStatus:"unqualified",qualificationRule:"Minimum participation not met"}};
const qualificationService=createHistoricalExplorerService({sportsRepository,statsRepository,entityRegistry,items:[...MOCK_HISTORICAL_ITEMS,tiedPerformance,unqualifiedPerformance]});
const qualifiedWnba=qualificationService.getPerformanceRankings({leagueId:"wnba"});
check(qualifiedWnba.filter((item)=>item.titleData.value===30).every((item)=>item.rank===1),"97.a equal values share a deterministic rank");
check(!qualifiedWnba.some((item)=>item.id==="history-wnba-unqualified-performance"),"97.b explicitly unqualified performances are excluded");
check(qualifiedWnba.every((item)=>item.qualification.rule&&item.components.length===1),"97.c qualification and all raw ranking components are disclosed");

const championships=service.getChampionshipHistory({});
check(championships.some((item)=>item.metadata.competitionFormat==="playoffs"),"98 playoff championship format is explicit");
check(championships.some((item)=>item.metadata.competitionFormat==="points_championship"),"99 points championship format is explicit");
check(championships.some((item)=>item.metadata.competitionFormat==="fight_title_lineage"),"100 combat title lineage is explicit");
check(championships.find((item)=>item.id==="history-wnba-championship").metadata.bracketAvailable===false,"101 missing bracket is not invented");
check(championships.find((item)=>item.id==="history-wnba-championship").titleData.runnerUp==="New York Liberty","102 explicit runner-up is preserved");

const rivalry=service.getRivalryHistory("rivalry-mls-miami-orlando");
check(rivalry.status==="ready"&&rivalry.classification==="configured_rivalry","103 configured rivalry is distinguished");
check(service.getRivalryHistory("rivalry-f1-teammate-sample").classification==="notable_repeated_matchup","104 teammate comparison is not silently promoted to official rivalry");
check(service.getRivalryHistory("missing").status==="not-classified","105 unsupported rivalry has honest state");
check(service.getRivalryHistory("rivalry-boxing-sample-trilogy").events[0].titleData.meetings===3,"106 boxing trilogy requires three explicit meetings");
check(rivalry.events.every((item)=>item.entityIds.includes("MIA")&&item.entityIds.includes("ORL")),"107 rivalry timeline retains canonical participants");

const dynasties=service.getDynastyCandidates({leagueId:"wnba"});
check(dynasties.length===1&&dynasties[0].state.includes("candidate"),"108 dynasty language remains candidate wording");
check(dynasties[0].criteria.minimumTitles===2&&dynasties[0].criteria.windowSeasons===4,"109 dynasty criteria are disclosed");
check(!/verified dynasty/i.test(dynasties[0].title),"110 unsupported dynasty wording is suppressed");
check(service.getComebackResults({leagueId:"mls"})[0].titleData.deficit===2,"111 soccer comeback requires supplied deficit");
check(service.getComebackResults({leagueId:"nascar-cup"})[0].titleData.startingPosition===25,"112 motorsport comeback requires start and finish positions");
check(service.getUpsetResults({leagueId:"atp"})[0].metadata.baselineType==="seed","113 upset requires an explicit baseline");
check(service.getUpsetResults({leagueId:"mls"}).length===0,"114 missing upset baseline prevents narrative classification");

const timeline=service.getEntityTimeline("mlb-gerrit-cole");
check(timeline.events.length&&timeline.events[0].correction.oldValue===9,"115 corrected entity timeline retains correction");
check(timeline.events.every((item,index,array)=>!index||new Date(array[index-1].date)<=new Date(item.date)),"116 timeline is chronologically stable");
check(service.getCareerTimeline("missing").events.length===0,"117 missing career timeline fails safely");
check(service.getHistoricalVisualizations("history-mlb-pitching-high")[0].lazy,"118 historical visualization is lazy");
check(service.getHistoricalVisualizations("history-mlb-pitching-high")[0].accessibleSummary.includes("supporting historical evidence"),"119 visualization includes accessible summary and table alternative");

const season=service.getSeasonSummary("basketball","wnba","2026");
check(season.completedEvents>0&&season.participantCount>0,"120 season summary derives counts from completed rows");
check(season.standings.length===0&&season.standingsMessage.includes("unavailable"),"121 unavailable standings are not invented");
const comparison=service.compareSeasons("basketball","wnba",["2025","2026"]);
check(comparison.warnings.some((warning)=>warning.includes("lacks completed rows")),"122 season comparison warns on missing season coverage");
check(comparison.method.includes("matching canonical stat definitions"),"123 cross-season comparison method is documented");
check(comparison.ruleComparisonStatus==="unavailable"&&comparison.statDefinitionComparisonStatus==="canonical-matches-only"&&comparison.eraAdjustment===null,"123.a unavailable rule changes and absent era adjustment are explicit");
check(comparison.warnings.some((warning)=>warning.includes("Rule differences"))&&comparison.warnings.some((warning)=>warning.includes("Stat-definition")),"123.b season comparison discloses unavailable rule and definition changes");

const queryExamples=[
  ["Yankees championship history","championship_history"], ["Greatest UFC comebacks","comeback_history"], ["Compare this driver's 2025 and 2026 seasons","season_comparison"],
  ["Longest NHL point streaks","streak_history"], ["Fastest knockouts on UFC cards","single_event_record"], ["Lakers rivalry history","rivalry_history"], ["Show this athlete's career timeline","athlete_career_timeline"],
];
queryExamples.forEach(([query,intent],index)=>check(parseHistoricalQuery(query,{entityRegistry,sportsRepository,leagueId:"wnba"}).intent===intent,`${124+index} historical parser resolves ${intent}`));
const allTime=parseHistoricalQuery("Who has the all-time WNBA scoring record?",{entityRegistry,sportsRepository,leagueId:"wnba",sportId:"basketball"});
check(allTime.requiredValidationLevel==="verified_complete"&&allTime.unsupportedPortions.length,"131 all-time query exposes required validation and unsupported portions");
check(parseHistoricalQuery("Lakers versus 76ers history",{entityRegistry,sportsRepository,leagueId:"nba"}).entityIds.length===2,"132 historical query retains canonical entities");
check(service.getItem("history-wnba-scoring-high")&&service.buildHistoricalViewModel(service.getItem("history-wnba-scoring-high")).actions.find((action)=>action.type==="entity")?.profileSystem==="athlete","132.a historical athlete actions reuse the canonical athlete profile system");
const plan=createResearchPlan({query:"Explore this rivalry",mode:"stats",currentLeague:sportsRepository.getLeague("mls"),historicalQuery:parseHistoricalQuery("Explore this rivalry",{entityRegistry,sportsRepository,leagueId:"mls"})});
check(plan.historicalQuery&&plan.requirements.supportingEvidence.some((item)=>item.includes("historical coverage")),"133 Edge Intelligence plan retains historical scope and coverage boundary");

const beforeCalls=service.providerCalls; const cachedA=service.searchHistoricalItems({leagueId:"wnba"}); const callsAfter=service.providerCalls; const cachedB=service.searchHistoricalItems({leagueId:"wnba"});
check(cachedA===cachedB&&service.providerCalls===callsAfter&&callsAfter>=beforeCalls,"134 immutable historical query cache is reused");
service.invalidateCorrection({leagueId:"wnba"});
check(service.searchHistoricalItems({leagueId:"wnba"})!==cachedA,"135 targeted correction invalidates affected cached results");
const cachedMlb=service.searchHistoricalItems({leagueId:"mlb"}); const cachedNfl=service.searchHistoricalItems({leagueId:"nfl"}); service.invalidateCorrection({itemId:"history-mlb-pitching-high"});
check(service.searchHistoricalItems({leagueId:"mlb"})!==cachedMlb&&service.searchHistoricalItems({leagueId:"nfl"})===cachedNfl,"135.a item correction invalidates only cached results containing that item");
const first=service.searchHistoricalItemsAsync({leagueId:"wnba"}); const second=service.searchHistoricalItemsAsync({leagueId:"mlb"}); let cancelled=false; try{await first;}catch(error){cancelled=error.name==="AbortError";} check(cancelled&&(await second).items.every((item)=>item.leagueId==="mlb"),"136 stale historical request cannot overwrite newer scope");

Object.entries(SPORT_HISTORICAL_CATEGORIES).forEach(([sport,categories],index)=>check(categories.length>=6,`${137+index} ${sport} uses sport-specific historical categories`));
check(!SPORT_HISTORICAL_CATEGORIES.boxing.some((label)=>/submission/i.test(label)),"147 Boxing categories exclude submissions");
check(!SPORT_HISTORICAL_CATEGORIES.motorsport.some((label)=>/touchdown|playoff/i.test(label)),"148 motorsports categories are race-specific");

const frame=document.querySelector("#app"); frame.contentWindow.addEventListener("error",(event)=>window.testErrors.push(`app: ${event.message}`)); frame.contentWindow.addEventListener("unhandledrejection",(event)=>window.testErrors.push(`app: ${String(event.reason)}`));
if(frame.contentDocument?.readyState!=="complete")await new Promise((resolve)=>frame.addEventListener("load",resolve,{once:true})); await wait(1200);
const app=frame.contentDocument; const win=frame.contentWindow;
check(!app.querySelector("#historicalExplorer").hidden,"149 deep-linked Historical Explorer opens on refresh");
check(app.body.classList.contains("history-active"),"150 history route activates one canonical view state");
check(app.querySelector("#historicalCoverage").textContent.includes("Current-season data only"),"151 selected league coverage is visible");
check([...app.querySelectorAll("[data-historical-item]")].every((card)=>/WNBA|wnba|championship/i.test(card.textContent)),"152 WNBA deep link does not render unrelated league history");
check(app.querySelector("#historicalNav a")?.tagName==="A","153 historical navigation uses semantic links");
app.querySelector('a[href="/history/records"]')?.click(); await wait(80);
check(win.location.pathname==="/history/records"&&app.querySelector("#historicalExplorerTitle").textContent==="Records Explorer","154 record route updates without losing app state");
check(app.querySelectorAll("#historicalExplorerContent section").length>=2,"155 records remain separated by validation class");
win.history.pushState({},"","/history/items/history-mlb-pitching-high"); win.dispatchEvent(new win.PopStateEvent("popstate")); await wait(80);
check(app.querySelector("#historicalExplorerTitle").textContent.includes("strikeout"),"156 item deep link restores by stable ID");
check(app.querySelector("table caption")&&app.querySelectorAll("table th[scope]").length,"157 evidence table has caption and scoped headers");
check(app.querySelector(".historical-timeline")?.tagName==="OL","158 timeline has ordered-list alternative");
check(app.querySelector(".historical-card .validation-label")&&app.querySelector(".historical-card .sample-badge"),"159 validation and sample state are not color-only");
check(app.querySelector(".historical-card .data-warning")?.textContent.includes("Corrected result"),"159.a correction state and old/new values are visible");
win.history.pushState({},"","/history/items/missing"); win.dispatchEvent(new win.PopStateEvent("popstate")); await wait(50);
check(app.querySelector("#historicalExplorerContent [role='alert']"),"160 invalid item route fails safely");
win.history.pushState({},"","/history/basketball/wnba/seasons/2026"); win.dispatchEvent(new win.PopStateEvent("popstate")); await wait(50);
check(app.querySelector("#historicalExplorerTitle").textContent.includes("2026 season"),"161 season deep link restores");
win.history.pushState({},"","/history/performances"); win.dispatchEvent(new win.PopStateEvent("popstate")); await wait(80);
check(app.querySelector("#historicalExplorerContent .data-warning")?.textContent.includes("matching sport, league, statistic, and unit cohorts"),"161.a performance ranking method is visibly disclosed");
check([...app.querySelectorAll("#historicalExplorerContent table th")].some((cell)=>cell.textContent==="Raw component"),"161.b all ranking components are visible in the accessible table");
check([...app.querySelectorAll("#historicalExplorerContent table th")].some((cell)=>cell.textContent==="Coverage")&&[...app.querySelectorAll("#historicalExplorerContent table tbody tr")].every((row)=>/available data|current-season|complete for|partial historical/i.test(row.textContent)),"161.b.1 every performance claim exposes its own coverage boundary");
win.history.pushState({},"","/history/rivalries"); win.dispatchEvent(new win.PopStateEvent("popstate")); await wait(80);
check([...app.querySelectorAll("#historicalExplorerContent section h2")].some((heading)=>heading.textContent.includes("not classified as a rivalry")),"161.c direct head-to-head history is separated from configured rivalries");
app.querySelector('[data-theme-option="light"]')?.click(); check(app.body.dataset.theme==="light","162 light theme works in history"); app.querySelector('[data-theme-option="dark"]')?.click(); check(app.body.dataset.theme==="dark","163 dark theme works in history");
for(const width of [1280,768,390]){frame.style.width=`${width}px`;await wait(30);check(app.documentElement.scrollWidth<=app.documentElement.clientWidth,`164.${width} history has no viewport overflow`);}
app.documentElement.style.fontSize="200%";await wait(30);check(app.documentElement.scrollWidth<=app.documentElement.clientWidth,"165 history supports 200% large text");app.documentElement.style.fontSize="";
check(app.querySelector("#historicalExplorer").getAttribute("tabindex")==="-1"&&app.querySelector("#saveHistoricalExplorer").tagName==="BUTTON","166 focus target and save control are semantic");
check(app.querySelector("#todayMarketGrid"),"167 Today’s Markets remains in the application and independent from on-demand history");
check(app.querySelector("#researchAnswer"),"168 Edge Intelligence remains available");
check(app.querySelector("#personalWorkspaceView"),"169 workspace remains available");
check(window.testErrors.length===0,`170 no browser console or unhandled promise errors${window.testErrors.length?`: ${window.testErrors.join(" | ")}`:""}`);

const results=document.querySelector("#results"); results.dataset.status=failures.length?"failed":"passed"; results.textContent=failures.length?`FAIL (${failures.length}/${checks.length})\n${failures.join("\n")}`:`PASS (${checks.length} checks)\n${checks.join("\n")}`;
frame.remove();
