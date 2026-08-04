import { KNOWLEDGE_GRAPH_EDGE_TYPES, KNOWLEDGE_GRAPH_NODE_TYPES, KNOWLEDGE_GRAPH_SCORES } from "../src/config/knowledge-graph-config.js";
import { mockProviderPayload } from "../src/data/mock-provider.js";
import { mockStatsProviderPayload } from "../src/data/mock-stats-provider.js";
import { createAnniversaryService } from "../src/services/anniversary-service.js";
import { createEntityRegistry } from "../src/services/entity-registry-service.js";
import { createHistoricalExplorerService } from "../src/services/historical-service.js";
import { createInsightService } from "../src/services/insight-service.js";
import { createKnowledgeGraphService, validateKnowledgeGraph } from "../src/services/knowledge-graph-service.js";
import { createSportsRepository } from "../src/services/sports-repository.js";
import { createStatsRepository } from "../src/services/stats-provider.js";
import { createStoryEngine } from "../src/services/story-engine.js";

const checks=[];const failures=[];const check=(condition,label)=>{checks.push(label);if(!condition)failures.push(label);};
const wait=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const frame=document.querySelector("#app");
frame.contentWindow.addEventListener("error",(event)=>window.testErrors.push(`app: ${event.message}`));
frame.contentWindow.addEventListener("unhandledrejection",(event)=>window.testErrors.push(`app: ${String(event.reason)}`));

const entityRegistry=createEntityRegistry();
const sportsRepository=createSportsRepository(mockProviderPayload);
const statsRepository=createStatsRepository(mockStatsProviderPayload,{generatedAt:"2026-08-03T12:00:00.000Z"});
const insightService=createInsightService(statsRepository,sportsRepository);
const storyEngine=createStoryEngine({insightService,sportsRepository,statsRepository,entityRegistry,clock:()=>new Date(2026,7,3,12)});
const graphService=createKnowledgeGraphService({entityRegistry,sportsRepository,statsRepository,insightService,storyEngine});

check(KNOWLEDGE_GRAPH_NODE_TYPES.includes("entity")&&KNOWLEDGE_GRAPH_NODE_TYPES.includes("research_session")&&KNOWLEDGE_GRAPH_NODE_TYPES.includes("workspace"),"1 graph schema covers canonical entities and existing research systems");
check(KNOWLEDGE_GRAPH_EDGE_TYPES.includes("explicit_relationship")&&KNOWLEDGE_GRAPH_EDGE_TYPES.includes("has_current_market"),"2 graph edge vocabulary is normalized");
check(!Object.keys(KNOWLEDGE_GRAPH_SCORES).some((key)=>/confidence|probability|edge$/i.test(key)),"3 deterministic ranking excludes betting confidence and probability");

const lakers=graphService.getEntityGraph("LAL",{mode:"stats",currentDate:new Date(2026,7,3)});
check(lakers.status==="ready"&&lakers.center.id==="LAL","4 canonical team is the graph center");
check(lakers.nodes.some((item)=>item.id==="entity:coach-sample-lakers"),"5 explicit coach relationship is connected");
check(lakers.nodes.some((item)=>item.id==="entity:venue-crypto-arena"),"6 explicit venue relationship is connected");
check(lakers.nodes.some((item)=>item.id==="entity:league-nba"),"7 explicit league relationship is connected");
check(!lakers.nodes.some((item)=>item.id==="entity:PHI"),"8 same-league entities are not inferred without a registry relationship");
check(lakers.nodes.filter((item)=>item.type==="market").length===0,"9 Stats mode never attaches markets");
const scheduledTeam=graphService.getEntityGraph("PHI",{mode:"stats",currentDate:new Date(2026,7,3)});
check(scheduledTeam.nodes.some((item)=>item.type==="event"&&item.eventIds.includes("PHI-CHI")),"10 normalized participant IDs connect team events");
check(lakers.nodes.some((item)=>item.type==="visualization")&&lakers.nodes.some((item)=>item.type==="comparison")&&lakers.nodes.some((item)=>item.type==="leaderboard"),"11 existing visual comparison and leaderboard paths are exposed");
check(lakers.nodes.some((item)=>item.type==="research_session")&&lakers.nodes.some((item)=>item.type==="workspace"),"12 research session and workspace paths are exposed");
check(lakers.nodes.every((item,index,all)=>all.findIndex((other)=>other.id===item.id)===index),"13 graph nodes are deduplicated");
check(lakers.edges.every((item)=>item.from==="LAL"&&item.explicit&&lakers.nodes.some((node)=>node.id===item.to)),"14 every edge resolves from the canonical center to a visible supported node");
check(validateKnowledgeGraph(lakers,entityRegistry).valid,"15 generated graph passes runtime validation");

