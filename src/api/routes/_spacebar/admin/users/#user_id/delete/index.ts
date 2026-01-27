/*
	Spacebar: A FOSS re-implementation and extension of the Discord.com backend.
	Copyright (C) 2023 Spacebar and Spacebar Contributors

	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published
	by the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { route } from "@spacebar/api";
import { emitEvent, Message, User } from "@spacebar/util";
import { Request, Response, Router } from "express";
import { In, IsNull } from "typeorm";

const router = Router({ mergeParams: true });

router.get(
    "/",
    route({
        right: "OPERATOR",
        responses: {
            200: {},
            403: { body: "APIErrorResponse" },
            404: { body: "APIErrorResponse" },
        },
    }),
    async (req: Request, res: Response) => {
        const { user_id } = req.params as { user_id: string };
        const chunkSize = Math.min(500, Math.max(1, parseInt(req.query.messageDeleteChunkSize as string) || 100));

        const user = await User.findOne({ where: { id: user_id } });
        if (!user) {
            return res.status(404).json({ entity: "User", id: user_id, message: "User not found" });
        }

        await User.update({ id: user_id }, { data: { valid_tokens_since: new Date() }, deleted: true, disabled: true, rights: "0" });

        const pairs = await Message.createQueryBuilder("m")
            .select("m.channel_id", "channel_id")
            .addSelect("m.guild_id", "guild_id")
            .where("m.author_id = :id", { id: user_id })
            .distinct(true)
            .getRawMany();

        for (const { channel_id, guild_id } of pairs) {
            if (!channel_id) continue;
            while (true) {
                const batch = await Message.find({
                    where: {
                        author_id: user_id,
                        channel_id,
                        guild_id: guild_id == null ? IsNull() : guild_id,
                    },
                    take: chunkSize,
                    select: ["id"],
                });
                const ids = batch.map((m) => m.id);
                if (ids.length === 0) break;

                await Message.delete({ id: In(ids) });
                await emitEvent({
                    event: "MESSAGE_DELETE_BULK",
                    channel_id,
                    guild_id: guild_id ?? undefined,
                    data: { ids, channel_id, guild_id: guild_id ?? undefined },
                });
            }
        }

        res.json({ ok: true });
    },
);

export default router;
