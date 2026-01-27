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
import { Guild, Member, Role, Snowflake, User } from "@spacebar/util";
import { Request, Response, Router } from "express";
import { In } from "typeorm";

const router = Router({ mergeParams: true });

router.post(
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
        const { guild_id } = req.params as { guild_id: string };
        const body = (req.body || {}) as { user_id?: string; make_owner?: boolean; make_admin?: boolean };
        const user_id = body.user_id ?? req.user_id!;

        const [guild, user] = await Promise.all([Guild.findOne({ where: { id: guild_id } }), User.findOne({ where: { id: user_id } })]);
        if (!guild) {
            return res.status(404).json({ entity: "Guild", id: guild_id, message: "Guild not found" });
        }
        if (!user) {
            return res.status(404).json({ entity: "User", id: user_id, message: "User not found" });
        }

        let member = await Member.findOne({
            where: { id: user_id, guild_id },
            relations: { roles: true },
        });

        if (!member) {
            await Member.create({
                id: user_id,
                guild_id,
                nick: undefined,
                roles: [Role.create({ id: guild_id })],
                joined_at: new Date(),
                deaf: false,
                mute: false,
                pending: false,
                bio: "",
                settings: {
                    guild_id: null,
                    mute_config: null,
                    mute_scheduled_events: false,
                    flags: 0,
                    hide_muted_channels: false,
                    notify_highlights: 0,
                    channel_overrides: {},
                    message_notifications: guild.default_message_notifications,
                    mobile_push: true,
                    muted: false,
                    suppress_everyone: false,
                    suppress_roles: false,
                    version: 0,
                },
            }).save();
            await Guild.increment({ id: guild_id }, "member_count", 1);
            member = await Member.findOne({ where: { id: user_id, guild_id }, relations: { roles: true } })!;
        }

        if (body.make_owner) {
            await Guild.update({ id: guild_id }, { owner_id: user_id });
        }

        if (body.make_admin) {
            let adminRole = await Role.findOne({
                where: { guild_id, permissions: In(["8", "9"]) },
            });
            if (!adminRole) {
                const [maxPosRow] = await Role.find({
                    where: { guild_id },
                    select: ["position"],
                    order: { position: "DESC" },
                    take: 1,
                });
                adminRole = Role.create({
                    id: Snowflake.generate(),
                    guild_id,
                    name: "Instance administrator",
                    color: 0,
                    colors: { primary_color: 0 },
                    hoist: false,
                    managed: false,
                    mentionable: false,
                    permissions: "8",
                    position: (maxPosRow?.position ?? 0) + 1,
                    icon: undefined,
                    unicode_emoji: undefined,
                    flags: 0,
                });
                await adminRole.save();
            }
            if (member && !(member.roles ?? []).some((r) => r.id === adminRole!.id)) {
                await Member.addRole(user_id, guild_id, adminRole.id);
            }
        }

        res.json({ entity: "Guild", id: guild_id, message: "Guild join forced" });
    },
);

export default router;
