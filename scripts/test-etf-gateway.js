/**
 * Quick test that ETF (Erlang Term Format) works on the Gateway WebSocket.
 *
 * Prerequisites:
 *   - @yukikaze-bot/erlpack (optional) or wetf (required) for ETF
 *   - Gateway running (npm run start:gateway on port 3002, or npm start bundle on port 3001)
 *
 * Usage:
 *   cd server
 *   node scripts/test-etf-gateway.js
 *
 * Env:
 *   GATEWAY_URL  WebSocket URL without query. Default: ws://127.0.0.1:3002
 *                (use ws://127.0.0.1:3001 when using npm start / bundle)
 */

const WebSocket = require("ws");

let erlpack = null;
try {
    erlpack = require("@yukikaze-bot/erlpack");
} catch {}
if (!erlpack) {
    try {
        const { Packer, Unpacker } = require("wetf");
        const packer = new Packer({ encoding: { array: "list" } });
        const unpacker = new Unpacker();
        erlpack = {
            pack: (d) => Buffer.from(packer.pack(d)),
            unpack: (b) => unpacker.unpack(b),
        };
    } catch (e) {
        console.error("ETF unavailable: need @yukikaze-bot/erlpack or wetf. Run: npm i wetf");
        process.exit(1);
    }
}

const base = process.env.GATEWAY_URL || "ws://127.0.0.1:3002";
const url = `${base.replace(/\/$/, "")}/?encoding=etf&version=8`;

console.log("Connecting to", url);

const ws = new WebSocket(url);

ws.on("open", () => {
    console.log("Connected with encoding=etf");
});

ws.on("message", (data) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    let msg;
    try {
        msg = erlpack.unpack(buf);
    } catch (e) {
        console.error("Failed to unpack ETF:", e.message);
        ws.close();
        return;
    }
    console.log("Received op", msg.op, msg.op === 10 ? "(Hello)" : msg.op === 11 ? "(Heartbeat_ACK)" : "");

    if (msg.op === 10) {
        // Hello
        const interval = msg.d?.heartbeat_interval;
        if (interval) console.log("heartbeat_interval:", interval, "ms");
        // Send Heartbeat (op 1)
        ws.send(erlpack.pack({ op: 1, d: null }));
    } else if (msg.op === 11) {
        // Heartbeat_ACK
        console.log("ETF test OK: server decoded our Heartbeat and sent Heartbeat_ACK in ETF.");
        ws.close();
    }
});

ws.on("error", (e) => {
    console.error("WebSocket error:", e.message);
    process.exit(1);
});

ws.on("close", (code, reason) => {
    if (code === 1000) {
        console.log("Closed cleanly.");
    } else {
        console.log("Close", code, reason?.toString() || "");
    }
});
