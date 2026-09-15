export type Mode = 'focus' | 'pomodoro';
export type AppTarget = {id:string; name:string; bundleId:string; bundlePath:string; protected:boolean; icon?:string};
export type Profile = {id:string; name:string; color:string; mode:Mode; workMin:number; breakMin:number; rounds:number; apps:AppTarget[]; sites:string[]};
export type Schedule = {id:string; profileId:string; days:number[]; time:string; enabled:boolean; nextRun?:number|null};
export type Session = {id:string; label:string; profileId?:string; mode:Mode; workMs:number; breakMs:number; rounds:number; blocklist:AppTarget[]; siteBlocklist:string[]; startedAt:number; endsAt:number; phaseEndsAt:number; totalMs:number; phase:'work'|'break'|'done'; round:number; enforcing:boolean; events:{t:number;app:string;action:string;count:number}[]; blockCount:number; verifiedMs:number};
export type HistoryEntry = {id:string;label:string;profileId?:string;mode:Mode;startedAt:number;endedAt:number;focusedMs:number;verifiedMs?:number;blocks:number;blocked:string[];blockedSites:string[];outcome:'completed'|'emergency'|'missed'|'failed'|'legacy';detail?:string};
export type Settings = {appearance:'system'|'light'|'dark';notifications:boolean;onboardingCompleted:boolean;systemSites:boolean};
export type ChromeClient = {id:string;name:string;lastSeen:number;revision:string;incognito:boolean;error?:string};
export type Snapshot = {now:number;revision:number;session:Session|null;profiles:Profile[];schedules:Schedule[];history:HistoryEntry[];settings:Settings;health:{engine:boolean;apps:boolean;chrome:ChromeClient[];chromeReady:boolean;pendingRelease:boolean;error:string|null;simulation:boolean};stats:{todayMs:number;weekMs:number;streak:number;sessions:number;totalBlocks:number;byDay:{day:string;ms:number}[]};legacyAvailable:boolean};
export type StartInput = {profileId?:string;label?:string;mode:Mode;workMin:number;breakMin:number;rounds:number;apps:AppTarget[];sites:string[]};
// Renderer API: state(), apps(), start(input), emergency(), saveProfile(profile), deleteProfile(id),
// saveSchedule(schedule), deleteSchedule(id), saveSettings(partial), completeOnboarding(), exportData(),
// importLegacy(), installService(), repairService(), serviceStatus(), installChrome(), openExtension(),
// chooseApp(), openData(), uninstallService(), subscribe(callback)->unsubscribe.
