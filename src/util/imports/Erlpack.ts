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
 * Returns an ETF pack/unpack implementation. Tries @yukikaze-bot/erlpack (native) first;
 * if unavailable, uses wetf (pure-JS) so ETF works without the node-pre-gyp/npmlog chain.
 */
export function getErlpack(): ErlpackType | null {
    if (_cached !== undefined) return _cached;
    try {
        _cached = require("@yukikaze-bot/erlpack") as ErlpackType;
        return _cached;
    } catch {
        // native erlpack not available (optionalDep skipped or build failed); use pure-JS wetf
    }
    try {
        const { Packer, Unpacker } = require("wetf");
        const packer = new Packer({ encoding: { array: "list" } });
        const unpacker = new Unpacker();
        _cached = {
            pack: (d: any) => Buffer.from(packer.pack(d)),
            unpack: (b: Buffer) => unpacker.unpack(b) as any,
        };
        console.log("ETF: using wetf (pure-JS); @yukikaze-bot/erlpack not available.");
        return _cached;
    } catch (e) {
        console.log("ETF unavailable: ", e);
        _cached = null;
        return null;
    }
}
