export type Result = 0 | 1 | 2;
export type Counter = { wins:number; losses:number; draws:number; games:number; winRate:number|null };
export type Participant = { id:string; country:number; result:Result; name?:string };
export type Match = { id:string; season:number; start:number; map:string; players:Participant[] };
export type Profile = { id:string; name:string; avatar:string; rank:number; mmr:number; officialTotal:number; officialWins:number; officialLosses:number };
export type PlayerStats = Profile & { total:Counter; factions:Record<string,Counter> };
export type MatrixCell = Counter & { own:string; enemy:string };
export type Season = { id:number; name:string; start:number; end:number };
export type AnalyticsGroup = {total:Counter; factions:Record<string,Counter>; uniqueMatches:number};
export type TrendPoint = AnalyticsGroup & {start:number; end:number; label:string};
export type Analytics = {
 maps:(AnalyticsGroup & {name:string})[];
 trend:{bucket:string; timezone:string; points:TrendPoint[]};
 comparisons:(Profile & AnalyticsGroup)[];
 headToHead:(AnalyticsGroup & {a:string;b:string})[];
 tiers:Record<string,(AnalyticsGroup & {key:string;name:string;players:number})[]>;
};
export type BaseStatsResponse = { seasons:Season[]; season:Season|null; snapshot:string|null; cutoff:number|null; meta:{scanned:number; players:number; missing:number; excluded:number; unknown:number; [key:string]:unknown}; progress:{state:string; stage:string; done:number; total:number; error?:string}|null; overview:Counter & {uniqueMatches:number}; players:PlayerStats[]; selected:PlayerStats|null; matrix:MatrixCell[]; groups:{key:string; name:string; color:string}[]; usage:(Counter & {key:string;name:string;color:string;share:number})[]; window:string; scope:string; granularity:string; stale:boolean; automation?:{enabled:boolean; schedule?:string} };

export type StatsResponse = BaseStatsResponse & {filters:{map:string;segment:string};mapOptions:string[];analytics:Analytics};