const ufc=graphService.getEntityGraph("promotion-ufc",{mode:"both",currentDate:new Date(2026,7,3)});
check(ufc.nodes.some((item)=>item.id==="entity:ufc-sample-fighter-a"),"16 promotion connects explicitly registered fighters");
check(!ufc.nodes.some((item)=>item.entityIds.includes("boxing-sample-boxer-a")),"17 UFC graph excludes Boxing entities");
const f1=graphService.getEntityGraph("f1-max-verstappen",{mode:"both",currentDate:new Date(2026,7,3)});
check(f1.nodes.some((item)=>item.id==="entity:RBR"),"18 driver connects to canonical constructor");
check(!f1.nodes.some((item)=>item.entityIds.includes("nascar-sample-driver")),"19 Formula 1 graph excludes unrelated motorsports entities");
const nhl=graphService.getEntityGraph("league-nhl",{mode:"stats",currentDate:new Date(2026,7,3)});
check(nhl.nodes.some((item)=>item.id==="entity:venue-madison-square-garden"),"20 reverse traversal requires an explicit incoming registry reference");
check(nhl.edges.some((item)=>item.to==="entity:venue-madison-square-garden"&&item.type==="explicit_reverse_relationship"),"20a reverse canonical relationship remains explicit in the edge model");
check(graphService.getEntityGraph("missing-entity").status==="not-found","21 invalid canonical center fails safely");
check(entityRegistry.resolveProviderEntity("phi",{leagueId:"nba"})?.id==="PHI","21a provider ID reconciliation returns one canonical scoped entity");
check(entityRegistry.resolveProviderEntity("ferrari")===null,"21b ambiguous provider identity never merges silently");
check(lakers===graphService.getEntityGraph("LAL",{mode:"stats",currentDate:new Date(2026,7,3)}),"22 identical deterministic graph request uses cache");
check(lakers.nextResearch.length>0&&lakers.nextResearch.every((item)=>lakers.nodes.includes(item)),"23 next-research recommendations are a ranked graph subset");
check(lakers.sections.map((item)=>item.id).every((id,index,ids)=>index===0||["entities","current","evidence","research-tools"].indexOf(ids[index-1])<["entities","current","evidence","research-tools"].indexOf(id)),"24 non-empty section order is deterministic");
check(lakers.source.sample&&lakers.warnings[0].includes("canonical IDs"),"25 sample status and relationship limits are disclosed");

const historicalService=createHistoricalExplorerService({sportsRepository,statsRepository,entityRegistry});
const anniversaryService=createAnniversaryService({historicalService,sportsRepository,statsRepository,entityRegistry,clock:()=>new Date(2026,7,3,12)});
graphService.connectHistorical({historicalService,anniversaryService});
const historicalGraph=graphService.getEntityGraph("f1-max-verstappen",{mode:"stats",currentDate:new Date(2026,7,3)});
check(historicalGraph.generatedFrom.includes("Historical Explorer")&&historicalGraph.generatedFrom.includes("On This Day"),"26 historical systems connect through the same service");
check(historicalGraph.nodes.filter((item)=>["historical_item","anniversary"].includes(item.type)).every((item)=>item.entityIds.includes("f1-max-verstappen")),"27 historical links require an exact canonical entity ID");
check(historicalGraph.nodes.some((item)=>item.type==="research_path"&&item.label==="Historical Explorer"),"28 historical exploration remains a supported path when no item is available");

