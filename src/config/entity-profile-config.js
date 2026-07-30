const common = [
  ["identity", "Identity"],
  ["overview", "Overview"],
  ["relationships", "Related entities"],
  ["markets", "Related markets"],
  ["insights", "Related insights"],
];

const CONFIG = Object.freeze({
  team: {
    fields: [
      ["league", "League"], ["conference", "Conference"], ["division", "Division"],
      ["coach", "Coach"], ["venue", "Venue"], ["level", "Level"],
    ],
    sections: [...common, ["roster", "Roster"], ["team-form", "Recent form and results"], ["team-metrics", "Team metrics"], ["schedule", "Schedule"]],
  },
  "national-team": {
    fields: [["league", "Competition"], ["coach", "Coach"], ["venue", "Home venue"], ["nationality", "Country"]],
    sections: [...common, ["roster", "Roster"], ["team-form", "Recent form and results"], ["team-metrics", "Team metrics"], ["schedule", "Schedule"]],
  },
  fighter: {
    fields: [
      ["promotion", "Promotion"], ["weightClass", "Weight class"], ["record", "Record"], ["height", "Height"],
      ["reach", "Reach"], ["age", "Age"], ["stance", "Stance"], ["nationality", "Nationality"],
      ["camp", "Camp"], ["nickname", "Nickname"],
    ],
    sections: [...common, ["fight-history", "Fight history"], ["combat-metrics", "Combat metrics"], ["matchup", "Style and opponent context"]],
  },
  boxer: {
    fields: [
      ["record", "Record"], ["knockoutRate", "KO percentage"], ["decisionRate", "Decision percentage"],
      ["reach", "Reach"], ["height", "Height"], ["stance", "Stance"], ["titles", "Titles"],
      ["sanctioningBodies", "Sanctioning bodies"], ["weightClass", "Weight class"],
    ],
    sections: [...common, ["fight-history", "Fight history"], ["combat-metrics", "Boxing metrics"], ["matchup", "Opponent context"]],
  },
  driver: {
    fields: [
      ["series", "Series"], ["team", "Team"], ["constructor", "Constructor"], ["manufacturer", "Manufacturer"],
      ["vehicleNumber", "Car or bike number"], ["nationality", "Nationality"], ["championshipStanding", "Championship standing"],
    ],
    sections: [...common, ["race-history", "Recent races"], ["driver-metrics", "Driver metrics"], ["track-history", "Track history"], ["schedule", "Upcoming race"]],
  },
  golfer: {
    fields: [["tour", "Tour"], ["worldRanking", "World ranking"], ["nationality", "Nationality"]],
    sections: [...common, ["golf-metrics", "Golf metrics"], ["tournament-history", "Tournament and course history"], ["schedule", "Recent and upcoming events"]],
  },
  "tennis-player": {
    fields: [["tour", "Tour"], ["ranking", "ATP/WTA ranking"], ["preferredHand", "Preferred hand"], ["nationality", "Nationality"]],
    sections: [...common, ["tennis-metrics", "Tennis metrics"], ["surface-splits", "Surface splits"], ["tournament-history", "Tournament and head-to-head history"]],
  },
  coach: {
    fields: [["currentTeam", "Current team"], ["role", "Role"], ["careerHistory", "Career history"]],
    sections: [...common, ["coach-results", "Results and recent trends"], ["coach-history", "Championship and playoff history"], ["style", "Style"]],
  },
  manager: {
    fields: [["organization", "Organization"], ["role", "Role"], ["careerHistory", "Career history"]],
    sections: [...common, ["manager-history", "Career and championships"], ["style", "Style"]],
  },
  promotion: {
    fields: [["sport", "Sport"], ["region", "Region"], ["leader", "Leadership"]],
    sections: [...common, ["schedule", "Upcoming events"], ["champions", "Champions"], ["roster", "Roster"], ["event-history", "Recent and historical cards"]],
  },
  constructor: {
    fields: [["series", "Series"], ["manufacturer", "Manufacturer"], ["base", "Base"]],
    sections: [...common, ["roster", "Drivers"], ["constructor-metrics", "Wins, podiums, and reliability"], ["track-history", "Track strengths"]],
  },
  manufacturer: {
    fields: [["sport", "Sport"], ["series", "Series"], ["base", "Base"]],
    sections: [...common, ["roster", "Related constructors and drivers"], ["manufacturer-metrics", "Competition metrics"]],
  },
  league: {
    fields: [["sport", "Sport"], ["season", "Season"], ["region", "Region"], ["status", "Availability"]],
    sections: [...common, ["standings", "Standings"], ["schedule", "Schedule"], ["leaders", "Statistical leaders"], ["champions", "Champions"]],
  },
  competition: {
    fields: [["sport", "Sport"], ["league", "League"], ["stage", "Stage"], ["season", "Season"]],
    sections: [...common, ["bracket", "Bracket"], ["participants", "Participants"], ["results", "Results"], ["leaders", "Leaders"]],
  },
  venue: {
    fields: [["venueType", "Venue type"], ["location", "Location"], ["surface", "Surface"], ["capacity", "Capacity"]],
    sections: [...common, ["home-entities", "Home teams and competitors"], ["venue-history", "Historical trends"], ["weather", "Weather"]],
  },
  organization: {
    fields: [["sport", "Sport"], ["region", "Region"], ["role", "Role"]],
    sections: [...common, ["competitions", "Competitions"], ["members", "Members"]],
  },
});

const fallback = Object.freeze({
  fields: [["sport", "Sport"], ["league", "League"]],
  sections: common,
});

export function getEntityProfileConfig(type) {
  const selected = CONFIG[type] || fallback;
  return Object.freeze({
    fields: Object.freeze(selected.fields.map((item) => Object.freeze([...item]))),
    sections: Object.freeze(selected.sections.map((item) => Object.freeze([...item]))),
  });
}
