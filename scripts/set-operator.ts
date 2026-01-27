/*
	Script to grant OPERATOR rights to a user.
	Usage: npx ts-node scripts/set-operator.ts <user_id>
*/

import { initDatabase, User } from "../src/util";

async function main() {
    const userId = process.argv[2];
    if (!userId) {
        console.error("Usage: npx ts-node scripts/set-operator.ts <user_id>");
        console.error("Example: npx ts-node scripts/set-operator.ts 123456789012345678");
        process.exit(1);
    }

    await initDatabase();

    const user = await User.findOne({ where: { id: userId } });
    if (!user) {
        console.error(`User with ID ${userId} not found.`);
        process.exit(1);
    }

    // OPERATOR is bit 0, value is 1
    // Setting OPERATOR automatically grants ALL_RIGHTS when Rights class is instantiated
    await User.update({ id: userId }, { rights: "1" });

    console.log(`✓ Granted OPERATOR rights to user: ${user.username}#${user.discriminator} (${userId})`);
    console.log("You may need to log out and log back in for the changes to take effect.");
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