const invalid={...lakers,nodes:[{id:"bad",type:"invented",label:"Bad",reason:"Bad",entityIds:[],source:{id:"test"}}],edges:[]};
check(!validateKnowledgeGraph(invalid,entityRegistry).valid,"29 malformed graph data is rejected");
const aborted=new AbortController();aborted.abort();
try{await graphService.getEntityGraphAsync("LAL",{}, {signal:aborted.signal});check(false,"30 aborted async graph cannot overwrite a current page");}catch(error){check(error.name==="AbortError","30 aborted async graph cannot overwrite a current page");}

await new Promise((resolve)=>frame.addEventListener("load",resolve,{once:true}));await wait(900);
const doc=frame.contentDocument;const win=frame.contentWindow;
check(doc.querySelector('[data-knowledge-graph="nba-luka-doncic"]'),"31 athlete profile renders its connected graph");
check(doc.querySelector('.knowledge-graph h2')?.textContent==="What should I research next?","32 entity page answers the next-research question");
check(doc.querySelector('.knowledge-graph .sample-badge')?.textContent.includes("Deterministic sample"),"33 graph sample data is visibly labeled");
check(doc.querySelectorAll('.knowledge-graph [data-graph-node]').length>0,"34 graph UI renders supported connected paths");
check([...doc.querySelectorAll('.knowledge-graph [data-graph-node]')].every((item)=>item.querySelector('small')?.textContent),"35 every graph card explains why it is connected");
check([...doc.querySelectorAll('.knowledge-graph a,.knowledge-graph button')].every((item)=>item.tagName==="A"||item.type==="button"),"36 graph actions use semantic links or buttons");
check(doc.querySelector('.knowledge-graph [data-graph-workspace]')?.type==="button","37 workspace snapshot action has button semantics");
check(doc.querySelector('.knowledge-graph [data-open-visual]')?.type==="button","38 visual analytics action reuses the existing visual control");

const teamLink=doc.querySelector('.knowledge-graph [data-open-entity="LAL"]');
check(Boolean(teamLink),"39 explicit team relationship links to the canonical entity profile");
teamLink?.click();await wait(500);
check(new URL(win.location.href).searchParams.get("entityProfile")==="LAL"&&doc.querySelector('[data-knowledge-graph="LAL"]'),"40 canonical profile navigation keeps the graph centered on the selected entity");
const researchAction=doc.querySelector('[data-knowledge-graph="LAL"] [data-graph-type="research_session"] [data-graph-query]');
check(Boolean(researchAction),"41 structured research-session path is clickable");
researchAction?.click();await wait(900);
check(!doc.body.classList.contains("profile-active")&&!doc.querySelector("#entityProfileView:not([hidden])"),"42 starting connected research exits the profile without leaving stale page state");
check(doc.querySelector("#queryInput")?.value==="Research Los Angeles Lakers","43 connected research preserves deterministic canonical query context");
check(doc.querySelector("#researchAnswerContent .knowledge-graph")||doc.querySelector("#statsResultContent .knowledge-graph"),"44 research result remains connected to the next-research graph");

doc.querySelector('[data-theme-option="light"]')?.click();
check(doc.body.dataset.theme==="light","45 light theme remains functional");
doc.querySelector('[data-theme-option="dark"]')?.click();
check(doc.body.dataset.theme==="dark","46 dark theme remains functional");
frame.style.width="390px";await wait(150);
check(doc.documentElement.scrollWidth<=doc.documentElement.clientWidth+2,"47 mobile connected graph has no horizontal overflow");
const visibleGraph=doc.querySelector('#researchAnswerContent .knowledge-graph,#statsResultContent .knowledge-graph');
const firstGraphAction=visibleGraph?.querySelector('a,button');firstGraphAction?.focus();
check(doc.activeElement===firstGraphAction,"48 graph actions are keyboard focusable");
check(window.testErrors.length===0,"49 no browser console or unhandled promise errors were recorded");

document.querySelector("#results").textContent=failures.length?`FAIL ${failures.length}/${checks.length}\n${failures.join("\n")}\nConsole: ${window.testErrors.join(" | ")}`:`PASS ${checks.length} checks`;
if(failures.length)throw new Error(failures.join("; "));
