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
import { User } from "@spacebar/util";
import { Request, Response, Router } from "express";
import bcrypt from "bcrypt";
import crypto from "node:crypto";

const router = Router({ mergeParams: true });

router.get(
    "/",
    route({
        right: ["OPERATOR", "MANAGE_USERS"],
        responses: {
            200: {},
            403: { body: "APIErrorResponse" },
        },
    }),
    async (req: Request, res: Response) => {
        const users = await User.find({
            select: ["id", "username", "discriminator", "bot", "created_at", "mfa_enabled", "webauthn_enabled", "disabled", "deleted", "rights"],
        });
        res.json(
            users.map((u) => ({
                id: u.id,
                username: u.username,
                discriminator: u.discriminator,
                bot: u.bot,
                created_at: u.created_at,
                mfa_enabled: u.mfa_enabled,
                webauthn_enabled: u.webauthn_enabled,
                disabled: u.disabled,
                deleted: u.deleted,
                rights: u.rights,
            })),
        );
    },
);

/** POST /_spacebar/admin/users - Create user (admin). Body: username, email?, password?, rights? */
router.post(
    "/",
    route({
        right: ["OPERATOR", "MANAGE_USERS"],
        responses: {
            201: {},
            403: { body: "APIErrorResponse" },
        },
    }),
    async (req: Request, res: Response) => {
        const body = (req.body || {}) as { username?: string; email?: string; password?: string; rights?: string | number };
        const username = body.username?.trim();
        if (!username || username.length < 2) {
            return res.status(400).json({ message: "username is required (min 2 characters)" });
        }
        let password = body.password;
        const generatedPassword = !password;
        if (!password) {
            password = crypto
                .randomBytes(16)
                .toString("base64")
                .replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c] ?? "");
        }
        const hash = await bcrypt.hash(password, 12);
        const user = await User.register({
            username,
            email: body.email,
            password: hash,
            bot: false,
        });
        if (body.rights !== undefined) {
            await User.update({ id: user.id }, { rights: String(body.rights) });
        }
        const created = await User.findOne({
            where: { id: user.id },
            select: ["id", "username", "discriminator", "email", "rights", "created_at"],
        });
        const payload = created ? { ...created } : { id: user.id };
        if (generatedPassword) (payload as Record<string, unknown>).generated_password = password;
        res.status(201).json(payload);
    },
);

export default router;
