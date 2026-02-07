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

const router = Router({ mergeParams: true });

const adminUserSelect = [
    "id",
    "username",
    "discriminator",
    "avatar",
    "bot",
    "created_at",
    "disabled",
    "deleted",
    "email",
    "flags",
    "public_flags",
    "rights",
    "mfa_enabled",
    "webauthn_enabled",
    "verified",
    "bio",
    "premium",
    "premium_type",
    "premium_since",
] as const;

/** GET /_spacebar/admin/users/:user_id - Get one user (admin view). */
router.get(
    "/",
    route({
        right: ["OPERATOR", "MANAGE_USERS"],
        responses: {
            200: {},
            403: { body: "APIErrorResponse" },
            404: { body: "APIErrorResponse" },
        },
    }),
    async (req: Request, res: Response) => {
        const { user_id } = req.params as { user_id: string };
        const user = await User.findOne({
            where: { id: user_id },
            select: [...adminUserSelect, "data"],
        });
        if (!user) {
            return res.status(404).json({ entity: "User", id: user_id, message: "User not found" });
        }
        const out: Record<string, unknown> = {};
        for (const k of adminUserSelect) {
            out[k] = (user as unknown as Record<string, unknown>)[k];
        }
        // Do not expose data.hash; valid_tokens_since can be useful for admin
        out.valid_tokens_since = (user.data as { valid_tokens_since?: Date })?.valid_tokens_since;
        return res.json(out);
    },
);

/** PATCH /_spacebar/admin/users/:user_id - Update user (admin). */
router.patch(
    "/",
    route({
        right: ["OPERATOR", "MANAGE_USERS"],
        responses: {
            200: {},
            403: { body: "APIErrorResponse" },
            404: { body: "APIErrorResponse" },
        },
    }),
    async (req: Request, res: Response) => {
        const { user_id } = req.params as { user_id: string };
        const body = (req.body || {}) as {
            username?: string;
            discriminator?: string;
            email?: string;
            password?: string;
            rights?: string | number;
            disabled?: boolean;
            deleted?: boolean;
            flags?: number;
            public_flags?: number;
            bio?: string;
        };

        const user = await User.findOne({
            where: { id: user_id },
            select: ["id", "username", "discriminator", "email", "rights", "disabled", "deleted", "flags", "public_flags", "bio", "data"],
        });
        if (!user) {
            return res.status(404).json({ entity: "User", id: user_id, message: "User not found" });
        }

        const updates: Partial<User> = {};
        if (body.username !== undefined) updates.username = body.username;
        if (body.discriminator !== undefined) {
            const d = body.discriminator.toString().padStart(4, "0");
            if (Number(d) < 1 || Number(d) >= 10000) {
                return res.status(400).json({ message: "Discriminator must be between 1 and 9999" });
            }
            updates.discriminator = d;
        }
        if (body.email !== undefined) updates.email = body.email;
        if (body.disabled !== undefined) updates.disabled = body.disabled;
        if (body.deleted !== undefined) updates.deleted = body.deleted;
        if (body.flags !== undefined) updates.flags = body.flags;
        if (body.public_flags !== undefined) updates.public_flags = body.public_flags;
        if (body.bio !== undefined) updates.bio = body.bio;
        if (body.rights !== undefined) updates.rights = String(body.rights);

        if (body.password !== undefined && body.password !== "") {
            const hash = await bcrypt.hash(body.password, 12);
            updates.data = {
                ...(user.data || {}),
                hash,
                valid_tokens_since: new Date(),
            };
        }

        if (Object.keys(updates).length > 0) {
            await User.update({ id: user_id }, updates as Record<string, unknown>);
        }

        const updated = await User.findOne({
            where: { id: user_id },
            select: [...adminUserSelect],
        });
        return res.json(updated || { id: user_id, ...updates });
    },
);

export default router;
