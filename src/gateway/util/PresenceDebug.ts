/*
	Presence debug logging: one line per event when LOG_PRESENCE_DEBUG=1.
	Writes to server/presence-debug.log (or console if file write fails).
*/

import fs from "fs";
import path from "path";

function isEnabled(): boolean {
    return (process.env.LOG_PRESENCE_DEBUG || "").trim() === "1";
}
const LOG_DIR = path.join(process.cwd(), "presence-debug.log");

function writeLine(msg: string): void {
    if (!isEnabled()) return;
    const line = `[PresenceDebug] ${new Date().toISOString()} ${msg}\n`;
    process.stdout.write(line);
    try {
        fs.appendFileSync(LOG_DIR, line);
    } catch {
        // already logged to stdout
    }
}

export function presenceLog(...args: unknown[]): void {
    if (!isEnabled()) return;
    writeLine(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
}
