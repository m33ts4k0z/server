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
import { Sticker } from "@spacebar/util";
import { Request, Response, Router } from "express";

const router = Router({ mergeParams: true });

router.get(
    "/",
    route({
        right: "OPERATOR",
        responses: {
            200: {},
            403: { body: "APIErrorResponse" },
        },
    }),
    async (req: Request, res: Response) => {
        const stickers = await Sticker.find({
            select: ["id", "name", "description", "available", "tags", "pack_id", "guild_id", "user_id", "type", "format_type"],
        });
        res.json(
            stickers.map((s) => ({
                id: s.id,
                name: s.name,
                description: s.description,
                available: s.available,
                tags: s.tags,
                pack_id: s.pack_id,
                guild_id: s.guild_id,
                user_id: s.user_id,
                type: s.type,
                format_type: s.format_type,
            })),
        );
    },
);

export default router;
