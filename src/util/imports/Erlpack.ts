/*
	https://github.com/discord/erlpack/blob/master/js/index.d.ts
	MIT License
	Copyright (c) 2017 Discord
*/
/* eslint-disable @typescript-eslint/no-explicit-any */
// @fc-license-skip

export type ErlpackType = {
    pack: (data: any) => Buffer;
    unpack: <T = any>(data: Buffer) => T;
};

let _cached: ErlpackType | null | undefined = undefined;

/**
 * Returns an ETF pack/unpack implementation. Uses wetf (pure-JS) as the primary implementation.
 * Optionally tries @yukikaze-bot/erlpack (native) first if available, but falls back to wetf.
 */
export function getErlpack(): ErlpackType | null {
    if (_cached !== undefined) return _cached;
    try {
        _cached = require("@yukikaze-bot/erlpack") as ErlpackType;
        return _cached;
    } catch {
        // native erlpack not available; use pure-JS wetf (preferred implementation)
    }
    try {
        const { Packer, Unpacker } = require("wetf");
        const packer = new Packer({ encoding: { array: "list" } });
        const unpacker = new Unpacker();
        _cached = {
            pack: (d: any) => Buffer.from(packer.pack(d)),
            unpack: (b: Buffer) => unpacker.unpack(b) as any,
        };
        // wetf is the preferred implementation, no warning needed
        return _cached;
    } catch (e) {
        console.error("ETF unavailable: ", e);
        _cached = null;
        return null;
    }
}
