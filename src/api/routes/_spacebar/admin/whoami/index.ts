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
import { getRights } from "@spacebar/util";
import { Request, Response, Router } from "express";

const router = Router({ mergeParams: true });

router.get(
    "/",
    route({
        responses: {
            200: {},
        },
    }),
    async (req: Request, res: Response) => {
        const rights = await getRights(req.user_id!);
        res.json({
            id: req.user_id,
            username: req.user?.username,
            discriminator: req.user?.discriminator,
            bot: req.user?.bot ?? false,
            flags: req.user?.flags ?? 0,
            rights: (rights?.bitfield != null ? Number(rights.bitfield) : req.user?.rights) ?? 0,
            mfa_enabled: req.user?.mfa_enabled ?? false,
            webauthn_enabled: req.user?.webauthn_enabled ?? false,
        });
    },
);

export default router;
